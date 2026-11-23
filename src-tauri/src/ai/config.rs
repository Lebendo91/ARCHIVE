//! Configured providers (table `ai_providers`, specification §15.4): a name, a model and preferences, none of
//! them secret. The key is in the credential store (see [`super::secret`]); `secret_ref` only names its entry,
//! and is set only while the system store holds it.

use rusqlite::{Connection, OptionalExtension, Row, Transaction, params};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::provider::{ProviderKind, check_model};
use super::secret::{KeyStorage, Secrets, entry_name};
use crate::error::{AppError, AppResult};
use crate::util::{clean_name, new_id, now_ms, validate_id};

const NAME_MAX_CHARS: usize = 120;
pub const ANSWER_TOKENS_MIN: u32 = 256;
pub const ANSWER_TOKENS_MAX: u32 = 200_000;
/// Configured providers at most: one per account is the usual case.
pub const PROVIDERS_MAX: i64 = 20;

/// Preferences of a provider; nothing here is secret.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
#[ts(export)]
pub struct ProviderPreferences {
    /// Longest answer, in tokens (the provider bills what it writes).
    pub max_output_tokens: u32,
    /// Anthropic: when the model declines, the API itself retries on the Claude model Anthropic recommends.
    pub refusal_fallback: bool,
    /// What the provider said of the chosen model when it was picked from its list.
    pub model_max_output_tokens: Option<u32>,
    pub model_refusal_fallback: bool,
}

impl Default for ProviderPreferences {
    fn default() -> Self {
        Self {
            max_output_tokens: 16_000,
            refusal_fallback: true,
            model_max_output_tokens: None,
            model_refusal_fallback: false,
        }
    }
}

impl ProviderPreferences {
    fn check(&self) -> AppResult<()> {
        if !(ANSWER_TOKENS_MIN..=ANSWER_TOKENS_MAX).contains(&self.max_output_tokens) {
            return Err(AppError::InvalidInput(format!(
                "the longest answer must be between {ANSWER_TOKENS_MIN} and {ANSWER_TOKENS_MAX} tokens"
            )));
        }
        Ok(())
    }

    /// Tokens asked for an answer: the preference, within what the model accepts.
    pub fn answer_tokens(&self) -> u32 {
        self.model_max_output_tokens
            .map_or(self.max_output_tokens, |limit| {
                self.max_output_tokens.min(limit)
            })
            .max(1)
    }
}

/// A configured provider, as the interface sees it: never its key.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AiProviderView {
    pub id: String,
    pub provider: ProviderKind,
    pub display_name: String,
    /// Empty until the user chooses one.
    pub model: String,
    pub preferences: ProviderPreferences,
    pub is_default: bool,
    /// Where its key is; `null` without key.
    pub key: Option<KeyStorage>,
    #[ts(type = "number")]
    pub created_at: i64,
    #[ts(type = "number")]
    pub updated_at: i64,
}

/// A provider as stored.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProviderRow {
    pub id: String,
    pub provider: ProviderKind,
    pub display_name: String,
    pub model: String,
    pub secret_ref: Option<String>,
    pub preferences: ProviderPreferences,
    pub is_default: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

impl ProviderRow {
    pub fn view(&self, secrets: &Secrets) -> AiProviderView {
        let name = entry_name(&self.id);
        let key = if secrets.in_session(&name) {
            Some(KeyStorage::Session)
        } else {
            self.secret_ref.as_ref().map(|_| KeyStorage::System)
        };
        AiProviderView {
            id: self.id.clone(),
            provider: self.provider,
            display_name: self.display_name.clone(),
            model: self.model.clone(),
            preferences: self.preferences.clone(),
            is_default: self.is_default,
            key,
            created_at: self.created_at,
            updated_at: self.updated_at,
        }
    }
}

#[derive(Debug, Clone, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct ProviderCreate {
    pub provider: ProviderKind,
    pub display_name: String,
    #[serde(default)]
    #[ts(optional)]
    pub model: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct ProviderPatch {
    #[serde(default)]
    #[ts(optional)]
    pub display_name: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub model: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub preferences: Option<ProviderPreferences>,
    /// Only `true` is meaningful: another provider becomes the default by being chosen.
    #[serde(default)]
    #[ts(optional)]
    pub is_default: Option<bool>,
}

const COLUMNS: &str = "id, provider, display_name, model, secret_ref, preferences_json, is_default, created_at, updated_at";

fn row(row: &Row<'_>) -> rusqlite::Result<ProviderRow> {
    let preferences: String = row.get(5)?;
    Ok(ProviderRow {
        id: row.get(0)?,
        provider: row.get(1)?,
        display_name: row.get(2)?,
        model: row.get(3)?,
        secret_ref: row.get(4)?,
        // Preferences this version cannot read fall back to the defaults rather than hiding the provider.
        preferences: serde_json::from_str(&preferences).unwrap_or_default(),
        is_default: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

pub fn list(connection: &Connection) -> AppResult<Vec<ProviderRow>> {
    let mut statement = connection.prepare(&format!(
        "SELECT {COLUMNS} FROM ai_providers ORDER BY is_default DESC, created_at, id"
    ))?;
    let rows = statement.query_map([], row)?.collect::<Result<_, _>>()?;
    Ok(rows)
}

pub fn get(connection: &Connection, id: &str) -> AppResult<ProviderRow> {
    validate_id(id, "provider")?;
    connection
        .query_row(
            &format!("SELECT {COLUMNS} FROM ai_providers WHERE id = ?1"),
            [id],
            row,
        )
        .optional()?
        .ok_or(AppError::NotFound {
            entity: "AI provider",
        })
}

/// The provider used when none is named: the default one.
pub fn default_provider(connection: &Connection) -> AppResult<Option<ProviderRow>> {
    Ok(connection
        .query_row(
            &format!(
                "SELECT {COLUMNS} FROM ai_providers ORDER BY is_default DESC, created_at, id LIMIT 1"
            ),
            [],
            row,
        )
        .optional()?)
}

fn clean_model(model: &str) -> AppResult<String> {
    let model = model.trim();
    if !model.is_empty() {
        check_model(model)?;
    }
    Ok(model.to_owned())
}

fn make_default(transaction: &Transaction<'_>, id: &str) -> AppResult<()> {
    transaction.execute(
        "UPDATE ai_providers SET is_default = 0 WHERE is_default = 1 AND id <> ?1",
        [id],
    )?;
    transaction.execute("UPDATE ai_providers SET is_default = 1 WHERE id = ?1", [id])?;
    Ok(())
}

pub fn create(transaction: &Transaction<'_>, input: &ProviderCreate) -> AppResult<ProviderRow> {
    let display_name = clean_name(&input.display_name, "provider name", NAME_MAX_CHARS)?;
    let model = clean_model(input.model.as_deref().unwrap_or(""))?;
    let count: i64 =
        transaction.query_row("SELECT count(*) FROM ai_providers", [], |row| row.get(0))?;
    if count >= PROVIDERS_MAX {
        return Err(AppError::InvalidInput(format!(
            "at most {PROVIDERS_MAX} providers can be configured"
        )));
    }
    let id = new_id();
    let now = now_ms();
    let preferences = serde_json::to_string(&ProviderPreferences::default())
        .map_err(|error| AppError::Internal(error.to_string()))?;
    transaction.execute(
        "INSERT INTO ai_providers (id, provider, display_name, model, secret_ref, preferences_json, is_default,
                                   created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, NULL, ?5, 0, ?6, ?6)",
        params![id, input.provider, display_name, model, preferences, now],
    )?;
    // The first provider is the default one.
    if count == 0 {
        make_default(transaction, &id)?;
    }
    get(transaction, &id)
}

pub fn update(
    transaction: &Transaction<'_>,
    id: &str,
    patch: &ProviderPatch,
) -> AppResult<ProviderRow> {
    let current = get(transaction, id)?;
    let display_name = match &patch.display_name {
        Some(name) => clean_name(name, "provider name", NAME_MAX_CHARS)?,
        None => current.display_name,
    };
    let model = match &patch.model {
        Some(model) => clean_model(model)?,
        None => current.model,
    };
    let preferences = match &patch.preferences {
        Some(preferences) => {
            preferences.check()?;
            preferences.clone()
        }
        None => current.preferences,
    };
    let preferences = serde_json::to_string(&preferences)
        .map_err(|error| AppError::Internal(error.to_string()))?;
    transaction.execute(
        "UPDATE ai_providers SET display_name = ?2, model = ?3, preferences_json = ?4, updated_at = ?5
         WHERE id = ?1",
        params![id, display_name, model, preferences, now_ms()],
    )?;
    if patch.is_default == Some(true) {
        make_default(transaction, id)?;
    }
    get(transaction, id)
}

/// Records whether the system store holds the key of a provider.
pub fn set_secret_ref(
    transaction: &Transaction<'_>,
    id: &str,
    stored: bool,
) -> AppResult<ProviderRow> {
    get(transaction, id)?;
    let secret_ref = stored.then(|| entry_name(id));
    transaction.execute(
        "UPDATE ai_providers SET secret_ref = ?2, updated_at = ?3 WHERE id = ?1",
        params![id, secret_ref, now_ms()],
    )?;
    get(transaction, id)
}

/// Removes a provider; the oldest remaining one becomes the default. The caller removes its key.
pub fn delete(transaction: &Transaction<'_>, id: &str) -> AppResult<ProviderRow> {
    let removed = get(transaction, id)?;
    transaction.execute("DELETE FROM ai_providers WHERE id = ?1", [id])?;
    if removed.is_default
        && let Some(next) = default_provider(transaction)?
    {
        make_default(transaction, &next.id)?;
    }
    Ok(removed)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::secret::{Secret, tests::mock_vault};
    use crate::db::Database;

    fn database() -> (tempfile::TempDir, Database) {
        let dir = tempfile::tempdir().expect("temporary directory");
        let (database, _) =
            Database::open(&dir.path().join("archive.db"), &dir.path().join("backups"))
                .expect("database");
        (dir, database)
    }

    #[test]
    fn providers_are_configured_without_any_secret_in_the_database() {
        let (_dir, database) = database();
        let secrets = Secrets::new(Some(mock_vault()));
        let first = database
            .write(|transaction| {
                create(
                    transaction,
                    &ProviderCreate {
                        provider: ProviderKind::Anthropic,
                        display_name: "  Anthropic  ".to_owned(),
                        model: Some("claude-opus-5-5".to_owned()),
                    },
                )
            })
            .expect("created");
        assert!(first.is_default, "the first provider is the default one");
        assert_eq!(first.display_name, "Anthropic");
        assert_eq!(first.view(&secrets).key, None);

        let second = database
            .write(|transaction| {
                create(
                    transaction,
                    &ProviderCreate {
                        provider: ProviderKind::Gemini,
                        display_name: "Gemini".to_owned(),
                        model: None,
                    },
                )
            })
            .expect("created");
        assert!(!second.is_default);
        assert_eq!(second.model, "");

        // The key goes to the store; the database only names the entry.
        let storage = secrets.store(
            &entry_name(&second.id),
            Secret::new("AIza-secret-0002".to_owned()),
        );
        assert_eq!(storage, KeyStorage::System);
        let second = database
            .write(|transaction| set_secret_ref(transaction, &second.id, true))
            .expect("recorded");
        assert_eq!(second.view(&secrets).key, Some(KeyStorage::System));
        let dump: String = database
            .read(|connection| {
                Ok(connection.query_row(
                    "SELECT group_concat(id || provider || display_name || model || coalesce(secret_ref, '') || preferences_json) FROM ai_providers",
                    [],
                    |row| row.get(0),
                )?)
            })
            .expect("dump");
        assert!(!dump.contains("AIza-secret-0002"), "{dump}");
        assert!(dump.contains(&format!("ai-provider:{}", second.id)));

        let patched = database
            .write(|transaction| {
                update(
                    transaction,
                    &second.id,
                    &ProviderPatch {
                        model: Some("gemini-test".to_owned()),
                        preferences: Some(ProviderPreferences {
                            max_output_tokens: 4_000,
                            model_max_output_tokens: Some(2_000),
                            ..ProviderPreferences::default()
                        }),
                        is_default: Some(true),
                        ..ProviderPatch::default()
                    },
                )
            })
            .expect("updated");
        assert!(patched.is_default);
        assert_eq!(
            patched.preferences.answer_tokens(),
            2_000,
            "the model's limit wins"
        );
        let listed = database.read(list).expect("list");
        assert_eq!(
            listed.iter().filter(|provider| provider.is_default).count(),
            1
        );
        assert_eq!(listed[0].id, second.id, "the default provider comes first");

        let removed = database
            .write(|transaction| delete(transaction, &second.id))
            .expect("deleted");
        assert_eq!(removed.secret_ref, Some(entry_name(&second.id)));
        let remaining = database.read(list).expect("list");
        assert_eq!(remaining.len(), 1);
        assert!(
            remaining[0].is_default,
            "another provider became the default"
        );
    }

    #[test]
    fn invalid_configurations_are_refused() {
        let (_dir, database) = database();
        for (name, model) in [("", "claude"), ("Nom", "models/../secret"), ("Nom", "a b")] {
            let result = database.write(|transaction| {
                create(
                    transaction,
                    &ProviderCreate {
                        provider: ProviderKind::Openai,
                        display_name: name.to_owned(),
                        model: Some(model.to_owned()),
                    },
                )
            });
            assert!(
                matches!(result, Err(AppError::InvalidInput(_))),
                "{name} {model}"
            );
        }
        let created = database
            .write(|transaction| {
                create(
                    transaction,
                    &ProviderCreate {
                        provider: ProviderKind::Openai,
                        display_name: "OpenAI".to_owned(),
                        model: None,
                    },
                )
            })
            .expect("created");
        let result = database.write(|transaction| {
            update(
                transaction,
                &created.id,
                &ProviderPatch {
                    preferences: Some(ProviderPreferences {
                        max_output_tokens: 10,
                        ..ProviderPreferences::default()
                    }),
                    ..ProviderPatch::default()
                },
            )
        });
        assert!(matches!(result, Err(AppError::InvalidInput(_))));
        assert!(matches!(
            database.read(|connection| get(connection, &new_id())),
            Err(AppError::NotFound { .. })
        ));
        // A provider stored by another version with a kind this one does not know cannot be inserted anyway.
        let result = database.write(|transaction| {
            Ok(transaction.execute(
                "INSERT INTO ai_providers (id, provider, display_name, created_at, updated_at) VALUES ('x', 'mistral', 'M', 0, 0)",
                [],
            )?)
        });
        assert!(result.is_err());
    }
}

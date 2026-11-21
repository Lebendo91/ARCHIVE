//! Application settings (specification §15): typed values stored as JSON under a key.

use rusqlite::{Connection, OptionalExtension, Transaction, params};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::error::AppResult;
use crate::util::now_ms;

const LANGUAGE_KEY: &str = "general.language";

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum Language {
    #[default]
    Fr,
    En,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AppSettings {
    pub language: Language,
}

#[derive(Debug, Clone, Default, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct SettingsPatch {
    #[serde(default)]
    #[ts(optional)]
    pub language: Option<Language>,
}

fn read_value<T: for<'de> Deserialize<'de>>(
    connection: &Connection,
    key: &str,
) -> AppResult<Option<T>> {
    let stored: Option<String> = connection
        .query_row(
            "SELECT setting_value FROM app_settings WHERE setting_key = ?1",
            [key],
            |row| row.get(0),
        )
        .optional()?;
    Ok(stored.and_then(|text| match serde_json::from_str(&text) {
        Ok(value) => Some(value),
        Err(error) => {
            // A value that this version cannot read must not block the application: the default applies.
            log::warn!("ignoring invalid setting {key}: {error}");
            None
        }
    }))
}

fn write_value<T: Serialize>(transaction: &Transaction<'_>, key: &str, value: &T) -> AppResult<()> {
    let text = serde_json::to_string(value)
        .map_err(|error| crate::error::AppError::Internal(error.to_string()))?;
    transaction.execute(
        "INSERT INTO app_settings (setting_key, setting_value, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT (setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = excluded.updated_at",
        params![key, text, now_ms()],
    )?;
    Ok(())
}

/// Settings in force: stored values, or defaults for the missing ones.
pub fn load(connection: &Connection) -> AppResult<AppSettings> {
    Ok(AppSettings {
        language: read_value(connection, LANGUAGE_KEY)?.unwrap_or_default(),
    })
}

pub fn update(transaction: &Transaction<'_>, patch: &SettingsPatch) -> AppResult<AppSettings> {
    if let Some(language) = patch.language {
        write_value(transaction, LANGUAGE_KEY, &language)?;
    }
    load(transaction)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::testing::open_temporary;

    #[test]
    fn defaults_apply_until_a_value_is_stored() {
        let (_dir, database) = open_temporary();
        assert_eq!(database.read(load).expect("load").language, Language::Fr);
        let updated = database
            .write(|tx| {
                update(
                    tx,
                    &SettingsPatch {
                        language: Some(Language::En),
                    },
                )
            })
            .expect("update");
        assert_eq!(updated.language, Language::En);
        assert_eq!(database.read(load).expect("reload").language, Language::En);
    }

    #[test]
    fn an_unreadable_stored_value_falls_back_to_the_default() {
        let (_dir, database) = open_temporary();
        database
            .write(|tx| {
                tx.execute(
                    "INSERT INTO app_settings VALUES ('general.language', '\"klingon\"', 0)",
                    [],
                )?;
                Ok(())
            })
            .expect("store invalid value");
        assert_eq!(database.read(load).expect("load").language, Language::Fr);
    }

    #[test]
    fn unknown_fields_in_a_patch_are_rejected() {
        let parsed: Result<SettingsPatch, _> =
            serde_json::from_str(r#"{"language":"en","theme":"pink"}"#);
        assert!(parsed.is_err());
    }
}

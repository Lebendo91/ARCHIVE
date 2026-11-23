//! Conversations with the assistant (specification §14.6): questions, answers and, with each answer, the
//! passages that were sent (reference and short excerpt), so that its citations can always be checked.

use rusqlite::{Connection, OptionalExtension, Row, Transaction, params};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::provider::{ChatRole, Finish, ProviderError, ProviderKind, Usage};
use super::retrieval::{AssistantScope, SourcePassage};
use crate::error::{AppError, AppResult};
use crate::repo::text_enum;
use crate::util::{new_id, now_ms, validate_id};

pub const QUESTION_MAX_CHARS: usize = 8_000;
const TITLE_MAX_CHARS: usize = 80;
pub const CONVERSATIONS_PAGE: i64 = 200;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum MessageStatus {
    Complete,
    /// Being written.
    Streaming,
    /// Stopped by the user, or ARCHIVE closed while it was written.
    Interrupted,
    Failed,
    /// Declined by the model.
    Refused,
    /// Stopped by the provider's filters.
    Blocked,
}
text_enum!(MessageStatus {
    Complete => "complete",
    Streaming => "streaming",
    Interrupted => "interrupted",
    Failed => "failed",
    Refused => "refused",
    Blocked => "blocked",
});

/// Who answered, how, and at what cost in tokens.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export)]
pub struct AnswerDetails {
    pub provider: Option<ProviderKind>,
    pub provider_name: Option<String>,
    /// The model asked for.
    pub model: Option<String>,
    /// The model that wrote the answer, when the provider names it.
    pub served_by: Option<String>,
    /// Anthropic's fallback: the model that declined before another one continued.
    pub declined_by: Option<String>,
    pub usage: Option<Usage>,
    pub finish: Option<Finish>,
    pub error: Option<ProviderError>,
    /// Whether the conversation so far was sent with the question.
    pub history_sent: bool,
    /// Whether the user had shared documents or notes with the question.
    pub scope_shared: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ConversationMessage {
    pub id: String,
    pub role: ChatRole,
    pub content: String,
    pub status: MessageStatus,
    pub sources: Vec<SourcePassage>,
    pub details: AnswerDetails,
    #[ts(type = "number")]
    pub created_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ConversationSummary {
    pub id: String,
    pub title: String,
    #[ts(type = "number")]
    pub created_at: i64,
    #[ts(type = "number")]
    pub updated_at: i64,
    #[ts(type = "number")]
    pub messages: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Conversation {
    pub id: String,
    pub title: String,
    pub scope: AssistantScope,
    #[ts(type = "number")]
    pub created_at: i64,
    #[ts(type = "number")]
    pub updated_at: i64,
    pub messages: Vec<ConversationMessage>,
}

/// A question as the user typed it, checked.
pub fn clean_question(question: &str) -> AppResult<String> {
    let question = question.trim();
    if question.is_empty() {
        return Err(AppError::InvalidInput("the question is empty".to_owned()));
    }
    if question.chars().count() > QUESTION_MAX_CHARS {
        return Err(AppError::InvalidInput(format!(
            "the question is longer than {QUESTION_MAX_CHARS} characters"
        )));
    }
    if question
        .chars()
        .any(|character| character.is_control() && !matches!(character, '\n' | '\t' | '\r'))
    {
        return Err(AppError::InvalidInput(
            "the question contains control characters".to_owned(),
        ));
    }
    Ok(question.to_owned())
}

/// A title from the first question: its first line, shortened.
fn title_of(question: &str) -> String {
    let line = question
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .unwrap_or("…");
    let line: String = line.split_whitespace().collect::<Vec<_>>().join(" ");
    if line.chars().count() <= TITLE_MAX_CHARS {
        return line;
    }
    let cut: String = line.chars().take(TITLE_MAX_CHARS).collect();
    format!("{}…", cut.trim_end())
}

fn json<T: Serialize>(value: &T) -> AppResult<String> {
    serde_json::to_string(value).map_err(|error| AppError::Internal(error.to_string()))
}

fn message(row: &Row<'_>) -> rusqlite::Result<ConversationMessage> {
    let sources: String = row.get(4)?;
    let details: String = row.get(5)?;
    Ok(ConversationMessage {
        id: row.get(0)?,
        role: row.get(1)?,
        content: row.get(2)?,
        status: row.get(3)?,
        sources: serde_json::from_str(&sources).unwrap_or_default(),
        details: serde_json::from_str(&details).unwrap_or_default(),
        created_at: row.get(6)?,
    })
}

pub fn list(connection: &Connection) -> AppResult<Vec<ConversationSummary>> {
    let mut statement = connection.prepare(
        "SELECT c.id, c.title, c.created_at, c.updated_at,
                (SELECT count(*) FROM conversation_messages m WHERE m.conversation_id = c.id)
         FROM conversations c ORDER BY c.updated_at DESC, c.id LIMIT ?1",
    )?;
    let rows = statement
        .query_map([CONVERSATIONS_PAGE], |row| {
            Ok(ConversationSummary {
                id: row.get(0)?,
                title: row.get(1)?,
                created_at: row.get(2)?,
                updated_at: row.get(3)?,
                messages: row.get(4)?,
            })
        })?
        .collect::<Result<_, _>>()?;
    Ok(rows)
}

pub fn get(connection: &Connection, id: &str) -> AppResult<Conversation> {
    validate_id(id, "conversation")?;
    let (title, scope, created_at, updated_at): (String, String, i64, i64) = connection
        .query_row(
            "SELECT title, scope_json, created_at, updated_at FROM conversations WHERE id = ?1",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .optional()?
        .ok_or(AppError::NotFound {
            entity: "conversation",
        })?;
    let mut statement = connection.prepare(
        "SELECT id, role, content, status, sources_json, details_json, created_at
         FROM conversation_messages WHERE conversation_id = ?1 ORDER BY position",
    )?;
    let messages = statement
        .query_map([id], message)?
        .collect::<Result<_, _>>()?;
    Ok(Conversation {
        id: id.to_owned(),
        title,
        scope: serde_json::from_str(&scope).unwrap_or_default(),
        created_at,
        updated_at,
        messages,
    })
}

/// Starts a conversation with its first question.
pub fn create(
    transaction: &Transaction<'_>,
    question: &str,
    scope: &AssistantScope,
) -> AppResult<String> {
    let id = new_id();
    let now = now_ms();
    transaction.execute(
        "INSERT INTO conversations (id, title, scope_json, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4)",
        params![id, title_of(question), json(scope)?, now],
    )?;
    Ok(id)
}

pub fn set_scope(transaction: &Transaction<'_>, id: &str, scope: &AssistantScope) -> AppResult<()> {
    let changed = transaction.execute(
        "UPDATE conversations SET scope_json = ?2 WHERE id = ?1",
        params![id, json(scope)?],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound {
            entity: "conversation",
        });
    }
    Ok(())
}

fn touch(transaction: &Transaction<'_>, id: &str) -> AppResult<()> {
    transaction.execute(
        "UPDATE conversations SET updated_at = ?2 WHERE id = ?1",
        params![id, now_ms()],
    )?;
    Ok(())
}

fn append(
    transaction: &Transaction<'_>,
    conversation: &str,
    role: ChatRole,
    content: &str,
    status: MessageStatus,
    sources: &[SourcePassage],
    details: &AnswerDetails,
) -> AppResult<String> {
    let id = new_id();
    transaction.execute(
        "INSERT INTO conversation_messages
           (id, conversation_id, position, role, content, status, sources_json, details_json, created_at)
         VALUES (?1, ?2, (SELECT coalesce(max(position) + 1, 0) FROM conversation_messages WHERE conversation_id = ?2),
                 ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            id,
            conversation,
            role,
            content,
            status,
            json(&sources)?,
            json(details)?,
            now_ms()
        ],
    )?;
    touch(transaction, conversation)?;
    Ok(id)
}

pub fn add_question(
    transaction: &Transaction<'_>,
    conversation: &str,
    question: &str,
) -> AppResult<String> {
    append(
        transaction,
        conversation,
        ChatRole::User,
        question,
        MessageStatus::Complete,
        &[],
        &AnswerDetails::default(),
    )
}

/// Records an answer being written, with the passages sent.
pub fn start_answer(
    transaction: &Transaction<'_>,
    conversation: &str,
    sources: &[SourcePassage],
    details: &AnswerDetails,
) -> AppResult<String> {
    append(
        transaction,
        conversation,
        ChatRole::Assistant,
        "",
        MessageStatus::Streaming,
        sources,
        details,
    )
}

pub fn finish_answer(
    transaction: &Transaction<'_>,
    id: &str,
    content: &str,
    status: MessageStatus,
    details: &AnswerDetails,
) -> AppResult<()> {
    let conversation: Option<String> = transaction
        .query_row(
            "UPDATE conversation_messages SET content = ?2, status = ?3, details_json = ?4
             WHERE id = ?1 AND role = 'assistant' RETURNING conversation_id",
            params![id, content, status, json(details)?],
            |row| row.get(0),
        )
        .optional()?;
    // The conversation may have been cleared or deleted meanwhile: the answer is then dropped.
    if let Some(conversation) = conversation {
        touch(transaction, &conversation)?;
    }
    Ok(())
}

/// The last question of a conversation, after removing the answers that follow it (to answer it again).
pub fn reopen_last_question(
    transaction: &Transaction<'_>,
    conversation: &str,
) -> AppResult<String> {
    let (position, question): (i64, String) = transaction
        .query_row(
            "SELECT position, content FROM conversation_messages
             WHERE conversation_id = ?1 AND role = 'user' ORDER BY position DESC LIMIT 1",
            [conversation],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?
        .ok_or_else(|| AppError::InvalidInput("the conversation has no question".to_owned()))?;
    transaction.execute(
        "DELETE FROM conversation_messages WHERE conversation_id = ?1 AND position > ?2",
        params![conversation, position],
    )?;
    Ok(question)
}

/// The complete exchanges of a conversation before its last question: what may be sent as history.
pub fn exchanges(connection: &Connection, conversation: &str) -> AppResult<Vec<(String, String)>> {
    let mut statement = connection.prepare(
        "SELECT role, content, status FROM conversation_messages WHERE conversation_id = ?1 ORDER BY position",
    )?;
    let messages: Vec<(ChatRole, String, MessageStatus)> = statement
        .query_map([conversation], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })?
        .collect::<Result<_, _>>()?;
    let mut exchanges = Vec::new();
    let mut question: Option<String> = None;
    for (role, content, status) in messages {
        match role {
            ChatRole::User => question = Some(content),
            ChatRole::Assistant => {
                if let Some(asked) = question.take()
                    && status == MessageStatus::Complete
                    && !content.trim().is_empty()
                {
                    exchanges.push((asked, content));
                }
            }
        }
    }
    Ok(exchanges)
}

/// Removes every message of a conversation, keeping the conversation.
pub fn clear(transaction: &Transaction<'_>, id: &str) -> AppResult<usize> {
    get(transaction, id)?;
    let removed = transaction.execute(
        "DELETE FROM conversation_messages WHERE conversation_id = ?1",
        [id],
    )?;
    touch(transaction, id)?;
    Ok(removed)
}

pub fn delete(transaction: &Transaction<'_>, id: &str) -> AppResult<()> {
    validate_id(id, "conversation")?;
    let removed = transaction.execute("DELETE FROM conversations WHERE id = ?1", [id])?;
    if removed == 0 {
        return Err(AppError::NotFound {
            entity: "conversation",
        });
    }
    Ok(())
}

/// Answers left « being written » by a previous run of ARCHIVE were interrupted.
pub fn interrupt_unfinished(transaction: &Transaction<'_>) -> AppResult<usize> {
    Ok(transaction.execute(
        "UPDATE conversation_messages SET status = 'interrupted' WHERE status = 'streaming'",
        [],
    )?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::testing::open_temporary;
    use crate::memory::ItemKind;

    fn passage(index: u32) -> SourcePassage {
        SourcePassage {
            index,
            kind: ItemKind::Note,
            id: new_id(),
            title: "Note".to_owned(),
            page: None,
            excerpt: "Extrait".to_owned(),
            chars: 120,
            text: "Le texte complet envoyé".to_owned(),
        }
    }

    #[test]
    fn a_conversation_keeps_its_questions_answers_and_sources() {
        let (_dir, database) = open_temporary();
        let scope = AssistantScope {
            items: Vec::new(),
            workspace_id: Some(new_id()),
        };
        let question = "  Quelle est la différence entre un montage astable et un montage monostable du NE555 ?\nDétaille.";
        let (conversation, answer) = database
            .write(|transaction| {
                let question = clean_question(question)?;
                let conversation = create(transaction, &question, &scope)?;
                add_question(transaction, &conversation, &question)?;
                let answer = start_answer(
                    transaction,
                    &conversation,
                    &[passage(1), passage(2)],
                    &AnswerDetails {
                        provider: Some(ProviderKind::Anthropic),
                        model: Some("claude-opus-5-5".to_owned()),
                        scope_shared: true,
                        ..AnswerDetails::default()
                    },
                )?;
                Ok((conversation, answer))
            })
            .expect("started");
        let started = database
            .read(|connection| get(connection, &conversation))
            .expect("conversation");
        assert_eq!(
            started.title,
            "Quelle est la différence entre un montage astable et un montage monostable du NE…"
        );
        assert_eq!(started.scope, scope);
        assert_eq!(started.messages.len(), 2);
        assert_eq!(started.messages[1].status, MessageStatus::Streaming);
        assert_eq!(started.messages[1].sources.len(), 2);
        assert_eq!(
            started.messages[1].sources[0].text, "",
            "the text sent is not kept"
        );
        let stored: String = database
            .read(|connection| {
                Ok(connection.query_row(
                    "SELECT sources_json FROM conversation_messages WHERE id = ?1",
                    [&answer],
                    |row| row.get(0),
                )?)
            })
            .expect("stored");
        assert!(!stored.contains("Le texte complet"), "{stored}");

        database
            .write(|transaction| {
                finish_answer(
                    transaction,
                    &answer,
                    "Le montage astable oscille [S1].",
                    MessageStatus::Complete,
                    &AnswerDetails {
                        usage: Some(Usage {
                            input_tokens: Some(900),
                            output_tokens: Some(40),
                        }),
                        finish: Some(Finish::Complete),
                        ..AnswerDetails::default()
                    },
                )
            })
            .expect("finished");
        let finished = database
            .read(|connection| get(connection, &conversation))
            .expect("conversation");
        assert_eq!(
            finished.messages[1].content,
            "Le montage astable oscille [S1]."
        );
        assert_eq!(
            finished.messages[1]
                .details
                .usage
                .and_then(|usage| usage.output_tokens),
            Some(40)
        );
        let exchanges = database
            .read(|connection| exchanges(connection, &conversation))
            .expect("exchanges");
        assert_eq!(exchanges.len(), 1);
        assert_eq!(database.read(list).expect("list")[0].messages, 2);

        // Answering again removes the answer, keeps the question.
        let reopened = database
            .write(|transaction| reopen_last_question(transaction, &conversation))
            .expect("reopened");
        assert!(reopened.starts_with("Quelle est la différence"));
        assert_eq!(
            database
                .read(|connection| get(connection, &conversation))
                .expect("conversation")
                .messages
                .len(),
            1
        );

        assert_eq!(
            database
                .write(|transaction| clear(transaction, &conversation))
                .expect("cleared"),
            1
        );
        database
            .write(|transaction| delete(transaction, &conversation))
            .expect("deleted");
        assert!(matches!(
            database.read(|connection| get(connection, &conversation)),
            Err(AppError::NotFound { .. })
        ));
    }

    #[test]
    fn unfinished_answers_become_interrupted_and_bad_questions_are_refused() {
        let (_dir, database) = open_temporary();
        let conversation = database
            .write(|transaction| {
                let conversation = create(transaction, "Q", &AssistantScope::default())?;
                add_question(transaction, &conversation, "Q")?;
                start_answer(transaction, &conversation, &[], &AnswerDetails::default())?;
                // An answer that failed is not part of the history sent later.
                add_question(transaction, &conversation, "Q2")?;
                let failed =
                    start_answer(transaction, &conversation, &[], &AnswerDetails::default())?;
                finish_answer(
                    transaction,
                    &failed,
                    "",
                    MessageStatus::Failed,
                    &AnswerDetails::default(),
                )?;
                Ok(conversation)
            })
            .expect("seeded");
        assert_eq!(
            database.write(interrupt_unfinished).expect("interrupted"),
            1
        );
        let messages = database
            .read(|connection| get(connection, &conversation))
            .expect("conversation")
            .messages;
        assert_eq!(messages[1].status, MessageStatus::Interrupted);
        assert!(
            database
                .read(|connection| exchanges(connection, &conversation))
                .expect("exchanges")
                .is_empty()
        );

        for invalid in ["", "   ", "a\u{0}b", &"x".repeat(QUESTION_MAX_CHARS + 1)] {
            assert!(clean_question(invalid).is_err(), "{invalid:?}");
        }
        assert_eq!(
            clean_question(" Deux\nlignes\t ").expect("valid"),
            "Deux\nlignes"
        );
        assert!(matches!(
            database.write(|transaction| delete(transaction, &new_id())),
            Err(AppError::NotFound { .. })
        ));
    }
}

//! The assistant (specification §14.4): a question, the passages the user chose to share, the provider's
//! answer streamed to the interface, and everything recorded with the conversation. Nothing is sent without
//! the user's action, and only what the preview showed.

use std::collections::HashMap;
use std::sync::{Mutex, PoisonError};
use std::time::Instant;

use rusqlite::{Connection, Transaction};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::config::{self, ProviderRow};
use super::conversations::{self, AnswerDetails, MessageStatus};
use super::http::{self, Cancellation, Canceller, StreamEnd, cancellation};
use super::prompt::{self, SYSTEM_PROMPT};
use super::provider::{
    ChatMessage, ChatRequest, ChatRole, Endpoint, Finish, ProviderError, ProviderKind, StreamEvent,
    provider,
};
use super::retrieval::{self, AssistantScope, ContextSize, SourcePassage};
use super::secret::{Secret, Secrets, entry_name};
use crate::error::{AppError, AppResult};

/// Longest answer kept, in characters (the database refuses longer content).
const ANSWER_MAX_CHARS: usize = 400_000;

/// What the AI layer keeps while ARCHIVE runs: the keys, and the answers being written.
pub struct AiState {
    pub secrets: Secrets,
    running: Mutex<HashMap<String, Canceller>>,
}

impl AiState {
    pub fn new(secrets: Secrets) -> Self {
        Self {
            secrets,
            running: Mutex::new(HashMap::new()),
        }
    }

    /// Registers an answer being written in a conversation; one at a time per conversation.
    pub fn begin(&self, conversation: &str) -> AppResult<Cancellation> {
        let mut running = self.running.lock().unwrap_or_else(PoisonError::into_inner);
        if running.contains_key(conversation) {
            return Err(AppError::InUse {
                entity: "conversation",
                reason: "an answer is being written".to_owned(),
            });
        }
        let (canceller, cancellation) = cancellation();
        running.insert(conversation.to_owned(), canceller);
        Ok(cancellation)
    }

    pub fn end(&self, conversation: &str) {
        self.running
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .remove(conversation);
    }

    /// Stops the answer being written in a conversation. Returns whether there was one.
    pub fn stop(&self, conversation: &str) -> bool {
        match self
            .running
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .get(conversation)
        {
            Some(canceller) => {
                canceller.cancel();
                true
            }
            None => false,
        }
    }

    pub fn is_running(&self, conversation: &str) -> bool {
        self.running
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .contains_key(conversation)
    }
}

/// A question for the assistant.
#[derive(Debug, Clone, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct AssistantAsk {
    /// Absent for the first question of a new conversation.
    #[serde(default)]
    #[ts(optional)]
    pub conversation_id: Option<String>,
    pub question: String,
    #[serde(default)]
    pub scope: AssistantScope,
    /// Absent: the default provider.
    #[serde(default)]
    #[ts(optional)]
    pub provider_id: Option<String>,
}

/// Answer the last question of a conversation again (after an error, or for another answer).
#[derive(Debug, Clone, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct AssistantRegenerate {
    pub conversation_id: String,
    #[serde(default)]
    pub scope: AssistantScope,
    #[serde(default)]
    #[ts(optional)]
    pub provider_id: Option<String>,
}

/// What a question would send, shown before it is sent.
#[derive(Debug, Clone, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct AssistantPreviewRequest {
    #[serde(default)]
    #[ts(optional)]
    pub conversation_id: Option<String>,
    pub question: String,
    #[serde(default)]
    pub scope: AssistantScope,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AssistantPreview {
    pub passages: Vec<SourcePassage>,
    /// Characters of the passages.
    pub chars: u32,
    /// Messages of the conversation sent with the question (0 when the user does not share the history).
    pub history_messages: u32,
    pub context_size: ContextSize,
}

/// An answer that started: the interface follows it on its channel.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AssistantStarted {
    pub conversation_id: String,
    pub answer_id: String,
    pub sources: Vec<SourcePassage>,
}

/// What the interface receives while an answer is written.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(tag = "kind", rename_all = "snake_case")]
#[ts(export)]
pub enum AssistantEvent {
    /// The model that writes the answer.
    Model { model: String },
    /// A piece of the answer.
    Text { text: String },
    /// Anthropic's fallback: another model continues after a refusal.
    Switched { from: String, to: String },
    /// The answer is recorded; the conversation can be read again.
    Done { status: MessageStatus },
}

/// The assistant's preferences (specification §15.4), from the application settings.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AssistantSettings {
    pub context_size: ContextSize,
    pub share_history: bool,
}

/// Everything needed to write an answer, gathered before anything is sent.
pub struct Prepared {
    pub started: AssistantStarted,
    pub kind: ProviderKind,
    pub key: Secret,
    pub model: String,
    pub messages: Vec<ChatMessage>,
    pub max_output_tokens: u32,
    pub refusal_fallback: bool,
    pub details: AnswerDetails,
    /// Passages with the text sent: the stored sources keep only their excerpt.
    pub chars_sent: usize,
}

/// The provider asked for, or the default one; with its model and key.
pub(crate) fn chosen_provider(
    connection: &Connection,
    secrets: &Secrets,
    id: Option<&str>,
) -> AppResult<(ProviderRow, Secret)> {
    let row = match id {
        Some(id) => config::get(connection, id)?,
        None => config::default_provider(connection)?.ok_or(AppError::NotFound {
            entity: "AI provider",
        })?,
    };
    if row.model.is_empty() {
        return Err(AppError::InvalidInput(
            "choose a model for this provider in the settings".to_owned(),
        ));
    }
    let (key, _) = secrets
        .read(&entry_name(&row.id), row.secret_ref.is_some())?
        .ok_or_else(|| AppError::InvalidInput("this provider has no API key".to_owned()))?;
    Ok((row, key))
}

/// What a question would send: the passages, and how much of the conversation.
pub fn preview(
    connection: &Connection,
    settings: AssistantSettings,
    request: &AssistantPreviewRequest,
) -> AppResult<AssistantPreview> {
    let passages = retrieval::passages(
        connection,
        &request.scope,
        &request.question,
        settings.context_size,
    )?;
    let history_messages = match (&request.conversation_id, settings.share_history) {
        (Some(conversation), true) => {
            conversations::get(connection, conversation)?;
            let exchanges = conversations::exchanges(connection, conversation)?;
            u32::try_from(prompt::history(&exchanges).len()).unwrap_or(u32::MAX)
        }
        _ => 0,
    };
    Ok(AssistantPreview {
        chars: passages.iter().map(|passage| passage.chars).sum(),
        passages,
        history_messages,
        context_size: settings.context_size,
    })
}

/// Records the question (or reopens the last one) and an answer being written; gathers what will be sent.
fn prepare(
    transaction: &Transaction<'_>,
    secrets: &Secrets,
    settings: AssistantSettings,
    conversation_id: Option<&str>,
    question: Option<&str>,
    scope: &AssistantScope,
    provider_id: Option<&str>,
) -> AppResult<Prepared> {
    scope.check()?;
    let (row, key) = chosen_provider(transaction, secrets, provider_id)?;
    let question = question.map(conversations::clean_question).transpose()?;
    let (conversation, question, history) = match (conversation_id, question) {
        (None, Some(question)) => {
            let conversation = conversations::create(transaction, &question, scope)?;
            conversations::add_question(transaction, &conversation, &question)?;
            (conversation, question, Vec::new())
        }
        (Some(conversation), Some(question)) => {
            conversations::get(transaction, conversation)?;
            conversations::set_scope(transaction, conversation, scope)?;
            let history = conversations::exchanges(transaction, conversation)?;
            conversations::add_question(transaction, conversation, &question)?;
            (conversation.to_owned(), question, history)
        }
        (Some(conversation), None) => {
            conversations::get(transaction, conversation)?;
            conversations::set_scope(transaction, conversation, scope)?;
            let question = conversations::reopen_last_question(transaction, conversation)?;
            let history = conversations::exchanges(transaction, conversation)?;
            (conversation.to_owned(), question, history)
        }
        (None, None) => {
            return Err(AppError::InvalidInput("the question is empty".to_owned()));
        }
    };
    let sources = retrieval::passages(transaction, scope, &question, settings.context_size)?;
    let mut messages = if settings.share_history {
        prompt::history(&history)
    } else {
        Vec::new()
    };
    let history_sent = !messages.is_empty();
    messages.push(ChatMessage {
        role: ChatRole::User,
        content: prompt::user_turn(&question, &sources, !scope.is_empty()),
    });
    let details = AnswerDetails {
        provider: Some(row.provider),
        provider_name: Some(row.display_name.clone()),
        model: Some(row.model.clone()),
        history_sent,
        scope_shared: !scope.is_empty(),
        ..AnswerDetails::default()
    };
    let answer_id = conversations::start_answer(transaction, &conversation, &sources, &details)?;
    let chars_sent = sources
        .iter()
        .map(|source| source.text.chars().count())
        .sum();
    Ok(Prepared {
        started: AssistantStarted {
            conversation_id: conversation,
            answer_id,
            sources,
        },
        kind: row.provider,
        key,
        max_output_tokens: row.preferences.answer_tokens(),
        refusal_fallback: row.provider == ProviderKind::Anthropic
            && row.preferences.refusal_fallback
            && row.preferences.model_refusal_fallback,
        model: row.model,
        messages,
        details,
        chars_sent,
    })
}

pub fn prepare_question(
    transaction: &Transaction<'_>,
    secrets: &Secrets,
    settings: AssistantSettings,
    ask: &AssistantAsk,
) -> AppResult<Prepared> {
    prepare(
        transaction,
        secrets,
        settings,
        ask.conversation_id.as_deref(),
        Some(&ask.question),
        &ask.scope,
        ask.provider_id.as_deref(),
    )
}

pub fn prepare_regeneration(
    transaction: &Transaction<'_>,
    secrets: &Secrets,
    settings: AssistantSettings,
    request: &AssistantRegenerate,
) -> AppResult<Prepared> {
    prepare(
        transaction,
        secrets,
        settings,
        Some(&request.conversation_id),
        None,
        &request.scope,
        request.provider_id.as_deref(),
    )
}

/// How an answer ended, ready to be recorded.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Outcome {
    pub answer_id: String,
    pub content: String,
    pub status: MessageStatus,
    pub details: AnswerDetails,
}

/// Writes the answer: streams it from the provider and hands each piece to the interface.
pub async fn run(
    prepared: Prepared,
    endpoint: Endpoint,
    cancellation: Cancellation,
    mut emit: impl FnMut(AssistantEvent),
) -> Outcome {
    let started = Instant::now();
    let provider = provider(prepared.kind, endpoint);
    let http = provider.chat_request(
        &prepared.key,
        &ChatRequest {
            model: &prepared.model,
            system: SYSTEM_PROMPT,
            messages: &prepared.messages,
            max_output_tokens: prepared.max_output_tokens,
            refusal_fallback: prepared.refusal_fallback,
        },
    );
    drop(prepared.key);
    let mut details = prepared.details;
    let mut content = String::new();
    let mut finish: Option<Finish> = None;
    let mut failure: Option<ProviderError> = None;
    let end = http::stream(provider.as_ref(), http, cancellation, |event| match event {
        StreamEvent::Model(model) => {
            details.served_by = Some(model.clone());
            emit(AssistantEvent::Model { model });
        }
        StreamEvent::Text(text) => {
            content.push_str(&text);
            emit(AssistantEvent::Text { text });
        }
        StreamEvent::Usage(usage) => details.usage.get_or_insert_default().update(usage),
        StreamEvent::Switched { from, to } => {
            details.declined_by = Some(from.clone());
            details.served_by = Some(to.clone());
            emit(AssistantEvent::Switched { from, to });
        }
        StreamEvent::Finished(end) => finish = Some(end),
        StreamEvent::Failed(error) => {
            if failure.is_none() {
                failure = Some(error);
            }
        }
    })
    .await;
    let status = match (end, failure, &finish) {
        (Err(error), _, _) | (Ok(StreamEnd::Closed), Some(error), _) => {
            details.error = Some(error);
            MessageStatus::Failed
        }
        (Ok(StreamEnd::Cancelled), _, _) => MessageStatus::Interrupted,
        (Ok(StreamEnd::Closed), None, Some(Finish::Complete | Finish::MaxTokens)) => {
            MessageStatus::Complete
        }
        (Ok(StreamEnd::Closed), None, Some(Finish::Refused { .. })) => {
            // A declined answer is incomplete: its partial output is not kept.
            content.clear();
            MessageStatus::Refused
        }
        (Ok(StreamEnd::Closed), None, Some(Finish::Blocked { .. })) => {
            content.clear();
            MessageStatus::Blocked
        }
        (Ok(StreamEnd::Closed), None, None) => {
            details.error = Some(ProviderError::Interrupted);
            MessageStatus::Failed
        }
    };
    details.finish = finish;
    if content.chars().count() > ANSWER_MAX_CHARS {
        content = content.chars().take(ANSWER_MAX_CHARS).collect();
    }
    // Only the outcome is logged: never the question, the passages or the answer.
    log::info!(
        "assistant answer: {} {} with {} passages ({} characters) and {} history messages: {} in {} ms ({} input / {} output tokens)",
        prepared.kind.as_str(),
        details.served_by.as_deref().unwrap_or(&prepared.model),
        prepared.started.sources.len(),
        prepared.chars_sent,
        prepared.messages.len().saturating_sub(1),
        status.as_str(),
        started.elapsed().as_millis(),
        details
            .usage
            .and_then(|usage| usage.input_tokens)
            .map_or_else(|| "?".to_owned(), |tokens| tokens.to_string()),
        details
            .usage
            .and_then(|usage| usage.output_tokens)
            .map_or_else(|| "?".to_owned(), |tokens| tokens.to_string()),
    );
    Outcome {
        answer_id: prepared.started.answer_id,
        content,
        status,
        details,
    }
}

pub fn record(transaction: &Transaction<'_>, outcome: &Outcome) -> AppResult<()> {
    conversations::finish_answer(
        transaction,
        &outcome.answer_id,
        &outcome.content,
        outcome.status,
        &outcome.details,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::config::{ProviderCreate, ProviderPatch, ProviderPreferences};
    use crate::ai::retrieval::ItemRef;
    use crate::ai::secret::{KeyStorage, tests::mock_vault};
    use crate::ai::test_server::{Reply, TestServer};
    use crate::db::Database;
    use crate::db::testing::open_temporary;
    use crate::memory::ItemKind;
    use crate::repo::notes::{self, NoteContent, NoteFormat};

    const SETTINGS: AssistantSettings = AssistantSettings {
        context_size: ContextSize::Standard,
        share_history: true,
    };

    fn runtime() -> tokio::runtime::Runtime {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("runtime")
    }

    fn configured(
        database: &Database,
        secrets: &Secrets,
        kind: ProviderKind,
        fallback: bool,
    ) -> String {
        let row = database
            .write(|transaction| {
                let row = config::create(
                    transaction,
                    &ProviderCreate {
                        provider: kind,
                        display_name: "Fournisseur".to_owned(),
                        model: Some("model-test".to_owned()),
                    },
                )?;
                config::update(
                    transaction,
                    &row.id,
                    &ProviderPatch {
                        preferences: Some(ProviderPreferences {
                            max_output_tokens: 2_000,
                            refusal_fallback: true,
                            model_max_output_tokens: Some(1_000),
                            model_refusal_fallback: fallback,
                        }),
                        ..ProviderPatch::default()
                    },
                )
            })
            .expect("provider");
        assert_eq!(
            secrets.store(
                &entry_name(&row.id),
                Secret::new("sk-test-local-0002".to_owned())
            ),
            KeyStorage::System
        );
        database
            .write(|transaction| config::set_secret_ref(transaction, &row.id, true))
            .expect("key recorded");
        row.id
    }

    fn course(database: &Database) -> String {
        database
            .write(|transaction| {
                Ok(notes::create(
                    transaction,
                    &NoteContent {
                        title: "Cours NE555".to_owned(),
                        content: "Le montage astable du NE555 oscille sans cesse.".to_owned(),
                        content_format: NoteFormat::Plain,
                        content_text: "Le montage astable du NE555 oscille sans cesse.".to_owned(),
                    },
                    None,
                    None,
                )?
                .id)
            })
            .expect("note")
    }

    fn anthropic_stream(text: &str) -> String {
        format!(
            concat!(
                "event: message_start\ndata: {{\"type\":\"message_start\",\"message\":{{\"model\":\"model-test-1\",\"usage\":{{\"input_tokens\":300}}}}}}\n\n",
                "event: content_block_delta\ndata: {{\"type\":\"content_block_delta\",\"index\":0,\"delta\":{{\"type\":\"text_delta\",\"text\":{}}}}}\n\n",
                "event: message_delta\ndata: {{\"type\":\"message_delta\",\"delta\":{{\"stop_reason\":\"end_turn\"}},\"usage\":{{\"output_tokens\":20}}}}\n\n",
                "event: message_stop\ndata: {{\"type\":\"message_stop\"}}\n\n",
            ),
            serde_json::to_string(text).expect("json")
        )
    }

    fn answer(
        database: &Database,
        secrets: &Secrets,
        server: &TestServer,
        prepare: impl FnOnce(&Transaction<'_>, &Secrets) -> AppResult<Prepared>,
    ) -> (AssistantStarted, Vec<AssistantEvent>, Outcome) {
        let prepared = database
            .write(|transaction| prepare(transaction, secrets))
            .expect("prepared");
        let started = prepared.started.clone();
        let mut events = Vec::new();
        let outcome = runtime().block_on(run(
            prepared,
            Endpoint(server.base.clone()),
            Cancellation::never(),
            |event| events.push(event),
        ));
        database
            .write(|transaction| record(transaction, &outcome))
            .expect("recorded");
        (started, events, outcome)
    }

    #[test]
    fn a_question_sends_only_the_shared_passages_and_records_the_answer() {
        let (_dir, database) = open_temporary();
        let secrets = Secrets::new(Some(mock_vault()));
        let provider_id = configured(&database, &secrets, ProviderKind::Anthropic, true);
        let note = course(&database);
        let server = TestServer::start(vec![
            Reply::stream(&anthropic_stream("Le montage astable oscille [S1]."), 9),
            Reply::stream(&anthropic_stream("Il délivre deux états [S1]."), 9),
        ]);
        let scope = AssistantScope {
            items: vec![ItemRef {
                kind: ItemKind::Note,
                id: note.clone(),
            }],
            workspace_id: None,
        };
        let (started, events, outcome) =
            answer(&database, &secrets, &server, |transaction, secrets| {
                prepare_question(
                    transaction,
                    secrets,
                    SETTINGS,
                    &AssistantAsk {
                        conversation_id: None,
                        question: "Comment oscille le montage astable ?".to_owned(),
                        scope: scope.clone(),
                        provider_id: None,
                    },
                )
            });
        assert_eq!(started.sources.len(), 1);
        assert_eq!(started.sources[0].id, note);
        assert_eq!(
            events,
            vec![
                AssistantEvent::Model {
                    model: "model-test-1".to_owned()
                },
                AssistantEvent::Text {
                    text: "Le montage astable oscille [S1].".to_owned()
                },
            ]
        );
        assert_eq!(outcome.status, MessageStatus::Complete);

        // What left: the instructions, the passage numbered S1, the question; the key in its header.
        let request = &server.requests()[0];
        assert_eq!(request.header("x-api-key"), Some("sk-test-local-0002"));
        assert_eq!(
            request.header("anthropic-beta"),
            Some(crate::ai::anthropic::FALLBACK_BETA)
        );
        let body: serde_json::Value = serde_json::from_slice(&request.body).expect("json");
        assert_eq!(body["model"], "model-test");
        assert_eq!(body["max_tokens"], 1_000, "within the model's limit");
        assert_eq!(body["system"], SYSTEM_PROMPT);
        assert_eq!(body["messages"].as_array().map(Vec::len), Some(1));
        let turn = body["messages"][0]["content"].as_str().expect("turn");
        assert!(
            turn.contains("<source id=\"S1\" title=\"Cours NE555\">"),
            "{turn}"
        );
        assert!(
            turn.ends_with("Comment oscille le montage astable ?"),
            "{turn}"
        );

        let conversation = database
            .read(|connection| conversations::get(connection, &started.conversation_id))
            .expect("conversation");
        assert_eq!(conversation.messages.len(), 2);
        let recorded = &conversation.messages[1];
        assert_eq!(recorded.content, "Le montage astable oscille [S1].");
        assert_eq!(recorded.status, MessageStatus::Complete);
        assert_eq!(recorded.sources.len(), 1);
        assert_eq!(recorded.details.served_by.as_deref(), Some("model-test-1"));
        assert_eq!(
            recorded.details.usage.and_then(|usage| usage.input_tokens),
            Some(300)
        );
        assert!(recorded.details.scope_shared);
        assert!(!recorded.details.history_sent);

        // A follow-up sends the conversation so far, without its old citations.
        let (_, _, followed) = answer(&database, &secrets, &server, |transaction, secrets| {
            prepare_question(
                transaction,
                secrets,
                SETTINGS,
                &AssistantAsk {
                    conversation_id: Some(started.conversation_id.clone()),
                    question: "Et ses deux états ?".to_owned(),
                    scope: scope.clone(),
                    provider_id: Some(provider_id.clone()),
                },
            )
        });
        assert_eq!(followed.status, MessageStatus::Complete);
        assert!(followed.details.history_sent);
        let body: serde_json::Value =
            serde_json::from_slice(&server.requests()[1].body).expect("json");
        let messages = body["messages"].as_array().expect("messages");
        assert_eq!(messages.len(), 3);
        assert_eq!(
            messages[0]["content"],
            "Comment oscille le montage astable ?"
        );
        assert_eq!(messages[1]["content"], "Le montage astable oscille.");
        assert_eq!(messages[1]["role"], "assistant");
    }

    #[test]
    fn errors_refusals_and_stops_are_recorded_as_such() {
        let (_dir, database) = open_temporary();
        let secrets = Secrets::new(Some(mock_vault()));
        configured(&database, &secrets, ProviderKind::Anthropic, false);
        let refused = concat!(
            "event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"model\":\"model-test\"}}\n\n",
            "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"Début\"}}\n\n",
            "event: message_delta\ndata: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"refusal\",\"stop_details\":{\"category\":\"cyber\",\"explanation\":\"Declined.\"}}}\n\n",
            "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n",
        );
        let server = TestServer::start(vec![
            Reply::json(
                401,
                r#"{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}"#,
            ),
            Reply::stream(refused, 50),
            Reply::stream(&anthropic_stream("Une réponse"), 50),
        ]);
        let ask = |transaction: &Transaction<'_>, secrets: &Secrets| {
            prepare_question(
                transaction,
                secrets,
                SETTINGS,
                &AssistantAsk {
                    conversation_id: None,
                    question: "Question".to_owned(),
                    scope: AssistantScope::default(),
                    provider_id: None,
                },
            )
        };
        let (started, _, failed) = answer(&database, &secrets, &server, ask);
        assert_eq!(failed.status, MessageStatus::Failed);
        assert_eq!(failed.details.error, Some(ProviderError::Authentication));
        assert!(started.sources.is_empty());
        let body: serde_json::Value =
            serde_json::from_slice(&server.requests()[0].body).expect("json");
        assert!(
            body.get("fallbacks").is_none(),
            "the model does not accept the fallback"
        );
        assert!(
            body["messages"][0]["content"]
                .as_str()
                .is_some_and(|turn| turn.starts_with("(The user shared no document"))
        );

        // Answering again replaces the failed answer.
        let (again, _, declined) = answer(&database, &secrets, &server, |transaction, secrets| {
            prepare_regeneration(
                transaction,
                secrets,
                SETTINGS,
                &AssistantRegenerate {
                    conversation_id: started.conversation_id.clone(),
                    scope: AssistantScope::default(),
                    provider_id: None,
                },
            )
        });
        assert_eq!(again.conversation_id, started.conversation_id);
        assert_eq!(declined.status, MessageStatus::Refused);
        assert_eq!(
            declined.content, "",
            "the partial output of a refusal is dropped"
        );
        assert_eq!(
            declined.details.finish,
            Some(Finish::Refused {
                category: Some("cyber".to_owned()),
                explanation: Some("Declined.".to_owned())
            })
        );
        let messages = database
            .read(|connection| conversations::get(connection, &started.conversation_id))
            .expect("conversation")
            .messages;
        assert_eq!(messages.len(), 2, "one question, its latest answer");

        // Stopped by the user before the provider answers.
        let prepared = database
            .write(|transaction| ask(transaction, &secrets))
            .expect("prepared");
        let state = AiState::new(Secrets::new(None));
        let cancellation = state
            .begin(&prepared.started.conversation_id)
            .expect("begun");
        assert!(matches!(
            state.begin(&prepared.started.conversation_id),
            Err(AppError::InUse { .. })
        ));
        assert!(state.stop(&prepared.started.conversation_id));
        let stopped = runtime().block_on(run(
            prepared,
            Endpoint(server.base.clone()),
            cancellation,
            |_| {},
        ));
        assert_eq!(stopped.status, MessageStatus::Interrupted);
    }

    #[test]
    fn nothing_is_sent_without_a_provider_a_model_and_a_key() {
        let (_dir, database) = open_temporary();
        let secrets = Secrets::new(Some(mock_vault()));
        let ask = AssistantAsk {
            conversation_id: None,
            question: "Question".to_owned(),
            scope: AssistantScope::default(),
            provider_id: None,
        };
        assert!(matches!(
            database.write(|transaction| prepare_question(transaction, &secrets, SETTINGS, &ask)),
            Err(AppError::NotFound { .. })
        ));
        let id = database
            .write(|transaction| {
                Ok(config::create(
                    transaction,
                    &ProviderCreate {
                        provider: ProviderKind::Openai,
                        display_name: "OpenAI".to_owned(),
                        model: None,
                    },
                )?
                .id)
            })
            .expect("provider");
        assert!(matches!(
            database.write(|transaction| prepare_question(transaction, &secrets, SETTINGS, &ask)),
            Err(AppError::InvalidInput(_))
        ));
        database
            .write(|transaction| {
                config::update(
                    transaction,
                    &id,
                    &ProviderPatch {
                        model: Some("gpt-test".to_owned()),
                        ..ProviderPatch::default()
                    },
                )
            })
            .expect("model");
        assert!(matches!(
            database.write(|transaction| prepare_question(transaction, &secrets, SETTINGS, &ask)),
            Err(AppError::InvalidInput(_))
        ));
        // Nothing was recorded by the refused attempts.
        assert!(database.read(conversations::list).expect("list").is_empty());
    }
}

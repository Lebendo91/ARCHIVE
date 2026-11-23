//! AI commands (specification §14, §15.4): providers and their keys, the connection test, and the assistant.
//! A key enters here once, from the settings form, and never comes out: no command returns it.

use std::sync::Arc;
use std::time::Instant;

use serde::Serialize;
use tauri::State;
use tauri::ipc::Channel;
use ts_rs::TS;

use super::blocking;
use crate::ai::assistant::{
    self, AiState, AssistantAsk, AssistantEvent, AssistantPreview, AssistantPreviewRequest,
    AssistantRegenerate, AssistantSettings, AssistantStarted, Prepared,
};
use crate::ai::concepts;
use crate::ai::config::{self, AiProviderView, ProviderCreate, ProviderPatch};
use crate::ai::conversations::{self, Conversation, ConversationSummary};
use crate::ai::http;
use crate::ai::provider::{
    ChatMessage, ChatRequest, ChatRole, Endpoint, Finish, ModelInfo, ProviderError, StreamEvent,
    provider,
};
use crate::ai::secret::{KeyStorage, entry_name, parse_key};
use crate::db::Database;
use crate::error::{AppError, AppResult};
use crate::memory::concepts::ConceptMention;
use crate::memory::{self, ItemKind};
use crate::repo::settings;
use crate::state::AppState;
use crate::util::{now_ms, validate_id};

/// The configured providers, and whether this platform has a credential store.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AiOverview {
    pub providers: Vec<AiProviderView>,
    /// False when keys can only be kept for the session (no system credential store).
    pub system_store: bool,
}

/// Result of a connection test: the models of the account, or why the provider refused.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ConnectionTest {
    pub models: Vec<ModelInfo>,
    pub error: Option<ProviderError>,
    #[ts(type = "number")]
    pub duration_ms: u64,
}

#[tauri::command]
pub async fn ai_overview(
    state: State<'_, AppState>,
    ai: State<'_, Arc<AiState>>,
) -> AppResult<AiOverview> {
    let database = state.database()?;
    let ai = Arc::clone(&ai);
    blocking("ai_overview", move || {
        let rows = database.read(config::list)?;
        Ok(AiOverview {
            providers: rows.iter().map(|row| row.view(&ai.secrets)).collect(),
            system_store: ai.secrets.system_store(),
        })
    })
    .await
}

#[tauri::command]
pub async fn ai_providers_create(
    state: State<'_, AppState>,
    ai: State<'_, Arc<AiState>>,
    input: ProviderCreate,
) -> AppResult<AiProviderView> {
    let database = state.database()?;
    let ai = Arc::clone(&ai);
    blocking("ai_providers_create", move || {
        let row = database.write(|transaction| config::create(transaction, &input))?;
        log::info!(
            "AI provider {} configured ({})",
            row.id,
            row.provider.as_str()
        );
        Ok(row.view(&ai.secrets))
    })
    .await
}

#[tauri::command]
pub async fn ai_providers_update(
    state: State<'_, AppState>,
    ai: State<'_, Arc<AiState>>,
    id: String,
    patch: ProviderPatch,
) -> AppResult<AiProviderView> {
    let database = state.database()?;
    let ai = Arc::clone(&ai);
    blocking("ai_providers_update", move || {
        let row = database.write(|transaction| config::update(transaction, &id, &patch))?;
        Ok(row.view(&ai.secrets))
    })
    .await
}

/// Removes a provider and its key from the credential store.
#[tauri::command]
pub async fn ai_providers_delete(
    state: State<'_, AppState>,
    ai: State<'_, Arc<AiState>>,
    id: String,
) -> AppResult<()> {
    let database = state.database()?;
    let ai = Arc::clone(&ai);
    blocking("ai_providers_delete", move || {
        let removed = database.write(|transaction| config::delete(transaction, &id))?;
        ai.secrets.remove(&entry_name(&removed.id))?;
        log::info!("AI provider {} removed with its key", removed.id);
        Ok(())
    })
    .await
}

/// Keeps the key of a provider: in the credential store, or for the session when there is none.
#[tauri::command]
pub async fn ai_providers_set_key(
    state: State<'_, AppState>,
    ai: State<'_, Arc<AiState>>,
    id: String,
    key: String,
) -> AppResult<AiProviderView> {
    let secret = parse_key(key)?;
    let database = state.database()?;
    let ai = Arc::clone(&ai);
    blocking("ai_providers_set_key", move || {
        let row = database.read(|connection| config::get(connection, &id))?;
        let storage = ai.secrets.store(&entry_name(&row.id), secret);
        let row = database.write(|transaction| {
            config::set_secret_ref(transaction, &row.id, storage == KeyStorage::System)
        })?;
        log::info!(
            "API key of AI provider {} kept {}",
            row.id,
            match storage {
                KeyStorage::System => "in the credential store",
                KeyStorage::Session => "for this session only (no usable credential store)",
            }
        );
        Ok(row.view(&ai.secrets))
    })
    .await
}

#[tauri::command]
pub async fn ai_providers_remove_key(
    state: State<'_, AppState>,
    ai: State<'_, Arc<AiState>>,
    id: String,
) -> AppResult<AiProviderView> {
    let database = state.database()?;
    let ai = Arc::clone(&ai);
    blocking("ai_providers_remove_key", move || {
        let row = database.read(|connection| config::get(connection, &id))?;
        ai.secrets.remove(&entry_name(&row.id))?;
        let row =
            database.write(|transaction| config::set_secret_ref(transaction, &row.id, false))?;
        log::info!("API key of AI provider {} removed", row.id);
        Ok(row.view(&ai.secrets))
    })
    .await
}

/// Lists the models of the account: the connection test, run only when the user asks (specification §15.4).
#[tauri::command]
pub async fn ai_providers_test(
    state: State<'_, AppState>,
    ai: State<'_, Arc<AiState>>,
    id: String,
) -> AppResult<ConnectionTest> {
    let database = state.database()?;
    let ai = Arc::clone(&ai);
    let (row, key) = blocking("ai_providers_test", move || {
        let row = database.read(|connection| config::get(connection, &id))?;
        let key = ai
            .secrets
            .read(&entry_name(&row.id), row.secret_ref.is_some())?
            .ok_or_else(|| AppError::InvalidInput("this provider has no API key".to_owned()))?
            .0;
        Ok((row, key))
    })
    .await?;
    let started = Instant::now();
    let implementation = provider(row.provider, Endpoint::for_kind(row.provider));
    let result = http::list_models(implementation.as_ref(), &key).await;
    drop(key);
    let duration_ms = u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX);
    Ok(match result {
        Ok(models) => {
            log::info!(
                "connection test of AI provider {} ({}): {} models in {duration_ms} ms",
                row.id,
                row.provider.as_str(),
                models.len()
            );
            ConnectionTest {
                models,
                error: None,
                duration_ms,
            }
        }
        Err(error) => {
            log::warn!(
                "connection test of AI provider {} ({}) failed: {}",
                row.id,
                row.provider.as_str(),
                error.kind()
            );
            ConnectionTest {
                models: Vec::new(),
                error: Some(error),
                duration_ms,
            }
        }
    })
}

#[tauri::command]
pub async fn assistant_conversations(
    state: State<'_, AppState>,
) -> AppResult<Vec<ConversationSummary>> {
    let database = state.database()?;
    blocking("assistant_conversations", move || {
        database.read(conversations::list)
    })
    .await
}

#[tauri::command]
pub async fn assistant_conversation(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<Conversation> {
    let database = state.database()?;
    blocking("assistant_conversation", move || {
        database.read(|connection| conversations::get(connection, &id))
    })
    .await
}

fn idle(ai: &AiState, id: &str) -> AppResult<()> {
    validate_id(id, "conversation")?;
    if ai.is_running(id) {
        return Err(AppError::InUse {
            entity: "conversation",
            reason: "an answer is being written".to_owned(),
        });
    }
    Ok(())
}

/// Removes the messages of a conversation (the interface asks for confirmation first).
#[tauri::command]
pub async fn assistant_conversation_clear(
    state: State<'_, AppState>,
    ai: State<'_, Arc<AiState>>,
    id: String,
) -> AppResult<()> {
    idle(&ai, &id)?;
    let database = state.database()?;
    blocking("assistant_conversation_clear", move || {
        let removed = database.write(|transaction| conversations::clear(transaction, &id))?;
        log::info!("conversation {id} cleared ({removed} messages)");
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn assistant_conversation_delete(
    state: State<'_, AppState>,
    ai: State<'_, Arc<AiState>>,
    id: String,
) -> AppResult<()> {
    idle(&ai, &id)?;
    let database = state.database()?;
    blocking("assistant_conversation_delete", move || {
        database.write(|transaction| conversations::delete(transaction, &id))?;
        log::info!("conversation {id} deleted");
        Ok(())
    })
    .await
}

fn assistant_settings(database: &Database) -> AppResult<AssistantSettings> {
    let settings = database.read(settings::load)?;
    Ok(AssistantSettings {
        context_size: settings.assistant_context,
        share_history: settings.assistant_history,
    })
}

/// What a question would send: shown to the user before anything leaves.
#[tauri::command]
pub async fn assistant_preview(
    state: State<'_, AppState>,
    request: AssistantPreviewRequest,
) -> AppResult<AssistantPreview> {
    let database = state.database()?;
    blocking("assistant_preview", move || {
        let settings = assistant_settings(&database)?;
        database.read(|connection| assistant::preview(connection, settings, &request))
    })
    .await
}

/// Writes the answer in the background; the interface follows it on its channel.
fn launch(
    database: Arc<Database>,
    ai: Arc<AiState>,
    prepared: Prepared,
    cancellation: http::Cancellation,
    channel: Channel<AssistantEvent>,
) -> AssistantStarted {
    let started = prepared.started.clone();
    let conversation = started.conversation_id.clone();
    let kind = prepared.kind;
    tauri::async_runtime::spawn(async move {
        let outcome = assistant::run(prepared, Endpoint::for_kind(kind), cancellation, |event| {
            // The window may be gone: the answer is recorded all the same.
            let _ = channel.send(event);
        })
        .await;
        let status = outcome.status;
        let recorded = tauri::async_runtime::spawn_blocking(move || {
            database.write(|transaction| assistant::record(transaction, &outcome))
        })
        .await;
        match recorded {
            Ok(Ok(())) => {}
            Ok(Err(error)) => log::error!("the answer could not be recorded: {error}"),
            Err(error) => log::error!("the answer could not be recorded: {error}"),
        }
        ai.end(&conversation);
        let _ = channel.send(AssistantEvent::Done { status });
    });
    started
}

#[tauri::command]
pub async fn assistant_ask(
    state: State<'_, AppState>,
    ai: State<'_, Arc<AiState>>,
    ask: AssistantAsk,
    channel: Channel<AssistantEvent>,
) -> AppResult<AssistantStarted> {
    let database = state.database()?;
    let ai = Arc::clone(&ai);
    // A conversation writes one answer at a time.
    let reserved = match &ask.conversation_id {
        Some(id) => {
            validate_id(id, "conversation")?;
            Some((id.clone(), ai.begin(id)?))
        }
        None => None,
    };
    let (store, shared) = (Arc::clone(&database), Arc::clone(&ai));
    let prepared = blocking("assistant_ask", move || {
        let settings = assistant_settings(&store)?;
        store.write(|transaction| {
            assistant::prepare_question(transaction, &shared.secrets, settings, &ask)
        })
    })
    .await;
    let prepared = match prepared {
        Ok(prepared) => prepared,
        Err(error) => {
            if let Some((id, _)) = &reserved {
                ai.end(id);
            }
            return Err(error);
        }
    };
    let cancellation = match reserved {
        Some((_, cancellation)) => cancellation,
        None => ai.begin(&prepared.started.conversation_id)?,
    };
    Ok(launch(database, ai, prepared, cancellation, channel))
}

#[tauri::command]
pub async fn assistant_regenerate(
    state: State<'_, AppState>,
    ai: State<'_, Arc<AiState>>,
    request: AssistantRegenerate,
    channel: Channel<AssistantEvent>,
) -> AppResult<AssistantStarted> {
    validate_id(&request.conversation_id, "conversation")?;
    let database = state.database()?;
    let ai = Arc::clone(&ai);
    let conversation = request.conversation_id.clone();
    let cancellation = ai.begin(&conversation)?;
    let (store, shared) = (Arc::clone(&database), Arc::clone(&ai));
    let prepared = blocking("assistant_regenerate", move || {
        let settings = assistant_settings(&store)?;
        store.write(|transaction| {
            assistant::prepare_regeneration(transaction, &shared.secrets, settings, &request)
        })
    })
    .await;
    match prepared {
        Ok(prepared) => Ok(launch(database, ai, prepared, cancellation, channel)),
        Err(error) => {
            ai.end(&conversation);
            Err(error)
        }
    }
}

/// Stops the answer being written. Returns whether there was one.
#[tauri::command]
pub async fn assistant_stop(
    ai: State<'_, Arc<AiState>>,
    conversation_id: String,
) -> AppResult<bool> {
    validate_id(&conversation_id, "conversation")?;
    Ok(ai.stop(&conversation_id))
}

/// Concepts extracted by a provider from an item, checked against its text.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ConceptExtraction {
    /// The concepts of the item now recorded (empty when the extraction failed).
    pub concepts: Vec<ConceptMention>,
    /// Characters of the item that were sent.
    pub sent_chars: u32,
    pub error: Option<ProviderError>,
    /// How the provider's answer ended, when it declined or was stopped.
    pub finish: Option<Finish>,
}

/// Extracts the concepts of a document or a note with an AI provider, on the user's request (specification
/// §10.3). Only the title and the beginning of the text are sent; the result is checked against the text.
#[tauri::command]
pub async fn memory_extract_concepts(
    state: State<'_, AppState>,
    ai: State<'_, Arc<AiState>>,
    kind: ItemKind,
    id: String,
    provider_id: Option<String>,
) -> AppResult<ConceptExtraction> {
    validate_id(&id, "item")?;
    let database = state.database()?;
    let ai = Arc::clone(&ai);
    let (store, item_id) = (Arc::clone(&database), id.clone());
    let (row, key, item) = blocking("memory_extract_concepts", move || {
        let (row, key) = store.read(|connection| {
            assistant::chosen_provider(connection, &ai.secrets, provider_id.as_deref())
        })?;
        let item = store
            .read(|connection| memory::load(connection, kind, &item_id))?
            .filter(|item| !item.trashed)
            .ok_or(AppError::NotFound { entity: "item" })?;
        Ok((row, key, item))
    })
    .await?;
    let (turn, sent_chars) = concepts::user_turn(&item.title, &item.text);
    let sent_chars = u32::try_from(sent_chars).unwrap_or(u32::MAX);
    let implementation = provider(row.provider, Endpoint::for_kind(row.provider));
    let messages = [ChatMessage {
        role: ChatRole::User,
        content: turn,
    }];
    let request = implementation.chat_request(
        &key,
        &ChatRequest {
            model: &row.model,
            system: concepts::SYSTEM_PROMPT,
            messages: &messages,
            max_output_tokens: concepts::ANSWER_TOKENS.min(row.preferences.answer_tokens()),
            refusal_fallback: false,
        },
    );
    drop(key);
    let mut answer = String::new();
    let mut served: Option<String> = None;
    let mut failure: Option<ProviderError> = None;
    let mut finish: Option<Finish> = None;
    let end = http::stream(
        implementation.as_ref(),
        request,
        http::Cancellation::never(),
        |event| match event {
            StreamEvent::Text(text) => answer.push_str(&text),
            StreamEvent::Model(model) | StreamEvent::Switched { to: model, .. } => {
                served = Some(model);
            }
            StreamEvent::Finished(end) => finish = Some(end),
            StreamEvent::Failed(error) => {
                failure.get_or_insert(error);
            }
            StreamEvent::Usage(_) => {}
        },
    )
    .await;
    let failed = |error: Option<ProviderError>, finish: Option<Finish>| ConceptExtraction {
        concepts: Vec::new(),
        sent_chars,
        error,
        finish,
    };
    match (end, failure, &finish) {
        (Err(error), _, _) | (Ok(_), Some(error), _) => {
            log::warn!(
                "concept extraction of {} {id} failed: {}",
                kind.entity().as_str(),
                error.kind()
            );
            return Ok(failed(Some(error), None));
        }
        (Ok(_), None, Some(Finish::Complete)) => {}
        (Ok(_), None, Some(other)) => {
            log::info!(
                "concept extraction of {} {id} ended without a list",
                kind.entity().as_str()
            );
            return Ok(failed(None, Some(other.clone())));
        }
        (Ok(_), None, None) => return Ok(failed(Some(ProviderError::Interrupted), None)),
    }
    let Some(found) = concepts::parse(&answer, &item.text) else {
        log::warn!(
            "concept extraction of {} {id}: unreadable answer",
            kind.entity().as_str()
        );
        return Ok(failed(Some(ProviderError::InvalidResponse), None));
    };
    let provenance = serde_json::json!({
        "provider": row.provider.as_str(),
        "model": served.unwrap_or_else(|| row.model.clone()),
        "extractedAt": now_ms(),
    });
    let kept = found.len();
    let concepts = blocking("memory_extract_concepts", move || {
        database.write(|transaction| {
            memory::concepts::store(transaction, kind, &id, &found, &provenance)?;
            memory::concepts::mentions(transaction, kind, &id)
        })
    })
    .await?;
    log::info!(
        "concept extraction: {kept} concepts kept from {}",
        row.provider.as_str()
    );
    Ok(ConceptExtraction {
        concepts,
        sent_chars,
        error: None,
        finish: None,
    })
}

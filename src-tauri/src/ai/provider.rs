//! What every AI provider offers, whatever its API (specification §14.2): the list of its models (which is
//! also the connection test), and an answer streamed as events. A provider is "sans I/O": it builds HTTP
//! requests and reads responses, while [`super::http`] sends them. Each one is tested on recorded responses,
//! and the whole chain against a local server, without a real key.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::secret::Secret;
use super::sse::SseEvent;
use crate::error::{AppError, AppResult};
use crate::repo::text_enum;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum ProviderKind {
    Anthropic,
    Openai,
    Gemini,
}
text_enum!(ProviderKind {
    Anthropic => "anthropic",
    Openai => "openai",
    Gemini => "gemini",
});

/// Longest model identifier accepted.
pub const MODEL_MAX_CHARS: usize = 200;

/// Checks a model identifier: it goes into a URL for Gemini, so only the characters of real identifiers pass.
pub fn check_model(model: &str) -> AppResult<()> {
    let valid = !model.is_empty()
        && model.chars().count() <= MODEL_MAX_CHARS
        && model
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || "._:-".contains(character));
    if valid {
        Ok(())
    } else {
        Err(AppError::InvalidInput(
            "the model identifier may only contain letters, digits, « . », « _ », « : » and « - »"
                .to_owned(),
        ))
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HttpMethod {
    Get,
    Post,
}

/// An HTTP request built by a provider. Its headers may hold the key: it is never printed.
pub struct HttpRequest {
    pub method: HttpMethod,
    pub url: String,
    pub headers: Vec<(&'static str, HeaderValue)>,
    pub body: Option<Vec<u8>>,
}

pub enum HeaderValue {
    Plain(String),
    Secret(String),
}

impl HeaderValue {
    pub fn plain(value: &str) -> Self {
        Self::Plain(value.to_owned())
    }

    pub fn secret(value: &Secret) -> Self {
        Self::Secret(value.expose().to_owned())
    }
}

impl Drop for HeaderValue {
    fn drop(&mut self) {
        if let Self::Secret(value) = self {
            zeroize::Zeroize::zeroize(value);
        }
    }
}

impl std::fmt::Debug for HttpRequest {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("HttpRequest")
            .field("method", &self.method)
            .field("url", &self.url)
            .finish_non_exhaustive()
    }
}

impl HttpRequest {
    pub fn header(&self, name: &str) -> Option<&str> {
        self.headers
            .iter()
            .find(|(header, _)| header.eq_ignore_ascii_case(name))
            .map(|(_, value)| match value {
                HeaderValue::Plain(value) | HeaderValue::Secret(value) => value.as_str(),
            })
    }

    pub fn json_body(&self) -> serde_json::Value {
        self.body
            .as_deref()
            .and_then(|body| serde_json::from_slice(body).ok())
            .unwrap_or(serde_json::Value::Null)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum ChatRole {
    User,
    Assistant,
}
text_enum!(ChatRole {
    User => "user",
    Assistant => "assistant",
});

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ChatMessage {
    pub role: ChatRole,
    pub content: String,
}

/// A request for an answer, the same for every provider.
#[derive(Debug, Clone)]
pub struct ChatRequest<'a> {
    pub model: &'a str,
    pub system: &'a str,
    pub messages: &'a [ChatMessage],
    pub max_output_tokens: u32,
    /// Anthropic: retry a declined request on the model Anthropic recommends (server-side fallback).
    pub refusal_fallback: bool,
}

/// A model offered by the provider to the account of the key.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    /// Release date (milliseconds), when the provider gives it.
    #[ts(type = "number | null")]
    pub created_at: Option<i64>,
    /// Longest answer the model can give, in tokens, when the provider says.
    pub max_output_tokens: Option<u32>,
    /// Still served but on its way out.
    pub deprecated: bool,
    /// Anthropic: a declined request can be retried on another model by the API itself.
    pub refusal_fallback: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ModelPage {
    pub models: Vec<ModelInfo>,
    pub next: Option<String>,
}

/// Tokens counted by the provider.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Usage {
    #[ts(type = "number | null")]
    pub input_tokens: Option<u64>,
    #[ts(type = "number | null")]
    pub output_tokens: Option<u64>,
}

impl Usage {
    /// Takes the values the provider reported last.
    pub fn update(&mut self, other: Usage) {
        if other.input_tokens.is_some() {
            self.input_tokens = other.input_tokens;
        }
        if other.output_tokens.is_some() {
            self.output_tokens = other.output_tokens;
        }
    }
}

/// How an answer ended.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "snake_case")]
#[ts(export)]
pub enum Finish {
    Complete,
    /// The answer reached the longest length set for the provider.
    MaxTokens,
    /// The model declined to answer; its partial output, if any, is discarded.
    Refused {
        category: Option<String>,
        explanation: Option<String>,
    },
    /// The provider's filters stopped the answer (safety, recitation…).
    Blocked {
        reason: String,
    },
}

/// Why a provider could not answer. Only stable categories and a cleaned detail reach the interface.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "snake_case")]
#[ts(export)]
pub enum ProviderError {
    /// The key was refused.
    Authentication,
    /// The key may not do this (organization, region, permissions).
    PermissionDenied,
    /// The model does not exist or is not available to this account.
    ModelNotFound,
    RateLimited {
        #[ts(type = "number | null")]
        retry_after_seconds: Option<u64>,
    },
    /// Credit, billing or quota exhausted.
    QuotaExceeded,
    Overloaded,
    InvalidRequest {
        detail: Option<String>,
    },
    Server {
        status: u16,
    },
    /// The provider could not be reached (no connection, DNS, proxy, certificate).
    Network,
    Timeout,
    /// The response could not be read.
    InvalidResponse,
    /// The stream ended before the provider said the answer was complete.
    Interrupted,
}

impl ProviderError {
    /// Stable name for the logs.
    pub fn kind(&self) -> &'static str {
        match self {
            Self::Authentication => "authentication",
            Self::PermissionDenied => "permission_denied",
            Self::ModelNotFound => "model_not_found",
            Self::RateLimited { .. } => "rate_limited",
            Self::QuotaExceeded => "quota_exceeded",
            Self::Overloaded => "overloaded",
            Self::InvalidRequest { .. } => "invalid_request",
            Self::Server { .. } => "server",
            Self::Network => "network",
            Self::Timeout => "timeout",
            Self::InvalidResponse => "invalid_response",
            Self::Interrupted => "interrupted",
        }
    }
}

/// What a stream says, in order.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StreamEvent {
    /// The model that produces the answer.
    Model(String),
    Text(String),
    Usage(Usage),
    /// Anthropic's server-side fallback: another model continues after a refusal.
    Switched {
        from: String,
        to: String,
    },
    Finished(Finish),
    Failed(ProviderError),
}

/// Reads the events of one streamed answer.
pub trait StreamDecoder: Send {
    fn decode(&mut self, event: &SseEvent) -> Vec<StreamEvent>;
    /// The body ended: what the provider never said is reported.
    fn end(&mut self) -> Vec<StreamEvent>;
}

/// An AI provider.
pub trait AiProvider: Send + Sync {
    fn kind(&self) -> ProviderKind;
    /// A page of the models of the account. Listing them is the connection test: it costs no token.
    fn models_request(&self, key: &Secret, cursor: Option<&str>) -> HttpRequest;
    fn parse_models(&self, body: &[u8]) -> Result<ModelPage, ProviderError>;
    /// The request of a streamed answer.
    fn chat_request(&self, key: &Secret, request: &ChatRequest<'_>) -> HttpRequest;
    fn decoder(&self) -> Box<dyn StreamDecoder>;
    /// Reads an error response.
    fn error(&self, status: u16, retry_after: Option<u64>, body: &[u8]) -> ProviderError;
}

/// Base address of a provider's API.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Endpoint(pub String);

impl Endpoint {
    pub fn official(kind: ProviderKind) -> Self {
        Self(
            match kind {
                ProviderKind::Anthropic => "https://api.anthropic.com",
                ProviderKind::Openai => "https://api.openai.com",
                ProviderKind::Gemini => "https://generativelanguage.googleapis.com",
            }
            .to_owned(),
        )
    }

    /// The address used by the application. Only a build made for the native validation lets a local
    /// server stand in for the providers; the distributed builds do not contain this code.
    pub fn for_kind(kind: ProviderKind) -> Self {
        #[cfg(feature = "test-endpoints")]
        if let Ok(base) = std::env::var("ARCHIVE_AI_TEST_ENDPOINT")
            && base.starts_with("http://127.0.0.1:")
        {
            return Self(base.trim_end_matches('/').to_owned());
        }
        Self::official(kind)
    }

    pub fn url(&self, path: &str) -> String {
        format!("{}{path}", self.0)
    }
}

/// The implementation of a provider.
pub fn provider(kind: ProviderKind, endpoint: Endpoint) -> Box<dyn AiProvider> {
    match kind {
        ProviderKind::Anthropic => Box::new(super::anthropic::Anthropic::new(endpoint)),
        ProviderKind::Openai => Box::new(super::openai::OpenAi::new(endpoint)),
        ProviderKind::Gemini => Box::new(super::gemini::Gemini::new(endpoint)),
    }
}

/// A provider's message, cleaned to be shown: anything that looks like a key is masked, and it is short.
pub fn clean_detail(message: &str) -> Option<String> {
    const DETAIL_MAX_CHARS: usize = 300;
    let masked: Vec<String> = message
        .split_whitespace()
        .map(|word| {
            let core = word.trim_matches(|character: char| !character.is_ascii_alphanumeric());
            let looks_like_key = core.len() >= 16
                && core.chars().any(|character| character.is_ascii_digit())
                && core
                    .chars()
                    .any(|character| character.is_ascii_alphabetic())
                && core.chars().all(|character| {
                    character.is_ascii_alphanumeric() || "-_*.".contains(character)
                });
            if looks_like_key || core.starts_with("sk-") || core.starts_with("AIza") {
                "[…]".to_owned()
            } else {
                word.to_owned()
            }
        })
        .collect();
    let text: String = masked.join(" ").chars().take(DETAIL_MAX_CHARS).collect();
    (!text.is_empty()).then_some(text)
}

/// Error from the HTTP status alone, when the body says nothing usable.
pub fn error_from_status(status: u16, retry_after: Option<u64>) -> ProviderError {
    match status {
        401 => ProviderError::Authentication,
        402 => ProviderError::QuotaExceeded,
        403 => ProviderError::PermissionDenied,
        404 => ProviderError::ModelNotFound,
        408 | 504 => ProviderError::Timeout,
        429 => ProviderError::RateLimited {
            retry_after_seconds: retry_after,
        },
        503 | 529 => ProviderError::Overloaded,
        500..=599 => ProviderError::Server { status },
        _ => ProviderError::InvalidRequest { detail: None },
    }
}

/// Parses a response body as JSON, or reports an unreadable response.
pub fn json(body: &[u8]) -> Result<serde_json::Value, ProviderError> {
    serde_json::from_slice(body).map_err(|_| ProviderError::InvalidResponse)
}

/// A string field of a JSON object.
pub fn text<'a>(value: &'a serde_json::Value, field: &str) -> Option<&'a str> {
    value.get(field).and_then(serde_json::Value::as_str)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn model_identifiers_of_the_three_providers_pass_and_nothing_else() {
        for valid in [
            "claude-opus-5-5",
            "gpt-5.1-mini",
            "gemini-2.5-flash",
            "ft:gpt-4o-mini:org:custom:abc123",
        ] {
            check_model(valid).expect(valid);
        }
        for invalid in ["", "models/../x", "a b", "x?key=1", "é", &"m".repeat(201)] {
            assert!(check_model(invalid).is_err(), "{invalid}");
        }
    }

    #[test]
    fn details_shown_to_the_user_never_carry_a_key() {
        let detail = clean_detail(
            "Incorrect API key provided: sk-proj-abc123************************xyz9. You can find your key.",
        )
        .expect("detail");
        assert!(!detail.contains("abc123"), "{detail}");
        assert!(
            detail.starts_with("Incorrect API key provided:"),
            "{detail}"
        );
        let detail =
            clean_detail("API key AIzaSyD-1234567890abcdefghij not valid").expect("detail");
        assert!(!detail.contains("AIza"), "{detail}");
        assert_eq!(
            clean_detail("max_tokens: 200000 > 128000, which is the maximum").as_deref(),
            Some("max_tokens: 200000 > 128000, which is the maximum")
        );
        assert_eq!(
            clean_detail(&"x ".repeat(400)).map(|text| text.chars().count()),
            Some(300)
        );
        assert_eq!(clean_detail("  "), None);
    }

    #[test]
    fn requests_never_print_their_headers() {
        let request = HttpRequest {
            method: HttpMethod::Get,
            url: "https://api.example.com/v1/models".to_owned(),
            headers: vec![(
                "x-api-key",
                HeaderValue::secret(&Secret::new("sk-hidden-1".to_owned())),
            )],
            body: None,
        };
        let printed = format!("{request:?}");
        assert!(!printed.contains("sk-hidden-1"), "{printed}");
        assert_eq!(request.header("X-API-KEY"), Some("sk-hidden-1"));
    }

    #[test]
    fn the_distributed_build_only_talks_to_the_official_addresses() {
        for kind in ProviderKind::ALL {
            let endpoint = Endpoint::official(*kind);
            assert!(endpoint.0.starts_with("https://"), "{endpoint:?}");
            #[cfg(not(feature = "test-endpoints"))]
            assert_eq!(Endpoint::for_kind(*kind), endpoint);
        }
    }
}

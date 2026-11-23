//! Anthropic: the Messages API (`POST /v1/messages`, streamed), and the Models API for the connection test
//! (`GET /v1/models`). Shapes from Anthropic's documentation, API version 2026-10-21.

use serde_json::{Value, json};

use super::provider::{
    AiProvider, ChatRequest, ChatRole, Endpoint, Finish, HeaderValue, HttpMethod, HttpRequest,
    ModelInfo, ModelPage, ProviderError, ProviderKind, StreamDecoder, StreamEvent, Usage,
    clean_detail, error_from_status, text,
};
use super::secret::Secret;
use super::sse::SseEvent;
use crate::memory::normalize::parse_iso_date;

pub const API_VERSION: &str = "2026-10-21";
/// Beta of the server-side fallback: lets a declined request continue on another Claude model, and makes the
/// Models API say which models accept it.
pub const FALLBACK_BETA: &str = "server-side-fallback-2026-07-01";
const MODELS_PAGE: u32 = 1000;

pub struct Anthropic {
    endpoint: Endpoint,
}

impl Anthropic {
    pub fn new(endpoint: Endpoint) -> Self {
        Self { endpoint }
    }

    fn headers(key: &Secret) -> Vec<(&'static str, HeaderValue)> {
        vec![
            ("x-api-key", HeaderValue::secret(key)),
            ("anthropic-version", HeaderValue::plain(API_VERSION)),
        ]
    }
}

fn error_of(error: &Value, status: Option<u16>, retry_after: Option<u64>) -> ProviderError {
    let detail = text(error, "message").and_then(clean_detail);
    match text(error, "type") {
        Some("authentication_error") => ProviderError::Authentication,
        Some("permission_error") => ProviderError::PermissionDenied,
        Some("not_found_error") => ProviderError::ModelNotFound,
        Some("rate_limit_error") => ProviderError::RateLimited {
            retry_after_seconds: retry_after,
        },
        Some("billing_error") => ProviderError::QuotaExceeded,
        Some("overloaded_error") => ProviderError::Overloaded,
        Some("invalid_request_error" | "request_too_large") => {
            ProviderError::InvalidRequest { detail }
        }
        Some("api_error") => ProviderError::Server {
            status: status.unwrap_or(500),
        },
        Some("timeout_error") => ProviderError::Timeout,
        _ => match status {
            Some(status) => error_from_status(status, retry_after),
            None => ProviderError::Server { status: 500 },
        },
    }
}

impl AiProvider for Anthropic {
    fn kind(&self) -> ProviderKind {
        ProviderKind::Anthropic
    }

    fn models_request(&self, key: &Secret, cursor: Option<&str>) -> HttpRequest {
        let mut url = self
            .endpoint
            .url(&format!("/v1/models?limit={MODELS_PAGE}"));
        if let Some(cursor) = cursor {
            url.push_str("&after_id=");
            url.push_str(&encode(cursor));
        }
        let mut headers = Self::headers(key);
        headers.push(("anthropic-beta", HeaderValue::plain(FALLBACK_BETA)));
        HttpRequest {
            method: HttpMethod::Get,
            url,
            headers,
            body: None,
        }
    }

    fn parse_models(&self, body: &[u8]) -> Result<ModelPage, ProviderError> {
        let value = super::provider::json(body)?;
        let data = value
            .get("data")
            .and_then(Value::as_array)
            .ok_or(ProviderError::InvalidResponse)?;
        let models = data
            .iter()
            .filter_map(|model| {
                let id = text(model, "id")?.to_owned();
                if text(model, "lifecycle") == Some("retired") {
                    return None;
                }
                Some(ModelInfo {
                    name: text(model, "display_name").unwrap_or(&id).to_owned(),
                    created_at: text(model, "created_at").and_then(parse_iso_date),
                    max_output_tokens: model
                        .get("max_tokens")
                        .and_then(Value::as_u64)
                        .and_then(|tokens| u32::try_from(tokens).ok())
                        .filter(|tokens| *tokens > 0),
                    deprecated: text(model, "lifecycle") == Some("deprecated"),
                    refusal_fallback: model
                        .get("allowed_fallback_models")
                        .and_then(Value::as_array)
                        .is_some_and(|models| !models.is_empty()),
                    id,
                })
            })
            .collect();
        let next = (value.get("has_more").and_then(Value::as_bool) == Some(true))
            .then(|| text(&value, "last_id").map(str::to_owned))
            .flatten();
        Ok(ModelPage { models, next })
    }

    fn chat_request(&self, key: &Secret, request: &ChatRequest<'_>) -> HttpRequest {
        let messages: Vec<Value> = request
            .messages
            .iter()
            .map(|message| {
                json!({
                    "role": match message.role {
                        ChatRole::User => "user",
                        ChatRole::Assistant => "assistant",
                    },
                    "content": message.content,
                })
            })
            .collect();
        let mut body = json!({
            "model": request.model,
            "max_tokens": request.max_output_tokens,
            "stream": true,
            "system": request.system,
            "messages": messages,
        });
        let mut headers = Self::headers(key);
        headers.push(("content-type", HeaderValue::plain("application/json")));
        if request.refusal_fallback {
            body["fallbacks"] = json!("default");
            headers.push(("anthropic-beta", HeaderValue::plain(FALLBACK_BETA)));
        }
        HttpRequest {
            method: HttpMethod::Post,
            url: self.endpoint.url("/v1/messages"),
            headers,
            body: Some(body.to_string().into_bytes()),
        }
    }

    fn decoder(&self) -> Box<dyn StreamDecoder> {
        Box::new(Decoder::default())
    }

    fn error(&self, status: u16, retry_after: Option<u64>, body: &[u8]) -> ProviderError {
        match serde_json::from_slice::<Value>(body) {
            Ok(value) if value.get("error").is_some() => {
                error_of(&value["error"], Some(status), retry_after)
            }
            _ => error_from_status(status, retry_after),
        }
    }
}

/// Percent-encodes a query value (a model identifier used as a cursor).
fn encode(value: &str) -> String {
    value
        .bytes()
        .map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                (byte as char).to_string()
            }
            _ => format!("%{byte:02X}"),
        })
        .collect()
}

#[derive(Default)]
struct Decoder {
    stop_reason: Option<String>,
    stop_details: Option<Value>,
    finished: bool,
}

fn usage_of(usage: &Value) -> Usage {
    let count = |field: &str| usage.get(field).and_then(Value::as_u64);
    // Prompt caching splits the input: what was written to and read from the cache is input too.
    let input = [
        "input_tokens",
        "cache_creation_input_tokens",
        "cache_read_input_tokens",
    ]
    .iter()
    .filter_map(|field| count(field))
    .reduce(|total, tokens| total + tokens);
    Usage {
        input_tokens: input,
        output_tokens: count("output_tokens"),
    }
}

impl StreamDecoder for Decoder {
    fn decode(&mut self, event: &SseEvent) -> Vec<StreamEvent> {
        let Ok(value) = serde_json::from_str::<Value>(&event.data) else {
            return vec![StreamEvent::Failed(ProviderError::InvalidResponse)];
        };
        let mut events = Vec::new();
        match text(&value, "type") {
            Some("message_start") => {
                let message = &value["message"];
                if let Some(model) = text(message, "model") {
                    events.push(StreamEvent::Model(model.to_owned()));
                }
                if let Some(usage) = message.get("usage") {
                    events.push(StreamEvent::Usage(usage_of(usage)));
                }
            }
            Some("content_block_start") => {
                let block = &value["content_block"];
                match text(block, "type") {
                    Some("fallback") => events.push(StreamEvent::Switched {
                        from: text(&block["from"], "model").unwrap_or_default().to_owned(),
                        to: text(&block["to"], "model").unwrap_or_default().to_owned(),
                    }),
                    Some("text") => {
                        if let Some(initial) = text(block, "text").filter(|text| !text.is_empty()) {
                            events.push(StreamEvent::Text(initial.to_owned()));
                        }
                    }
                    _ => {}
                }
            }
            Some("content_block_delta") => {
                let delta = &value["delta"];
                if text(delta, "type") == Some("text_delta")
                    && let Some(fragment) = text(delta, "text")
                {
                    events.push(StreamEvent::Text(fragment.to_owned()));
                }
            }
            Some("message_delta") => {
                if let Some(reason) = text(&value["delta"], "stop_reason") {
                    self.stop_reason = Some(reason.to_owned());
                }
                if let Some(details) = value["delta"].get("stop_details").filter(|v| v.is_object())
                {
                    self.stop_details = Some(details.clone());
                }
                if let Some(usage) = value.get("usage") {
                    events.push(StreamEvent::Usage(usage_of(usage)));
                }
            }
            Some("message_stop") => {
                self.finished = true;
                let finish = match self.stop_reason.as_deref() {
                    Some("max_tokens" | "model_context_window_exceeded") => Finish::MaxTokens,
                    Some("refusal") => {
                        let details = self.stop_details.take().unwrap_or(Value::Null);
                        Finish::Refused {
                            category: text(&details, "category").map(str::to_owned),
                            explanation: text(&details, "explanation").map(str::to_owned),
                        }
                    }
                    _ => Finish::Complete,
                };
                events.push(StreamEvent::Finished(finish));
            }
            Some("error") => {
                self.finished = true;
                events.push(StreamEvent::Failed(error_of(&value["error"], None, None)));
            }
            // ping, content_block_stop, thinking and other blocks carry nothing to show.
            _ => {}
        }
        events
    }

    fn end(&mut self) -> Vec<StreamEvent> {
        if self.finished {
            Vec::new()
        } else {
            vec![StreamEvent::Failed(ProviderError::Interrupted)]
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::provider::ChatMessage;
    use crate::ai::sse::SseDecoder;

    fn anthropic() -> Anthropic {
        Anthropic::new(Endpoint::official(ProviderKind::Anthropic))
    }

    fn key() -> Secret {
        Secret::new("sk-ant-test-0001".to_owned())
    }

    fn decode(stream: &str) -> Vec<StreamEvent> {
        let mut sse = SseDecoder::new();
        let mut decoder = anthropic().decoder();
        let mut events: Vec<StreamEvent> = Vec::new();
        for event in sse.push(stream.as_bytes()).expect("bounded") {
            events.extend(decoder.decode(&event));
        }
        for event in sse.finish() {
            events.extend(decoder.decode(&event));
        }
        events.extend(decoder.end());
        events
    }

    #[test]
    fn the_request_follows_the_messages_api() {
        let messages = [
            ChatMessage {
                role: ChatRole::User,
                content: "Bonjour".to_owned(),
            },
            ChatMessage {
                role: ChatRole::Assistant,
                content: "Bonjour !".to_owned(),
            },
            ChatMessage {
                role: ChatRole::User,
                content: "Explique le NE555".to_owned(),
            },
        ];
        let mut chat = ChatRequest {
            model: "claude-opus-5-5",
            system: "Tu es l'assistant d'ARCHIVE.",
            messages: &messages,
            max_output_tokens: 16_000,
            refusal_fallback: false,
        };
        let request = anthropic().chat_request(&key(), &chat);
        assert_eq!(request.method, HttpMethod::Post);
        assert_eq!(request.url, "https://api.anthropic.com/v1/messages");
        assert_eq!(request.header("x-api-key"), Some("sk-ant-test-0001"));
        assert_eq!(request.header("anthropic-version"), Some("2026-10-21"));
        assert_eq!(request.header("anthropic-beta"), None);
        let body = request.json_body();
        assert_eq!(body["model"], "claude-opus-5-5");
        assert_eq!(body["max_tokens"], 16_000);
        assert_eq!(body["stream"], true);
        assert_eq!(body["system"], "Tu es l'assistant d'ARCHIVE.");
        assert_eq!(body["messages"][1]["role"], "assistant");
        assert_eq!(body["messages"][2]["content"], "Explique le NE555");
        // The sampling parameters are refused by this API version.
        for removed in ["temperature", "top_p", "top_k", "fallbacks"] {
            assert!(body.get(removed).is_none(), "{removed}");
        }

        chat.refusal_fallback = true;
        let request = anthropic().chat_request(&key(), &chat);
        assert_eq!(request.header("anthropic-beta"), Some(FALLBACK_BETA));
        assert_eq!(request.json_body()["fallbacks"], "default");
    }

    #[test]
    fn the_models_of_the_account_are_read_with_their_limits() {
        let request = anthropic().models_request(&key(), Some("claude-x"));
        assert_eq!(
            request.url,
            "https://api.anthropic.com/v1/models?limit=1000&after_id=claude-x"
        );
        assert_eq!(request.header("anthropic-beta"), Some(FALLBACK_BETA));
        let page = anthropic()
            .parse_models(
                br#"{"data":[
                {"type":"model","id":"claude-opus-5-5","display_name":"Claude Opus 5.5","created_at":"2026-09-21T00:00:00Z","max_tokens":128000,"lifecycle":"active","allowed_fallback_models":["claude-opus-5"]},
                {"type":"model","id":"claude-haiku-5-5","display_name":"Claude Haiku 5.5","created_at":"2026-08-01T00:00:00Z","max_tokens":128000,"lifecycle":"active","allowed_fallback_models":[]},
                {"type":"model","id":"claude-sonnet-4-5","display_name":"Claude Sonnet 4.5","created_at":"2025-09-29T00:00:00Z","max_tokens":64000,"lifecycle":"deprecated","allowed_fallback_models":null},
                {"type":"model","id":"claude-3-opus","lifecycle":"retired"}
            ],"has_more":true,"first_id":"claude-opus-5-5","last_id":"claude-sonnet-4-5"}"#,
            )
            .expect("models");
        assert_eq!(page.next.as_deref(), Some("claude-sonnet-4-5"));
        let ids: Vec<&str> = page.models.iter().map(|model| model.id.as_str()).collect();
        assert_eq!(
            ids,
            ["claude-opus-5-5", "claude-haiku-5-5", "claude-sonnet-4-5"]
        );
        assert_eq!(page.models[0].name, "Claude Opus 5.5");
        assert_eq!(page.models[0].max_output_tokens, Some(128_000));
        assert!(page.models[0].created_at.is_some());
        assert!(page.models[0].refusal_fallback);
        assert!(!page.models[1].refusal_fallback);
        assert!(page.models[2].deprecated);
        assert_eq!(
            anthropic().parse_models(br#"{"data":[],"has_more":false,"last_id":null}"#),
            Ok(ModelPage {
                models: Vec::new(),
                next: None
            })
        );
        assert_eq!(
            anthropic().parse_models(b"<html>"),
            Err(ProviderError::InvalidResponse)
        );
    }

    #[test]
    fn a_streamed_answer_gives_its_text_usage_and_end() {
        let events = decode(concat!(
            "event: message_start\n",
            "data: {\"type\":\"message_start\",\"message\":{\"id\":\"msg_1\",\"type\":\"message\",\"role\":\"assistant\",\"model\":\"claude-opus-5-5\",\"content\":[],\"stop_reason\":null,\"usage\":{\"input_tokens\":412,\"cache_read_input_tokens\":100,\"output_tokens\":1}}}\n\n",
            "event: content_block_start\n",
            "data: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"thinking\",\"thinking\":\"\"}}\n\n",
            "event: content_block_delta\n",
            "data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"signature_delta\",\"signature\":\"abc\"}}\n\n",
            "event: content_block_start\n",
            "data: {\"type\":\"content_block_start\",\"index\":1,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}\n\n",
            "event: ping\ndata: {\"type\":\"ping\"}\n\n",
            "event: content_block_delta\n",
            "data: {\"type\":\"content_block_delta\",\"index\":1,\"delta\":{\"type\":\"text_delta\",\"text\":\"Le NE555 \"}}\n\n",
            "event: content_block_delta\n",
            "data: {\"type\":\"content_block_delta\",\"index\":1,\"delta\":{\"type\":\"text_delta\",\"text\":\"[S1].\"}}\n\n",
            "event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":1}\n\n",
            "event: message_delta\n",
            "data: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\",\"stop_details\":null},\"usage\":{\"output_tokens\":12}}\n\n",
            "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n",
        ));
        assert_eq!(
            events,
            vec![
                StreamEvent::Model("claude-opus-5-5".to_owned()),
                StreamEvent::Usage(Usage {
                    input_tokens: Some(512),
                    output_tokens: Some(1)
                }),
                StreamEvent::Text("Le NE555 ".to_owned()),
                StreamEvent::Text("[S1].".to_owned()),
                StreamEvent::Usage(Usage {
                    input_tokens: None,
                    output_tokens: Some(12)
                }),
                StreamEvent::Finished(Finish::Complete),
            ]
        );
    }

    #[test]
    fn refusals_fallbacks_limits_and_errors_are_told_apart() {
        let refused = decode(concat!(
            "event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"model\":\"claude-opus-5-5\",\"usage\":{\"input_tokens\":10,\"output_tokens\":0}}}\n\n",
            "event: message_delta\ndata: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"refusal\",\"stop_details\":{\"type\":\"refusal\",\"category\":\"cyber\",\"explanation\":\"This request was declined.\"}},\"usage\":{\"output_tokens\":0}}\n\n",
            "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n",
        ));
        assert_eq!(
            refused.last(),
            Some(&StreamEvent::Finished(Finish::Refused {
                category: Some("cyber".to_owned()),
                explanation: Some("This request was declined.".to_owned()),
            }))
        );

        let switched = decode(concat!(
            "event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"model\":\"claude-opus-5\",\"usage\":{\"input_tokens\":10}}}\n\n",
            "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"fallback\",\"from\":{\"model\":\"claude-opus-5-5\"},\"to\":{\"model\":\"claude-opus-5\"},\"trigger\":{\"type\":\"refusal\",\"category\":\"cyber\"}}}\n\n",
            "event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":0}\n\n",
            "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":1,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}\n\n",
            "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":1,\"delta\":{\"type\":\"text_delta\",\"text\":\"Réponse\"}}\n\n",
            "event: message_delta\ndata: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"max_tokens\"},\"usage\":{\"output_tokens\":5}}\n\n",
            "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n",
        ));
        assert!(switched.contains(&StreamEvent::Switched {
            from: "claude-opus-5-5".to_owned(),
            to: "claude-opus-5".to_owned()
        }));
        assert_eq!(
            switched.last(),
            Some(&StreamEvent::Finished(Finish::MaxTokens))
        );

        let overloaded = decode(
            "event: error\ndata: {\"type\":\"error\",\"error\":{\"type\":\"overloaded_error\",\"message\":\"Overloaded\"}}\n\n",
        );
        assert_eq!(
            overloaded,
            vec![StreamEvent::Failed(ProviderError::Overloaded)]
        );

        let cut = decode(
            "event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"model\":\"m\"}}\n\nevent: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"Le\"}}\n\n",
        );
        assert_eq!(
            cut.last(),
            Some(&StreamEvent::Failed(ProviderError::Interrupted))
        );
        assert_eq!(
            decode("data: not json\n\n").first(),
            Some(&StreamEvent::Failed(ProviderError::InvalidResponse))
        );
    }

    #[test]
    fn error_responses_map_to_stable_categories() {
        let provider = anthropic();
        let body = |kind: &str, message: &str| {
            format!(r#"{{"type":"error","error":{{"type":"{kind}","message":"{message}"}},"request_id":"req_1"}}"#)
                .into_bytes()
        };
        assert_eq!(
            provider.error(
                401,
                None,
                &body("authentication_error", "invalid x-api-key")
            ),
            ProviderError::Authentication
        );
        assert_eq!(
            provider.error(404, None, &body("not_found_error", "model: claude-x")),
            ProviderError::ModelNotFound
        );
        assert_eq!(
            provider.error(429, Some(20), &body("rate_limit_error", "slow down")),
            ProviderError::RateLimited {
                retry_after_seconds: Some(20)
            }
        );
        assert_eq!(
            provider.error(402, None, &body("billing_error", "credit")),
            ProviderError::QuotaExceeded
        );
        assert_eq!(
            provider.error(529, None, &body("overloaded_error", "Overloaded")),
            ProviderError::Overloaded
        );
        assert_eq!(
            provider.error(
                400,
                None,
                &body("invalid_request_error", "prompt is too long")
            ),
            ProviderError::InvalidRequest {
                detail: Some("prompt is too long".to_owned())
            }
        );
        assert_eq!(
            provider.error(502, None, b"<html>Bad gateway</html>"),
            ProviderError::Server { status: 502 }
        );
        assert_eq!(
            provider.error(403, None, &body("permission_error", "no")),
            ProviderError::PermissionDenied
        );
    }
}

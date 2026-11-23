//! Google Gemini: `models/{model}:streamGenerateContent?alt=sse` for the answers, and the models list for the
//! connection test (`GET /v1beta/models`). The key travels in the `x-goog-api-key` header, never in the URL.

use serde_json::{Value, json};

use super::provider::{
    AiProvider, ChatRequest, ChatRole, Endpoint, Finish, HeaderValue, HttpMethod, HttpRequest,
    ModelInfo, ModelPage, ProviderError, ProviderKind, StreamDecoder, StreamEvent, Usage,
    clean_detail, error_from_status, text,
};
use super::secret::Secret;
use super::sse::SseEvent;

const MODELS_PAGE: u32 = 1000;

pub struct Gemini {
    endpoint: Endpoint,
}

impl Gemini {
    pub fn new(endpoint: Endpoint) -> Self {
        Self { endpoint }
    }
}

fn error_of(error: &Value, status: Option<u16>, retry_after: Option<u64>) -> ProviderError {
    let reasons: Vec<&str> = error
        .get("details")
        .and_then(Value::as_array)
        .map(|details| {
            details
                .iter()
                .filter_map(|detail| text(detail, "reason"))
                .collect()
        })
        .unwrap_or_default();
    if reasons
        .iter()
        .any(|reason| matches!(*reason, "API_KEY_INVALID" | "API_KEY_EXPIRED"))
    {
        return ProviderError::Authentication;
    }
    let status = status.or_else(|| {
        error
            .get("code")
            .and_then(Value::as_u64)
            .and_then(|code| u16::try_from(code).ok())
    });
    match text(error, "status") {
        Some("UNAUTHENTICATED") => ProviderError::Authentication,
        Some("PERMISSION_DENIED") => ProviderError::PermissionDenied,
        Some("NOT_FOUND") => ProviderError::ModelNotFound,
        Some("RESOURCE_EXHAUSTED") => ProviderError::RateLimited {
            retry_after_seconds: retry_after,
        },
        Some("UNAVAILABLE") => ProviderError::Overloaded,
        Some("DEADLINE_EXCEEDED") => ProviderError::Timeout,
        Some("INTERNAL") => ProviderError::Server {
            status: status.unwrap_or(500),
        },
        Some("INVALID_ARGUMENT" | "FAILED_PRECONDITION" | "OUT_OF_RANGE") => {
            ProviderError::InvalidRequest {
                detail: text(error, "message").and_then(clean_detail),
            }
        }
        _ => match status {
            Some(status) => error_from_status(status, retry_after),
            None => ProviderError::Server { status: 500 },
        },
    }
}

impl AiProvider for Gemini {
    fn kind(&self) -> ProviderKind {
        ProviderKind::Gemini
    }

    fn models_request(&self, key: &Secret, cursor: Option<&str>) -> HttpRequest {
        let mut url = self
            .endpoint
            .url(&format!("/v1beta/models?pageSize={MODELS_PAGE}"));
        if let Some(cursor) = cursor.filter(|cursor| {
            cursor
                .chars()
                .all(|character| character.is_ascii_alphanumeric() || "-_=".contains(character))
        }) {
            url.push_str("&pageToken=");
            url.push_str(cursor);
        }
        HttpRequest {
            method: HttpMethod::Get,
            url,
            headers: vec![("x-goog-api-key", HeaderValue::secret(key))],
            body: None,
        }
    }

    fn parse_models(&self, body: &[u8]) -> Result<ModelPage, ProviderError> {
        let value = super::provider::json(body)?;
        let Some(list) = value.get("models") else {
            // An account without models answers `{}`.
            return if value.is_object() {
                Ok(ModelPage {
                    models: Vec::new(),
                    next: None,
                })
            } else {
                Err(ProviderError::InvalidResponse)
            };
        };
        let list = list.as_array().ok_or(ProviderError::InvalidResponse)?;
        let models = list
            .iter()
            .filter(|model| {
                // Only the models that write text: the provider lists embeddings and others too.
                model
                    .get("supportedGenerationMethods")
                    .and_then(Value::as_array)
                    .is_some_and(|methods| methods.iter().any(|method| method == "generateContent"))
            })
            .filter_map(|model| {
                let id = text(model, "name")?.strip_prefix("models/")?.to_owned();
                Some(ModelInfo {
                    name: text(model, "displayName").unwrap_or(&id).to_owned(),
                    created_at: None,
                    max_output_tokens: model
                        .get("outputTokenLimit")
                        .and_then(Value::as_u64)
                        .and_then(|tokens| u32::try_from(tokens).ok())
                        .filter(|tokens| *tokens > 0),
                    deprecated: false,
                    refusal_fallback: false,
                    id,
                })
            })
            .collect();
        Ok(ModelPage {
            models,
            next: text(&value, "nextPageToken")
                .filter(|token| !token.is_empty())
                .map(str::to_owned),
        })
    }

    fn chat_request(&self, key: &Secret, request: &ChatRequest<'_>) -> HttpRequest {
        let contents: Vec<Value> = request
            .messages
            .iter()
            .map(|message| {
                json!({
                    "role": match message.role {
                        ChatRole::User => "user",
                        ChatRole::Assistant => "model",
                    },
                    "parts": [{ "text": message.content }],
                })
            })
            .collect();
        let body = json!({
            "systemInstruction": { "parts": [{ "text": request.system }] },
            "contents": contents,
            "generationConfig": { "maxOutputTokens": request.max_output_tokens },
        });
        HttpRequest {
            method: HttpMethod::Post,
            // The identifier was checked (letters, digits, « . _ : - »): it cannot change the path.
            url: self.endpoint.url(&format!(
                "/v1beta/models/{}:streamGenerateContent?alt=sse",
                request.model
            )),
            headers: vec![
                ("x-goog-api-key", HeaderValue::secret(key)),
                ("content-type", HeaderValue::plain("application/json")),
            ],
            body: Some(body.to_string().into_bytes()),
        }
    }

    fn decoder(&self) -> Box<dyn StreamDecoder> {
        Box::new(Decoder::default())
    }

    fn error(&self, status: u16, retry_after: Option<u64>, body: &[u8]) -> ProviderError {
        let value = serde_json::from_slice::<Value>(body).ok();
        // Errors come as an object, or as a list holding one.
        let error = value.as_ref().and_then(|value| {
            value
                .get("error")
                .or_else(|| value.as_array()?.first()?.get("error"))
        });
        match error {
            Some(error) if error.is_object() => error_of(error, Some(status), retry_after),
            _ => error_from_status(status, retry_after),
        }
    }
}

#[derive(Default)]
struct Decoder {
    model_known: bool,
    finish: Option<Finish>,
    failed: bool,
}

fn finish_of(reason: &str) -> Finish {
    match reason {
        "STOP" | "FINISH_REASON_UNSPECIFIED" => Finish::Complete,
        "MAX_TOKENS" => Finish::MaxTokens,
        other => Finish::Blocked {
            reason: other.to_ascii_lowercase(),
        },
    }
}

impl StreamDecoder for Decoder {
    fn decode(&mut self, event: &SseEvent) -> Vec<StreamEvent> {
        let Ok(value) = serde_json::from_str::<Value>(&event.data) else {
            return vec![StreamEvent::Failed(ProviderError::InvalidResponse)];
        };
        if let Some(error) = value.get("error").filter(|error| error.is_object()) {
            self.failed = true;
            return vec![StreamEvent::Failed(error_of(error, None, None))];
        }
        let mut events = Vec::new();
        if !self.model_known
            && let Some(model) = text(&value, "modelVersion")
        {
            self.model_known = true;
            events.push(StreamEvent::Model(model.to_owned()));
        }
        if let Some(reason) = text(&value["promptFeedback"], "blockReason") {
            self.finish = Some(Finish::Blocked {
                reason: format!("prompt_{}", reason.to_ascii_lowercase()),
            });
        }
        if let Some(candidate) = value
            .get("candidates")
            .and_then(Value::as_array)
            .and_then(|candidates| candidates.first())
        {
            let parts = candidate["content"]["parts"].as_array();
            for part in parts.into_iter().flatten() {
                // Thought summaries are the model's reasoning, not its answer.
                if part.get("thought").and_then(Value::as_bool) == Some(true) {
                    continue;
                }
                if let Some(fragment) = text(part, "text").filter(|text| !text.is_empty()) {
                    events.push(StreamEvent::Text(fragment.to_owned()));
                }
            }
            if let Some(reason) = text(candidate, "finishReason") {
                self.finish = Some(finish_of(reason));
            }
        }
        if let Some(usage) = value.get("usageMetadata").filter(|usage| usage.is_object()) {
            let count = |field: &str| usage.get(field).and_then(Value::as_u64);
            let output = match (count("candidatesTokenCount"), count("thoughtsTokenCount")) {
                (None, None) => None,
                (answer, thoughts) => Some(answer.unwrap_or(0) + thoughts.unwrap_or(0)),
            };
            events.push(StreamEvent::Usage(Usage {
                input_tokens: count("promptTokenCount"),
                output_tokens: output,
            }));
        }
        events
    }

    fn end(&mut self) -> Vec<StreamEvent> {
        if self.failed {
            return Vec::new();
        }
        vec![match self.finish.take() {
            Some(finish) => StreamEvent::Finished(finish),
            None => StreamEvent::Failed(ProviderError::Interrupted),
        }]
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::provider::ChatMessage;
    use crate::ai::sse::SseDecoder;

    fn gemini() -> Gemini {
        Gemini::new(Endpoint::official(ProviderKind::Gemini))
    }

    fn decode(stream: &str) -> Vec<StreamEvent> {
        let mut sse = SseDecoder::new();
        let mut decoder = gemini().decoder();
        let mut all = sse.push(stream.as_bytes()).expect("bounded");
        all.extend(sse.finish());
        let mut events: Vec<StreamEvent> = Vec::new();
        for event in all {
            events.extend(decoder.decode(&event));
        }
        events.extend(decoder.end());
        events
    }

    #[test]
    fn the_request_names_the_model_in_the_path_and_the_key_in_a_header() {
        let messages = [
            ChatMessage {
                role: ChatRole::User,
                content: "Bonjour".to_owned(),
            },
            ChatMessage {
                role: ChatRole::Assistant,
                content: "Bonjour !".to_owned(),
            },
        ];
        let request = gemini().chat_request(
            &Secret::new("AIza-test-key-0001".to_owned()),
            &ChatRequest {
                model: "gemini-test",
                system: "Consignes",
                messages: &messages,
                max_output_tokens: 4_000,
                refusal_fallback: false,
            },
        );
        assert_eq!(
            request.url,
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-test:streamGenerateContent?alt=sse"
        );
        assert!(!request.url.contains("key="));
        assert_eq!(request.header("x-goog-api-key"), Some("AIza-test-key-0001"));
        let body = request.json_body();
        assert_eq!(body["systemInstruction"]["parts"][0]["text"], "Consignes");
        assert_eq!(body["contents"][0]["role"], "user");
        assert_eq!(body["contents"][1]["role"], "model");
        assert_eq!(body["contents"][1]["parts"][0]["text"], "Bonjour !");
        assert_eq!(body["generationConfig"]["maxOutputTokens"], 4_000);
    }

    #[test]
    fn only_the_models_that_write_text_are_listed() {
        let request =
            gemini().models_request(&Secret::new("AIza-test".to_owned()), Some("tok-2&x"));
        assert_eq!(
            request.url, "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000",
            "a cursor that is not a plain token is ignored"
        );
        let page = gemini()
            .parse_models(br#"{"models":[
                {"name":"models/gemini-test-pro","displayName":"Gemini Test Pro","inputTokenLimit":1048576,"outputTokenLimit":65536,"supportedGenerationMethods":["generateContent","countTokens"]},
                {"name":"models/text-embedding-test","displayName":"Embedding","supportedGenerationMethods":["embedContent"]}
            ],"nextPageToken":"page-2"}"#)
            .expect("models");
        assert_eq!(page.models.len(), 1);
        assert_eq!(page.models[0].id, "gemini-test-pro");
        assert_eq!(page.models[0].name, "Gemini Test Pro");
        assert_eq!(page.models[0].max_output_tokens, Some(65_536));
        assert_eq!(page.next.as_deref(), Some("page-2"));
        assert_eq!(
            gemini().parse_models(b"{}").map(|page| page.models.len()),
            Ok(0)
        );
    }

    #[test]
    fn a_streamed_answer_gives_its_text_usage_and_end_without_the_thoughts() {
        let events = decode(concat!(
            "data: {\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"Je réfléchis\",\"thought\":true}],\"role\":\"model\"},\"index\":0}],\"modelVersion\":\"gemini-test-001\"}\r\n\r\n",
            "data: {\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"Le NE555\"}],\"role\":\"model\"},\"index\":0}],\"modelVersion\":\"gemini-test-001\"}\r\n\r\n",
            "data: {\"candidates\":[{\"content\":{\"parts\":[{\"text\":\" [S1].\"}],\"role\":\"model\"},\"finishReason\":\"STOP\",\"index\":0}],\"usageMetadata\":{\"promptTokenCount\":80,\"candidatesTokenCount\":12,\"thoughtsTokenCount\":30,\"totalTokenCount\":122},\"modelVersion\":\"gemini-test-001\"}\r\n\r\n",
        ));
        assert_eq!(
            events,
            vec![
                StreamEvent::Model("gemini-test-001".to_owned()),
                StreamEvent::Text("Le NE555".to_owned()),
                StreamEvent::Text(" [S1].".to_owned()),
                StreamEvent::Usage(Usage {
                    input_tokens: Some(80),
                    output_tokens: Some(42)
                }),
                StreamEvent::Finished(Finish::Complete),
            ]
        );
    }

    #[test]
    fn blocks_limits_errors_and_cuts_are_told_apart() {
        let blocked = decode(
            "data: {\"promptFeedback\":{\"blockReason\":\"SAFETY\"},\"usageMetadata\":{\"promptTokenCount\":8}}\n\n",
        );
        assert_eq!(
            blocked.last(),
            Some(&StreamEvent::Finished(Finish::Blocked {
                reason: "prompt_safety".to_owned()
            }))
        );
        let limited = decode(
            "data: {\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"Long\"}]},\"finishReason\":\"MAX_TOKENS\"}]}\n\n",
        );
        assert_eq!(
            limited.last(),
            Some(&StreamEvent::Finished(Finish::MaxTokens))
        );
        let recitation = decode("data: {\"candidates\":[{\"finishReason\":\"RECITATION\"}]}\n\n");
        assert_eq!(
            recitation.last(),
            Some(&StreamEvent::Finished(Finish::Blocked {
                reason: "recitation".to_owned()
            }))
        );
        let failed = decode(
            "data: {\"error\":{\"code\":503,\"message\":\"The model is overloaded.\",\"status\":\"UNAVAILABLE\"}}\n\n",
        );
        assert_eq!(failed, vec![StreamEvent::Failed(ProviderError::Overloaded)]);
        let cut =
            decode("data: {\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"Le\"}]}}]}\n\n");
        assert_eq!(
            cut.last(),
            Some(&StreamEvent::Failed(ProviderError::Interrupted))
        );
    }

    #[test]
    fn error_responses_map_to_stable_categories() {
        let provider = gemini();
        assert_eq!(
            provider.error(
                400,
                None,
                br#"{"error":{"code":400,"message":"API key not valid. Please pass a valid API key.","status":"INVALID_ARGUMENT","details":[{"@type":"type.googleapis.com/google.rpc.ErrorInfo","reason":"API_KEY_INVALID","domain":"googleapis.com"}]}}"#
            ),
            ProviderError::Authentication
        );
        assert_eq!(
            provider.error(
                404,
                None,
                br#"{"error":{"code":404,"message":"models/x is not found for API version v1beta","status":"NOT_FOUND"}}"#
            ),
            ProviderError::ModelNotFound
        );
        assert_eq!(
            provider.error(
                429,
                Some(30),
                br#"[{"error":{"code":429,"message":"Quota exceeded","status":"RESOURCE_EXHAUSTED"}}]"#
            ),
            ProviderError::RateLimited {
                retry_after_seconds: Some(30)
            }
        );
        assert_eq!(
            provider.error(
                400,
                None,
                br#"{"error":{"code":400,"message":"User location is not supported for the API use.","status":"FAILED_PRECONDITION"}}"#
            ),
            ProviderError::InvalidRequest {
                detail: Some("User location is not supported for the API use.".to_owned())
            }
        );
        assert_eq!(
            provider.error(
                403,
                None,
                br#"{"error":{"code":403,"message":"denied","status":"PERMISSION_DENIED"}}"#
            ),
            ProviderError::PermissionDenied
        );
        assert_eq!(
            provider.error(500, None, b""),
            ProviderError::Server { status: 500 }
        );
    }
}

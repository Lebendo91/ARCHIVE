//! OpenAI: the Responses API (`POST /v1/responses`, streamed, with `store: false` so that OpenAI keeps no copy
//! for later retrieval), and the Models API for the connection test (`GET /v1/models`).

use serde_json::{Value, json};

use super::provider::{
    AiProvider, ChatRequest, ChatRole, Endpoint, Finish, HeaderValue, HttpMethod, HttpRequest,
    ModelInfo, ModelPage, ProviderError, ProviderKind, StreamDecoder, StreamEvent, Usage,
    clean_detail, error_from_status, text,
};
use super::secret::Secret;
use super::sse::SseEvent;

pub struct OpenAi {
    endpoint: Endpoint,
}

impl OpenAi {
    pub fn new(endpoint: Endpoint) -> Self {
        Self { endpoint }
    }
}

fn bearer(key: &Secret) -> HeaderValue {
    HeaderValue::Secret(format!("Bearer {}", key.expose()))
}

/// Maps an error object (`{ message, type, code }`) of a response or of the stream.
fn error_of(error: &Value, status: Option<u16>, retry_after: Option<u64>) -> ProviderError {
    let code = text(error, "code").or_else(|| text(error, "type"));
    match code {
        Some("invalid_api_key" | "invalid_authentication" | "authentication_error") => {
            ProviderError::Authentication
        }
        Some("insufficient_quota" | "billing_hard_limit_reached") => ProviderError::QuotaExceeded,
        Some("rate_limit_exceeded" | "rate_limit_error") => ProviderError::RateLimited {
            retry_after_seconds: retry_after,
        },
        Some("model_not_found") => ProviderError::ModelNotFound,
        Some("server_error") => ProviderError::Server {
            status: status.unwrap_or(500),
        },
        Some("server_is_overloaded" | "slow_down") => ProviderError::Overloaded,
        _ => match status {
            Some(status) if status != 400 => error_from_status(status, retry_after),
            _ => ProviderError::InvalidRequest {
                detail: text(error, "message").and_then(clean_detail),
            },
        },
    }
}

impl AiProvider for OpenAi {
    fn kind(&self) -> ProviderKind {
        ProviderKind::Openai
    }

    fn models_request(&self, key: &Secret, _cursor: Option<&str>) -> HttpRequest {
        HttpRequest {
            method: HttpMethod::Get,
            url: self.endpoint.url("/v1/models"),
            headers: vec![("authorization", bearer(key))],
            body: None,
        }
    }

    fn parse_models(&self, body: &[u8]) -> Result<ModelPage, ProviderError> {
        let value = super::provider::json(body)?;
        let data = value
            .get("data")
            .and_then(Value::as_array)
            .ok_or(ProviderError::InvalidResponse)?;
        let mut models: Vec<ModelInfo> = data
            .iter()
            .filter_map(|model| {
                let id = text(model, "id")?.to_owned();
                Some(ModelInfo {
                    name: id.clone(),
                    created_at: model
                        .get("created")
                        .and_then(Value::as_i64)
                        .map(|seconds| seconds * 1000),
                    max_output_tokens: None,
                    deprecated: false,
                    refusal_fallback: false,
                    id,
                })
            })
            .collect();
        // The API lists them in no particular order: the most recent first, as the other providers do.
        models.sort_by(|a, b| {
            b.created_at
                .cmp(&a.created_at)
                .then_with(|| a.id.cmp(&b.id))
        });
        Ok(ModelPage { models, next: None })
    }

    fn chat_request(&self, key: &Secret, request: &ChatRequest<'_>) -> HttpRequest {
        let input: Vec<Value> = request
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
        let body = json!({
            "model": request.model,
            "instructions": request.system,
            "input": input,
            "stream": true,
            "store": false,
            "max_output_tokens": request.max_output_tokens,
        });
        HttpRequest {
            method: HttpMethod::Post,
            url: self.endpoint.url("/v1/responses"),
            headers: vec![
                ("authorization", bearer(key)),
                ("content-type", HeaderValue::plain("application/json")),
            ],
            body: Some(body.to_string().into_bytes()),
        }
    }

    fn decoder(&self) -> Box<dyn StreamDecoder> {
        Box::new(Decoder::default())
    }

    fn error(&self, status: u16, retry_after: Option<u64>, body: &[u8]) -> ProviderError {
        match serde_json::from_slice::<Value>(body) {
            Ok(value) if value.get("error").is_some_and(Value::is_object) => {
                error_of(&value["error"], Some(status), retry_after)
            }
            _ => error_from_status(status, retry_after),
        }
    }
}

#[derive(Default)]
struct Decoder {
    refusal: String,
    finished: bool,
}

fn usage_of(response: &Value) -> Option<Usage> {
    let usage = response.get("usage").filter(|usage| usage.is_object())?;
    Some(Usage {
        input_tokens: usage.get("input_tokens").and_then(Value::as_u64),
        output_tokens: usage.get("output_tokens").and_then(Value::as_u64),
    })
}

impl StreamDecoder for Decoder {
    fn decode(&mut self, event: &SseEvent) -> Vec<StreamEvent> {
        if event.data == "[DONE]" {
            return Vec::new();
        }
        let Ok(value) = serde_json::from_str::<Value>(&event.data) else {
            return vec![StreamEvent::Failed(ProviderError::InvalidResponse)];
        };
        let mut events = Vec::new();
        match text(&value, "type") {
            Some("response.created") => {
                if let Some(model) = text(&value["response"], "model") {
                    events.push(StreamEvent::Model(model.to_owned()));
                }
            }
            Some("response.output_text.delta") => {
                if let Some(fragment) = text(&value, "delta") {
                    events.push(StreamEvent::Text(fragment.to_owned()));
                }
            }
            Some("response.refusal.delta") => {
                if let Some(fragment) = text(&value, "delta") {
                    self.refusal.push_str(fragment);
                }
            }
            Some(kind @ ("response.completed" | "response.incomplete")) => {
                self.finished = true;
                let response = &value["response"];
                if let Some(usage) = usage_of(response) {
                    events.push(StreamEvent::Usage(usage));
                }
                let finish = if !self.refusal.is_empty() {
                    Finish::Refused {
                        category: None,
                        explanation: Some(std::mem::take(&mut self.refusal)),
                    }
                } else if kind == "response.completed" {
                    Finish::Complete
                } else {
                    match text(&response["incomplete_details"], "reason") {
                        Some("max_output_tokens") => Finish::MaxTokens,
                        reason => Finish::Blocked {
                            reason: reason.unwrap_or("incomplete").to_owned(),
                        },
                    }
                };
                events.push(StreamEvent::Finished(finish));
            }
            Some("response.failed") => {
                self.finished = true;
                let error = &value["response"]["error"];
                events.push(StreamEvent::Failed(if error.is_object() {
                    error_of(error, None, None)
                } else {
                    ProviderError::Server { status: 500 }
                }));
            }
            Some("error") => {
                self.finished = true;
                let error = value
                    .get("error")
                    .filter(|error| error.is_object())
                    .unwrap_or(&value);
                events.push(StreamEvent::Failed(error_of(error, None, None)));
            }
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

    fn openai() -> OpenAi {
        OpenAi::new(Endpoint::official(ProviderKind::Openai))
    }

    fn decode(stream: &str) -> Vec<StreamEvent> {
        let mut sse = SseDecoder::new();
        let mut decoder = openai().decoder();
        let mut events: Vec<StreamEvent> = Vec::new();
        let mut all = sse.push(stream.as_bytes()).expect("bounded");
        all.extend(sse.finish());
        for event in all {
            events.extend(decoder.decode(&event));
        }
        events.extend(decoder.end());
        events
    }

    #[test]
    fn the_request_follows_the_responses_api_and_asks_not_to_be_stored() {
        let messages = [ChatMessage {
            role: ChatRole::User,
            content: "Explique le NE555".to_owned(),
        }];
        let request = openai().chat_request(
            &Secret::new("sk-proj-test-0001".to_owned()),
            &ChatRequest {
                model: "gpt-test",
                system: "Consignes",
                messages: &messages,
                max_output_tokens: 8_000,
                refusal_fallback: true,
            },
        );
        assert_eq!(request.url, "https://api.openai.com/v1/responses");
        assert_eq!(
            request.header("authorization"),
            Some("Bearer sk-proj-test-0001")
        );
        let body = request.json_body();
        assert_eq!(body["model"], "gpt-test");
        assert_eq!(body["instructions"], "Consignes");
        assert_eq!(body["input"][0]["role"], "user");
        assert_eq!(body["input"][0]["content"], "Explique le NE555");
        assert_eq!(body["stream"], true);
        assert_eq!(body["store"], false);
        assert_eq!(body["max_output_tokens"], 8_000);
        assert!(body.get("fallbacks").is_none());
    }

    #[test]
    fn the_models_are_listed_most_recent_first() {
        let page = openai()
            .parse_models(
                br#"{"object":"list","data":[
                {"id":"model-old","object":"model","created":1700000000,"owned_by":"system"},
                {"id":"model-new","object":"model","created":1760000000,"owned_by":"system"}
            ]}"#,
            )
            .expect("models");
        let ids: Vec<&str> = page.models.iter().map(|model| model.id.as_str()).collect();
        assert_eq!(ids, ["model-new", "model-old"]);
        assert_eq!(page.models[0].created_at, Some(1_760_000_000_000));
        assert_eq!(page.next, None);
        assert_eq!(
            openai().parse_models(b"{}"),
            Err(ProviderError::InvalidResponse)
        );
    }

    #[test]
    fn a_streamed_answer_gives_its_text_usage_and_end() {
        let events = decode(concat!(
            "event: response.created\n",
            "data: {\"type\":\"response.created\",\"sequence_number\":0,\"response\":{\"id\":\"resp_1\",\"status\":\"in_progress\",\"model\":\"gpt-test-2026\"}}\n\n",
            "event: response.output_text.delta\n",
            "data: {\"type\":\"response.output_text.delta\",\"sequence_number\":4,\"item_id\":\"msg_1\",\"output_index\":0,\"content_index\":0,\"delta\":\"Le NE555\"}\n\n",
            "event: response.output_text.delta\n",
            "data: {\"type\":\"response.output_text.delta\",\"sequence_number\":5,\"item_id\":\"msg_1\",\"output_index\":0,\"content_index\":0,\"delta\":\" [S1].\"}\n\n",
            "event: response.completed\n",
            "data: {\"type\":\"response.completed\",\"sequence_number\":9,\"response\":{\"id\":\"resp_1\",\"status\":\"completed\",\"usage\":{\"input_tokens\":120,\"output_tokens\":15,\"total_tokens\":135}}}\n\n",
        ));
        assert_eq!(
            events,
            vec![
                StreamEvent::Model("gpt-test-2026".to_owned()),
                StreamEvent::Text("Le NE555".to_owned()),
                StreamEvent::Text(" [S1].".to_owned()),
                StreamEvent::Usage(Usage {
                    input_tokens: Some(120),
                    output_tokens: Some(15)
                }),
                StreamEvent::Finished(Finish::Complete),
            ]
        );
    }

    #[test]
    fn refusals_limits_failures_and_cuts_are_told_apart() {
        let refused = decode(concat!(
            "data: {\"type\":\"response.refusal.delta\",\"delta\":\"I can't help \"}\n\n",
            "data: {\"type\":\"response.refusal.delta\",\"delta\":\"with that.\"}\n\n",
            "data: {\"type\":\"response.completed\",\"response\":{\"status\":\"completed\"}}\n\n",
        ));
        assert_eq!(
            refused,
            vec![StreamEvent::Finished(Finish::Refused {
                category: None,
                explanation: Some("I can't help with that.".to_owned())
            })]
        );
        let limited = decode(
            "data: {\"type\":\"response.incomplete\",\"response\":{\"status\":\"incomplete\",\"incomplete_details\":{\"reason\":\"max_output_tokens\"},\"usage\":{\"input_tokens\":5,\"output_tokens\":100}}}\n\n",
        );
        assert_eq!(
            limited.last(),
            Some(&StreamEvent::Finished(Finish::MaxTokens))
        );
        let filtered = decode(
            "data: {\"type\":\"response.incomplete\",\"response\":{\"incomplete_details\":{\"reason\":\"content_filter\"}}}\n\n",
        );
        assert_eq!(
            filtered.last(),
            Some(&StreamEvent::Finished(Finish::Blocked {
                reason: "content_filter".to_owned()
            }))
        );
        let failed = decode(
            "data: {\"type\":\"response.failed\",\"response\":{\"status\":\"failed\",\"error\":{\"code\":\"rate_limit_exceeded\",\"message\":\"Slow down\"}}}\n\n",
        );
        assert_eq!(
            failed,
            vec![StreamEvent::Failed(ProviderError::RateLimited {
                retry_after_seconds: None
            })]
        );
        let error = decode(
            "data: {\"type\":\"error\",\"code\":\"model_not_found\",\"message\":\"no such model\",\"param\":null}\n\n",
        );
        assert_eq!(
            error,
            vec![StreamEvent::Failed(ProviderError::ModelNotFound)]
        );
        let cut = decode("data: {\"type\":\"response.output_text.delta\",\"delta\":\"Le\"}\n\n");
        assert_eq!(
            cut.last(),
            Some(&StreamEvent::Failed(ProviderError::Interrupted))
        );
    }

    #[test]
    fn error_responses_map_to_stable_categories() {
        let provider = openai();
        let body = |code: &str, kind: &str| {
            format!(r#"{{"error":{{"message":"Something about sk-proj-abcdef1234567890abcd","type":"{kind}","param":null,"code":"{code}"}}}}"#)
                .into_bytes()
        };
        assert_eq!(
            provider.error(401, None, &body("invalid_api_key", "invalid_request_error")),
            ProviderError::Authentication
        );
        assert_eq!(
            provider.error(429, None, &body("insufficient_quota", "insufficient_quota")),
            ProviderError::QuotaExceeded
        );
        assert_eq!(
            provider.error(429, Some(3), &body("rate_limit_exceeded", "requests")),
            ProviderError::RateLimited {
                retry_after_seconds: Some(3)
            }
        );
        assert_eq!(
            provider.error(404, None, &body("model_not_found", "invalid_request_error")),
            ProviderError::ModelNotFound
        );
        let ProviderError::InvalidRequest { detail } = provider.error(
            400,
            None,
            &body("context_length_exceeded", "invalid_request_error"),
        ) else {
            panic!("invalid request expected");
        };
        let detail = detail.expect("detail");
        assert!(!detail.contains("abcdef"), "{detail}");
        assert_eq!(
            provider.error(503, None, b"upstream"),
            ProviderError::Overloaded
        );
        assert_eq!(
            provider.error(
                403,
                None,
                &body("unsupported_country_region_territory", "request_forbidden")
            ),
            ProviderError::PermissionDenied
        );
    }
}

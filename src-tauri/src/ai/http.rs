//! Sends the requests of the providers. Network access belongs to the core only: HTTPS only in the
//! distributed builds, the operating system's certificate verifier and proxy settings, the key header marked
//! sensitive, and nothing of a request or a response in the logs but its outcome.

use std::sync::OnceLock;
use std::time::Duration;

use tokio::sync::watch;

use super::provider::{
    AiProvider, HeaderValue, HttpMethod, HttpRequest, ModelInfo, ProviderError, StreamEvent,
};
use super::secret::Secret;
use super::sse::SseDecoder;

const CONNECT_TIMEOUT: Duration = Duration::from_secs(15);
/// Longest silence of a stream: some models think for a long time before their first word.
const READ_TIMEOUT: Duration = Duration::from_secs(180);
/// Whole duration of a request that is not streamed (the list of models).
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const BODY_MAX_BYTES: usize = 16 * 1024 * 1024;
const ERROR_BODY_MAX_BYTES: usize = 64 * 1024;
/// Pages of models read at most (thousands of models).
const MODEL_PAGES_MAX: usize = 10;

/// Stops a request in progress.
#[derive(Debug, Clone)]
pub struct Canceller(watch::Sender<bool>);

/// Lets a request notice that it was stopped.
#[derive(Debug, Clone)]
pub struct Cancellation(watch::Receiver<bool>);

pub fn cancellation() -> (Canceller, Cancellation) {
    let (sender, receiver) = watch::channel(false);
    (Canceller(sender), Cancellation(receiver))
}

impl Canceller {
    pub fn cancel(&self) {
        self.0.send_replace(true);
    }
}

impl Cancellation {
    /// Never stopped: for requests nobody can cancel.
    pub fn never() -> Self {
        let (sender, receiver) = watch::channel(false);
        std::mem::forget(sender);
        Self(receiver)
    }

    pub fn is_cancelled(&self) -> bool {
        *self.0.borrow()
    }

    async fn wait(&mut self) {
        if self.0.wait_for(|cancelled| *cancelled).await.is_err() {
            // The canceller is gone without stopping anything: nothing will stop the request any more.
            std::future::pending::<()>().await;
        }
    }
}

fn client() -> Result<&'static reqwest::Client, ProviderError> {
    static CLIENT: OnceLock<Result<reqwest::Client, String>> = OnceLock::new();
    CLIENT
        .get_or_init(|| {
            // rustls needs its cryptography chosen once per process (ring: see Cargo.toml).
            let _ = rustls::crypto::ring::default_provider().install_default();
            let builder = reqwest::Client::builder()
                .connect_timeout(CONNECT_TIMEOUT)
                .read_timeout(READ_TIMEOUT)
                .user_agent(concat!("ARCHIVE/", env!("CARGO_PKG_VERSION")));
            // The tests and the native validation talk to a local server in plain HTTP, without proxy.
            #[cfg(any(test, feature = "test-endpoints"))]
            let builder = builder.no_proxy();
            #[cfg(not(any(test, feature = "test-endpoints")))]
            let builder = builder.https_only(true);
            builder.build().map_err(|error| error.to_string())
        })
        .as_ref()
        .map_err(|reason| {
            log::error!("the HTTPS client could not be created: {reason}");
            ProviderError::Network
        })
}

fn network_error(error: &reqwest::Error) -> ProviderError {
    let kind = if error.is_timeout() {
        ProviderError::Timeout
    } else if error.is_body() || error.is_decode() {
        ProviderError::Interrupted
    } else {
        ProviderError::Network
    };
    // Without the URL: only the kind of failure is useful, and it stays short.
    log::warn!(
        "AI provider unreachable ({}): {}",
        kind.kind(),
        error.without_url_ref()
    );
    kind
}

trait WithoutUrl {
    fn without_url_ref(&self) -> String;
}

impl WithoutUrl for reqwest::Error {
    fn without_url_ref(&self) -> String {
        let mut text = self.to_string();
        if let Some(url) = self.url() {
            text = text.replace(url.as_str(), "<url>");
        }
        text
    }
}

fn request(request: &HttpRequest) -> Result<reqwest::RequestBuilder, ProviderError> {
    let client = client()?;
    let mut builder = match request.method {
        HttpMethod::Get => client.get(&request.url),
        HttpMethod::Post => client.post(&request.url),
    };
    for (name, value) in &request.headers {
        let (text, sensitive) = match value {
            HeaderValue::Plain(text) => (text, false),
            HeaderValue::Secret(text) => (text, true),
        };
        let mut header = reqwest::header::HeaderValue::from_str(text)
            .map_err(|_| ProviderError::InvalidRequest { detail: None })?;
        header.set_sensitive(sensitive);
        builder = builder.header(*name, header);
    }
    if let Some(body) = &request.body {
        builder = builder.body(body.clone());
    }
    Ok(builder)
}

fn retry_after(response: &reqwest::Response) -> Option<u64> {
    response
        .headers()
        .get(reqwest::header::RETRY_AFTER)?
        .to_str()
        .ok()?
        .trim()
        .parse()
        .ok()
}

/// Reads a body, up to a size: an endless body does not fill the memory.
async fn read_body(mut response: reqwest::Response, max: usize) -> Result<Vec<u8>, ProviderError> {
    let mut body = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|error| network_error(&error))?
    {
        if body.len() + chunk.len() > max {
            return Err(ProviderError::InvalidResponse);
        }
        body.extend_from_slice(&chunk);
    }
    Ok(body)
}

async fn error_of(provider: &dyn AiProvider, response: reqwest::Response) -> ProviderError {
    let status = response.status().as_u16();
    let after = retry_after(&response);
    let body = read_body(response, ERROR_BODY_MAX_BYTES)
        .await
        .unwrap_or_default();
    let error = provider.error(status, after, &body);
    log::warn!(
        "AI provider {} answered HTTP {status} ({})",
        provider.kind().as_str(),
        error.kind()
    );
    error
}

/// The models of the account: the connection test. Costs no token.
pub async fn list_models(
    provider: &dyn AiProvider,
    key: &Secret,
) -> Result<Vec<ModelInfo>, ProviderError> {
    let mut models: Vec<ModelInfo> = Vec::new();
    let mut cursor: Option<String> = None;
    for _ in 0..MODEL_PAGES_MAX {
        let http = provider.models_request(key, cursor.as_deref());
        let response = request(&http)?
            .timeout(REQUEST_TIMEOUT)
            .send()
            .await
            .map_err(|error| network_error(&error))?;
        if !response.status().is_success() {
            return Err(error_of(provider, response).await);
        }
        let body = read_body(response, BODY_MAX_BYTES).await?;
        let page = provider.parse_models(&body)?;
        for model in page.models {
            if !models.iter().any(|known| known.id == model.id) {
                models.push(model);
            }
        }
        match page.next {
            Some(next) if Some(&next) != cursor.as_ref() => cursor = Some(next),
            _ => break,
        }
    }
    Ok(models)
}

/// How a stream ended, when it was not an error before the answer began.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StreamEnd {
    /// The provider closed the stream: its events said how the answer ended.
    Closed,
    /// The user stopped it.
    Cancelled,
}

/// Sends a streamed request and hands each event over as it arrives.
pub async fn stream(
    provider: &dyn AiProvider,
    http: HttpRequest,
    mut cancellation: Cancellation,
    mut on_event: impl FnMut(StreamEvent),
) -> Result<StreamEnd, ProviderError> {
    let send = request(&http)?.send();
    drop(http);
    let response = tokio::select! {
        response = send => response.map_err(|error| network_error(&error))?,
        () = cancellation.wait() => return Ok(StreamEnd::Cancelled),
    };
    if !response.status().is_success() {
        return Err(error_of(provider, response).await);
    }
    let mut response = response;
    let mut sse = SseDecoder::new();
    let mut decoder = provider.decoder();
    loop {
        let chunk = tokio::select! {
            chunk = response.chunk() => chunk.map_err(|error| network_error(&error))?,
            () = cancellation.wait() => return Ok(StreamEnd::Cancelled),
        };
        let Some(chunk) = chunk else {
            for event in sse.finish() {
                decoder.decode(&event).into_iter().for_each(&mut on_event);
            }
            decoder.end().into_iter().for_each(&mut on_event);
            return Ok(StreamEnd::Closed);
        };
        let events = sse
            .push(&chunk)
            .map_err(|_| ProviderError::InvalidResponse)?;
        for event in events {
            decoder.decode(&event).into_iter().for_each(&mut on_event);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::provider::{
        ChatMessage, ChatRequest, ChatRole, Endpoint, Finish, ProviderKind,
        provider as implementation,
    };
    use crate::ai::test_server::{Reply, TestServer};

    fn runtime() -> tokio::runtime::Runtime {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("runtime")
    }

    fn key() -> Secret {
        Secret::new("sk-test-local-0001".to_owned())
    }

    fn ask(kind: ProviderKind, base: &str) -> (Box<dyn AiProvider>, HttpRequest) {
        let provider = implementation(kind, Endpoint(base.to_owned()));
        let messages = [ChatMessage {
            role: ChatRole::User,
            content: "Explique le NE555".to_owned(),
        }];
        let http = provider.chat_request(
            &key(),
            &ChatRequest {
                model: "model-test",
                system: "Consignes",
                messages: &messages,
                max_output_tokens: 1000,
                refusal_fallback: false,
            },
        );
        (provider, http)
    }

    fn collect(
        provider: &dyn AiProvider,
        http: HttpRequest,
    ) -> (Result<StreamEnd, ProviderError>, Vec<StreamEvent>) {
        let mut events = Vec::new();
        let end = runtime().block_on(stream(provider, http, Cancellation::never(), |event| {
            events.push(event);
        }));
        (end, events)
    }

    fn text_of(events: &[StreamEvent]) -> String {
        events
            .iter()
            .filter_map(|event| match event {
                StreamEvent::Text(text) => Some(text.as_str()),
                _ => None,
            })
            .collect()
    }

    #[test]
    fn the_three_providers_stream_through_the_network_cut_anywhere() {
        let streams = [
            (
                ProviderKind::Anthropic,
                "/v1/messages",
                concat!(
                    "event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"model\":\"model-test\",\"usage\":{\"input_tokens\":9}}}\n\n",
                    "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"Bonjour \"}}\n\n",
                    "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"l'électronicien\"}}\n\n",
                    "event: message_delta\ndata: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\"},\"usage\":{\"output_tokens\":4}}\n\n",
                    "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n",
                ),
            ),
            (
                ProviderKind::Openai,
                "/v1/responses",
                concat!(
                    "event: response.output_text.delta\ndata: {\"type\":\"response.output_text.delta\",\"delta\":\"Bonjour \"}\n\n",
                    "event: response.output_text.delta\ndata: {\"type\":\"response.output_text.delta\",\"delta\":\"l'électronicien\"}\n\n",
                    "event: response.completed\ndata: {\"type\":\"response.completed\",\"response\":{\"status\":\"completed\",\"usage\":{\"input_tokens\":9,\"output_tokens\":4}}}\n\n",
                ),
            ),
            (
                ProviderKind::Gemini,
                "/v1beta/models/model-test:streamGenerateContent?alt=sse",
                concat!(
                    "data: {\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"Bonjour \"}]}}]}\r\n\r\n",
                    "data: {\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"l'électronicien\"}]},\"finishReason\":\"STOP\"}],\"usageMetadata\":{\"promptTokenCount\":9,\"candidatesTokenCount\":4}}\r\n\r\n",
                ),
            ),
        ];
        for (kind, path, body) in streams {
            // Pieces of 7 bytes: events, lines and the « é » are all cut somewhere.
            let server = TestServer::start(vec![Reply::stream(body, 7)]);
            let (provider, http) = ask(kind, &server.base);
            let (end, events) = collect(provider.as_ref(), http);
            assert_eq!(end, Ok(StreamEnd::Closed), "{kind:?}");
            assert_eq!(text_of(&events), "Bonjour l'électronicien", "{kind:?}");
            assert_eq!(
                events.last(),
                Some(&StreamEvent::Finished(Finish::Complete)),
                "{kind:?}"
            );
            let recorded = server.requests();
            assert_eq!(recorded.len(), 1);
            assert_eq!(recorded[0].method, "POST");
            assert_eq!(recorded[0].path, path, "{kind:?}");
            assert!(
                recorded[0].body_text().contains("Explique le NE555"),
                "{kind:?}"
            );
        }
    }

    #[test]
    fn error_responses_and_unreachable_providers_are_reported() {
        let server = TestServer::start(vec![Reply::json(
            401,
            r#"{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}"#,
        )]);
        let (provider, http) = ask(ProviderKind::Anthropic, &server.base);
        let (end, events) = collect(provider.as_ref(), http);
        assert_eq!(end, Err(ProviderError::Authentication));
        assert!(events.is_empty());

        let server = TestServer::start(vec![
            Reply::json(429, r#"{"error":{"message":"Rate limit","type":"requests","code":"rate_limit_exceeded"}}"#)
                .with_header("retry-after", "12"),
        ]);
        let (provider, http) = ask(ProviderKind::Openai, &server.base);
        assert_eq!(
            collect(provider.as_ref(), http).0,
            Err(ProviderError::RateLimited {
                retry_after_seconds: Some(12)
            })
        );

        // Nothing listens on this port any more.
        let port = std::net::TcpListener::bind("127.0.0.1:0")
            .and_then(|listener| listener.local_addr())
            .expect("local port")
            .port();
        let base = format!("http://127.0.0.1:{port}");
        let (provider, http) = ask(ProviderKind::Gemini, &base);
        assert_eq!(
            collect(provider.as_ref(), http).0,
            Err(ProviderError::Network)
        );
    }

    #[test]
    fn a_stopped_answer_ends_at_once() {
        let server = TestServer::start(vec![Reply::stream(
            "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"Début\"}}\n\n",
            1000,
        )
        .held_open()]);
        let (provider, http) = ask(ProviderKind::Anthropic, &server.base);
        let (canceller, cancellation) = cancellation();
        let mut events = Vec::new();
        let started = std::time::Instant::now();
        let end = runtime().block_on(stream(provider.as_ref(), http, cancellation, |event| {
            if matches!(event, StreamEvent::Text(_)) {
                canceller.cancel();
            }
            events.push(event);
        }));
        assert_eq!(end, Ok(StreamEnd::Cancelled));
        assert_eq!(text_of(&events), "Début");
        assert!(started.elapsed() < Duration::from_secs(5));
    }

    #[test]
    fn the_models_are_read_page_after_page_with_the_key_in_its_header() {
        let server = TestServer::start(vec![
            Reply::json(
                200,
                r#"{"data":[{"id":"model-a","display_name":"Model A","lifecycle":"active"}],"has_more":true,"last_id":"model-a"}"#,
            ),
            Reply::json(
                200,
                r#"{"data":[{"id":"model-b","display_name":"Model B","lifecycle":"active"}],"has_more":false,"last_id":"model-b"}"#,
            ),
        ]);
        let provider = implementation(ProviderKind::Anthropic, Endpoint(server.base.clone()));
        let models = runtime()
            .block_on(list_models(provider.as_ref(), &key()))
            .expect("models");
        let ids: Vec<&str> = models.iter().map(|model| model.id.as_str()).collect();
        assert_eq!(ids, ["model-a", "model-b"]);
        let recorded = server.requests();
        assert_eq!(recorded[0].path, "/v1/models?limit=1000");
        assert_eq!(recorded[1].path, "/v1/models?limit=1000&after_id=model-a");
        assert_eq!(recorded[0].header("x-api-key"), Some("sk-test-local-0001"));
        assert_eq!(recorded[0].method, "GET");

        let server = TestServer::start(vec![Reply::json(
            400,
            r#"{"error":{"code":400,"message":"API key not valid.","status":"INVALID_ARGUMENT","details":[{"reason":"API_KEY_INVALID"}]}}"#,
        )]);
        let provider = implementation(ProviderKind::Gemini, Endpoint(server.base.clone()));
        assert_eq!(
            runtime().block_on(list_models(provider.as_ref(), &key())),
            Err(ProviderError::Authentication)
        );
        assert_eq!(
            server.requests()[0].header("x-goog-api-key"),
            Some("sk-test-local-0001")
        );
    }
}

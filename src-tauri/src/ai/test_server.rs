//! A local HTTP server standing in for the providers in the tests: it records each request and answers with
//! the next prepared reply, in pieces, as a real stream would arrive. No real key, no network.

use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{Arc, Mutex, PoisonError};
use std::thread;
use std::time::Duration;

#[derive(Debug, Clone)]
pub struct Recorded {
    pub method: String,
    pub path: String,
    pub headers: Vec<(String, String)>,
    pub body: Vec<u8>,
}

impl Recorded {
    pub fn header(&self, name: &str) -> Option<&str> {
        self.headers
            .iter()
            .find(|(header, _)| header.eq_ignore_ascii_case(name))
            .map(|(_, value)| value.as_str())
    }

    pub fn body_text(&self) -> String {
        String::from_utf8_lossy(&self.body).into_owned()
    }
}

#[derive(Debug, Clone)]
pub struct Reply {
    status: u16,
    headers: Vec<(String, String)>,
    body: Vec<u8>,
    piece: usize,
    held_open: bool,
}

impl Reply {
    pub fn json(status: u16, body: &str) -> Self {
        Self {
            status,
            headers: vec![("content-type".to_owned(), "application/json".to_owned())],
            body: body.as_bytes().to_vec(),
            piece: usize::MAX,
            held_open: false,
        }
    }

    /// A stream of server-sent events, sent in pieces of `piece` bytes.
    pub fn stream(body: &str, piece: usize) -> Self {
        Self {
            status: 200,
            headers: vec![("content-type".to_owned(), "text/event-stream".to_owned())],
            body: body.as_bytes().to_vec(),
            piece: piece.max(1),
            held_open: false,
        }
    }

    pub fn with_header(mut self, name: &str, value: &str) -> Self {
        self.headers.push((name.to_owned(), value.to_owned()));
        self
    }

    /// The connection stays open after the body, as a provider still thinking would keep it.
    pub fn held_open(mut self) -> Self {
        self.held_open = true;
        self
    }
}

pub struct TestServer {
    pub base: String,
    requests: Arc<Mutex<Vec<Recorded>>>,
}

fn read_request(stream: &TcpStream) -> Option<Recorded> {
    let mut reader = BufReader::new(stream.try_clone().ok()?);
    let mut line = String::new();
    reader.read_line(&mut line).ok()?;
    let mut parts = line.split_whitespace();
    let method = parts.next()?.to_owned();
    let path = parts.next()?.to_owned();
    let mut headers = Vec::new();
    loop {
        let mut header = String::new();
        reader.read_line(&mut header).ok()?;
        let header = header.trim_end();
        if header.is_empty() {
            break;
        }
        if let Some((name, value)) = header.split_once(':') {
            headers.push((name.trim().to_ascii_lowercase(), value.trim().to_owned()));
        }
    }
    let length: usize = headers
        .iter()
        .find(|(name, _)| name == "content-length")
        .and_then(|(_, value)| value.parse().ok())
        .unwrap_or(0);
    let mut body = vec![0; length];
    reader.read_exact(&mut body).ok()?;
    Some(Recorded {
        method,
        path,
        headers,
        body,
    })
}

fn answer(mut stream: TcpStream, reply: &Reply) {
    let mut head = format!("HTTP/1.1 {} Test\r\nconnection: close\r\n", reply.status);
    for (name, value) in &reply.headers {
        head.push_str(&format!("{name}: {value}\r\n"));
    }
    if reply.piece == usize::MAX {
        head.push_str(&format!("content-length: {}\r\n", reply.body.len()));
    }
    head.push_str("\r\n");
    if stream.write_all(head.as_bytes()).is_err() {
        return;
    }
    for piece in reply.body.chunks(reply.piece.min(reply.body.len().max(1))) {
        if stream
            .write_all(piece)
            .and_then(|()| stream.flush())
            .is_err()
        {
            return;
        }
        if reply.piece != usize::MAX {
            thread::sleep(Duration::from_millis(1));
        }
    }
    if reply.held_open {
        // Until the client goes away.
        let _ = stream.set_read_timeout(Some(Duration::from_secs(30)));
        let mut buffer = [0; 64];
        while matches!(stream.read(&mut buffer), Ok(read) if read > 0) {}
    }
}

impl TestServer {
    /// Serves the replies in order, one per connection.
    pub fn start(replies: Vec<Reply>) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").expect("local port");
        let base = format!("http://{}", listener.local_addr().expect("address"));
        let requests = Arc::new(Mutex::new(Vec::new()));
        let recorded = Arc::clone(&requests);
        thread::spawn(move || {
            for reply in replies {
                let Ok((stream, _)) = listener.accept() else {
                    return;
                };
                if let Some(request) = read_request(&stream) {
                    recorded
                        .lock()
                        .unwrap_or_else(PoisonError::into_inner)
                        .push(request);
                }
                answer(stream, &reply);
            }
        });
        Self { base, requests }
    }

    pub fn requests(&self) -> Vec<Recorded> {
        self.requests
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
    }
}

//! Server-sent events, the streaming format of the three providers: bytes in, events out, whatever the size
//! of the chunks the network delivers (an event, a line or even a character may be cut anywhere).

/// One event of the stream.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SseEvent {
    /// The `event:` field, when the server names its events.
    pub event: Option<String>,
    /// The `data:` lines, joined by line breaks.
    pub data: String,
}

/// A line longer than this ends the stream: no provider sends one, and the memory must stay bounded.
const LINE_MAX_BYTES: usize = 8 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LineTooLong;

#[derive(Debug, Default)]
pub struct SseDecoder {
    buffer: Vec<u8>,
    event: Option<String>,
    data: Vec<String>,
    has_data: bool,
}

impl SseDecoder {
    pub fn new() -> Self {
        Self::default()
    }

    /// Feeds bytes; returns the events they complete.
    pub fn push(&mut self, chunk: &[u8]) -> Result<Vec<SseEvent>, LineTooLong> {
        self.buffer.extend_from_slice(chunk);
        let mut events = Vec::new();
        let mut start = 0;
        while let Some(offset) = self.buffer[start..]
            .iter()
            .position(|byte| *byte == b'\n' || *byte == b'\r')
        {
            let end = start + offset;
            let next = match self.buffer[end] {
                // « \r\n » counts as one line break: wait for the next byte when « \r » ends the chunk.
                b'\r' if end + 1 == self.buffer.len() => break,
                b'\r' if self.buffer[end + 1] == b'\n' => end + 2,
                _ => end + 1,
            };
            let line = String::from_utf8_lossy(&self.buffer[start..end]).into_owned();
            if let Some(event) = self.line(&line) {
                events.push(event);
            }
            start = next;
        }
        self.buffer.drain(..start);
        if self.buffer.len() > LINE_MAX_BYTES {
            return Err(LineTooLong);
        }
        Ok(events)
    }

    /// The stream ended: a last event without its closing blank line still counts.
    pub fn finish(&mut self) -> Vec<SseEvent> {
        let mut events = Vec::new();
        if !self.buffer.is_empty() {
            let rest = std::mem::take(&mut self.buffer);
            let line = String::from_utf8_lossy(&rest);
            let line = line.trim_end_matches('\r').to_owned();
            if let Some(event) = self.line(&line) {
                events.push(event);
            }
        }
        if let Some(event) = self.line("") {
            events.push(event);
        }
        events
    }

    fn line(&mut self, line: &str) -> Option<SseEvent> {
        if line.is_empty() {
            let event = self.event.take();
            let data = std::mem::take(&mut self.data);
            let has_data = std::mem::replace(&mut self.has_data, false);
            return has_data.then(|| SseEvent {
                event,
                data: data.join("\n"),
            });
        }
        if line.starts_with(':') {
            return None;
        }
        let (field, value) = match line.split_once(':') {
            Some((field, value)) => (field, value.strip_prefix(' ').unwrap_or(value)),
            None => (line, ""),
        };
        match field {
            "event" => self.event = Some(value.to_owned()),
            "data" => {
                self.data.push(value.to_owned());
                self.has_data = true;
            }
            _ => {}
        }
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn decode_in_pieces(stream: &[u8], piece: usize) -> Vec<SseEvent> {
        let mut decoder = SseDecoder::new();
        let mut events = Vec::new();
        for chunk in stream.chunks(piece) {
            events.extend(decoder.push(chunk).expect("bounded"));
        }
        events.extend(decoder.finish());
        events
    }

    #[test]
    fn events_are_the_same_however_the_stream_is_cut() {
        let stream = "event: message_start\ndata: {\"a\":1}\n\n: a comment\r\nevent: delta\r\ndata: {\"text\":\"é\"}\r\n\r\ndata: first\ndata: second\n\nretry: 10\nid: 7\ndata: [DONE]\n\n".as_bytes();
        let expected = vec![
            SseEvent {
                event: Some("message_start".to_owned()),
                data: "{\"a\":1}".to_owned(),
            },
            SseEvent {
                event: Some("delta".to_owned()),
                data: "{\"text\":\"é\"}".to_owned(),
            },
            SseEvent {
                event: None,
                data: "first\nsecond".to_owned(),
            },
            SseEvent {
                event: None,
                data: "[DONE]".to_owned(),
            },
        ];
        for piece in [1, 2, 3, 7, 64, stream.len()] {
            assert_eq!(
                decode_in_pieces(stream, piece),
                expected,
                "pieces of {piece}"
            );
        }
    }

    #[test]
    fn a_last_event_without_its_blank_line_and_lone_carriage_returns_count() {
        assert_eq!(
            decode_in_pieces(b"data: one\rdata: two\r\rdata: last", 4),
            vec![
                SseEvent {
                    event: None,
                    data: "one\ntwo".to_owned(),
                },
                SseEvent {
                    event: None,
                    data: "last".to_owned(),
                },
            ]
        );
        // A blank line without data dispatches nothing, and the event name does not leak to the next one.
        assert_eq!(
            decode_in_pieces(b"event: ping\n\ndata:x\n\n", 5),
            vec![SseEvent {
                event: None,
                data: "x".to_owned(),
            }]
        );
    }

    #[test]
    fn an_endless_line_stops_the_stream() {
        let mut decoder = SseDecoder::new();
        let chunk = vec![b'a'; 1024 * 1024];
        let mut result = Ok(Vec::new());
        for _ in 0..9 {
            result = decoder.push(&chunk);
            if result.is_err() {
                break;
            }
        }
        assert_eq!(result, Err(LineTooLong));
    }
}

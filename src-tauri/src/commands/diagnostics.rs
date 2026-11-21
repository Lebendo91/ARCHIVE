//! Diagnostics reported by the interface: uncaught errors, unhandled promise rejections and Content
//! Security Policy violations. They are written to the application log file.

use serde::Deserialize;

/// Longest message accepted from the interface, in characters.
pub const MAX_MESSAGE_CHARS: usize = 2_000;

/// Severity of a diagnostic event raised by the interface.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FrontendLogLevel {
    Error,
    Warn,
    Info,
}

/// Records a diagnostic event raised by the interface.
///
/// The interface only reports its own technical errors, never document content. Messages are reduced to
/// a single line and truncated so that a faulty caller cannot flood the log.
#[tauri::command]
pub fn log_frontend_event(level: FrontendLogLevel, message: String) {
    let message = sanitize_message(&message);
    match level {
        FrontendLogLevel::Error => log::error!(target: "frontend", "{message}"),
        FrontendLogLevel::Warn => log::warn!(target: "frontend", "{message}"),
        FrontendLogLevel::Info => log::info!(target: "frontend", "{message}"),
    }
}

/// Replaces control characters (including line breaks) with spaces, trims and truncates the message.
pub fn sanitize_message(message: &str) -> String {
    let single_line: String = message
        .chars()
        .map(|character| {
            if character.is_control() {
                ' '
            } else {
                character
            }
        })
        .collect();
    let trimmed = single_line.trim();
    if trimmed.chars().count() <= MAX_MESSAGE_CHARS {
        return trimmed.to_owned();
    }
    let mut truncated: String = trimmed.chars().take(MAX_MESSAGE_CHARS).collect();
    truncated.push('…');
    truncated
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn control_characters_are_flattened_to_a_single_line() {
        assert_eq!(
            sanitize_message("  first\nsecond\r\tthird \u{7}"),
            "first second  third"
        );
    }

    #[test]
    fn long_messages_are_truncated_on_character_boundaries() {
        let message = "é".repeat(MAX_MESSAGE_CHARS + 50);
        let sanitized = sanitize_message(&message);
        assert_eq!(sanitized.chars().count(), MAX_MESSAGE_CHARS + 1);
        assert!(sanitized.ends_with('…'));
    }

    #[test]
    fn short_messages_are_kept_intact() {
        assert_eq!(
            sanitize_message("CSP violation: style-src"),
            "CSP violation: style-src"
        );
    }

    #[test]
    fn levels_deserialize_from_lowercase_strings_only() {
        let level: FrontendLogLevel = serde_json::from_str("\"warn\"").expect("valid level");
        assert_eq!(level, FrontendLogLevel::Warn);
        assert!(serde_json::from_str::<FrontendLogLevel>("\"WARN\"").is_err());
        assert!(serde_json::from_str::<FrontendLogLevel>("\"debug\"").is_err());
    }
}

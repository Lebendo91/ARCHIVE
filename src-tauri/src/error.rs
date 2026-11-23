//! Centralised application error (specification §18.4).
//!
//! Every command returns `AppResult<T>`. The interface receives `{ code, message }`: the stable code selects
//! a translated message, while the English message is only shown under « Technical details ». Messages of
//! technical errors never contain paths, SQL or document content; the full error goes to the log instead.

use serde::Serialize;
use ts_rs::TS;

/// Stable error codes shared with the interface.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum ErrorCode {
    InvalidInput,
    NotFound,
    NameTaken,
    InUse,
    StaleRevision,
    DuplicateContent,
    DatabaseUnavailable,
    DatabaseTooNew,
    MigrationFailed,
    Storage,
    Database,
    Io,
    /// The operating system's credential store could not be used.
    Credentials,
    Internal,
}

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("invalid input: {0}")]
    InvalidInput(String),
    #[error("{entity} not found")]
    NotFound { entity: &'static str },
    #[error("{entity} name already used")]
    NameTaken { entity: &'static str },
    #[error("{entity} is still in use: {reason}")]
    InUse {
        entity: &'static str,
        reason: String,
    },
    #[error("{entity} was modified elsewhere (expected revision {expected})")]
    StaleRevision { entity: &'static str, expected: i64 },
    #[error("a document with the same content already exists ({existing_id})")]
    DuplicateContent { existing_id: String },
    #[error("database unavailable: {0}")]
    DatabaseUnavailable(String),
    #[error(
        "database created by a newer version of ARCHIVE (schema {found}, supported {supported})"
    )]
    DatabaseTooNew { found: i64, supported: i64 },
    #[error("database migration {version} failed: {reason}")]
    MigrationFailed { version: i64, reason: String },
    #[error("storage error: {0}")]
    Storage(String),
    #[error(transparent)]
    Database(#[from] rusqlite::Error),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error("credential store error: {0}")]
    Credentials(String),
    #[error("internal error: {0}")]
    Internal(String),
}

pub type AppResult<T> = Result<T, AppError>;

/// Serialized form of an error, as received by the interface.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ErrorPayload {
    pub code: ErrorCode,
    pub message: String,
}

impl AppError {
    pub fn code(&self) -> ErrorCode {
        match self {
            Self::InvalidInput(_) => ErrorCode::InvalidInput,
            Self::NotFound { .. } => ErrorCode::NotFound,
            Self::NameTaken { .. } => ErrorCode::NameTaken,
            Self::InUse { .. } => ErrorCode::InUse,
            Self::StaleRevision { .. } => ErrorCode::StaleRevision,
            Self::DuplicateContent { .. } => ErrorCode::DuplicateContent,
            Self::DatabaseUnavailable(_) => ErrorCode::DatabaseUnavailable,
            Self::DatabaseTooNew { .. } => ErrorCode::DatabaseTooNew,
            Self::MigrationFailed { .. } => ErrorCode::MigrationFailed,
            Self::Storage(_) => ErrorCode::Storage,
            Self::Database(_) => ErrorCode::Database,
            Self::Io(_) => ErrorCode::Io,
            Self::Credentials(_) => ErrorCode::Credentials,
            Self::Internal(_) => ErrorCode::Internal,
        }
    }

    /// True for errors caused by the system rather than by the user's input: they are logged in full.
    pub fn is_technical(&self) -> bool {
        matches!(
            self,
            Self::DatabaseUnavailable(_)
                | Self::DatabaseTooNew { .. }
                | Self::MigrationFailed { .. }
                | Self::Storage(_)
                | Self::Database(_)
                | Self::Io(_)
                | Self::Credentials(_)
                | Self::Internal(_)
        )
    }

    /// Message that can be displayed: user errors keep their detail, technical errors stay generic.
    pub fn public_message(&self) -> String {
        match self {
            Self::Database(_) => "A database operation failed.".to_owned(),
            Self::Io(_) => "A file operation failed.".to_owned(),
            Self::Storage(_) => "A storage operation failed.".to_owned(),
            Self::Internal(_) => "An unexpected error occurred.".to_owned(),
            Self::Credentials(_) => "The credential store could not be used.".to_owned(),
            Self::DatabaseUnavailable(_) => "The database is unavailable.".to_owned(),
            other => other.to_string(),
        }
    }

    pub fn payload(&self) -> ErrorPayload {
        ErrorPayload {
            code: self.code(),
            message: self.public_message(),
        }
    }

    /// Logs technical errors with their full detail and returns the error unchanged.
    pub fn logged(self, context: &str) -> Self {
        if self.is_technical() {
            log::error!("{context}: {self}");
        } else {
            log::debug!("{context}: {self}");
        }
        self
    }
}

impl Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        self.payload().serialize(serializer)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn technical_errors_never_expose_their_details() {
        let error = AppError::Io(std::io::Error::other(
            "C:\\Users\\alice\\secret.pdf is locked",
        ));
        let json = serde_json::to_value(&error).expect("serializable");
        assert_eq!(json["code"], "io");
        assert!(
            !json["message"]
                .as_str()
                .unwrap_or_default()
                .contains("alice")
        );
        assert!(error.is_technical());
    }

    #[test]
    fn user_errors_keep_their_detail() {
        let error = AppError::InvalidInput("name is empty".to_owned());
        let json = serde_json::to_value(&error).expect("serializable");
        assert_eq!(json["code"], "invalid_input");
        assert_eq!(json["message"], "invalid input: name is empty");
        assert!(!error.is_technical());
    }
}

//! Repository layer: typed access to each table, with input validation and safe deletion rules
//! (specification §5.2). Functions taking a `Transaction` write; functions taking a `Connection` only read.

pub mod documents;
pub mod folders;
pub mod notes;
pub mod relations;
pub mod resources;
pub mod settings;
pub mod tags;
pub mod timeline;
pub mod workspaces;

use rusqlite::{Connection, ffi};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::error::{AppError, AppResult};

/// Implements text conversions (database and validation) for a field-less enum.
macro_rules! text_enum {
    ($name:ident { $($variant:ident => $text:literal),+ $(,)? }) => {
        impl $name {
            pub const ALL: &'static [$name] = &[$($name::$variant),+];

            pub fn as_str(self) -> &'static str {
                match self {
                    $($name::$variant => $text),+
                }
            }

            pub fn parse(value: &str) -> Option<Self> {
                match value {
                    $($text => Some($name::$variant),)+
                    _ => None,
                }
            }
        }

        impl rusqlite::types::ToSql for $name {
            fn to_sql(&self) -> rusqlite::Result<rusqlite::types::ToSqlOutput<'_>> {
                Ok(rusqlite::types::ToSqlOutput::from(self.as_str()))
            }
        }

        impl rusqlite::types::FromSql for $name {
            fn column_result(value: rusqlite::types::ValueRef<'_>) -> rusqlite::types::FromSqlResult<Self> {
                let text = value.as_str()?;
                Self::parse(text).ok_or_else(|| rusqlite::types::FromSqlError::Other(format!("unknown {} value: {text}", stringify!($name)).into()))
            }
        }
    };
}
pub(crate) use text_enum;

/// Colours are design token names, never raw values (specification §2.3).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum TokenColor {
    Amber,
    Blue,
    Cyan,
    Purple,
    Success,
    Warning,
    Danger,
    Neutral,
}
text_enum!(TokenColor {
    Amber => "amber",
    Blue => "blue",
    Cyan => "cyan",
    Purple => "purple",
    Success => "success",
    Warning => "warning",
    Danger => "danger",
    Neutral => "neutral",
});

/// Kinds of resources that relations, tags and timeline events can point to.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum EntityKind {
    Document,
    Note,
    Concept,
    Workspace,
    Tag,
    Relation,
}
text_enum!(EntityKind {
    Document => "document",
    Note => "note",
    Concept => "concept",
    Workspace => "workspace",
    Tag => "tag",
    Relation => "relation",
});

fn extended_code(error: &rusqlite::Error) -> Option<i32> {
    match error {
        rusqlite::Error::SqliteFailure(failure, _) => Some(failure.extended_code),
        _ => None,
    }
}

/// Maps the constraint violations of an insert or an update to user-facing errors.
pub(crate) fn map_write_error(error: rusqlite::Error, entity: &'static str) -> AppError {
    match extended_code(&error) {
        Some(ffi::SQLITE_CONSTRAINT_UNIQUE | ffi::SQLITE_CONSTRAINT_PRIMARYKEY) => {
            AppError::NameTaken { entity }
        }
        Some(ffi::SQLITE_CONSTRAINT_FOREIGNKEY) => {
            AppError::InvalidInput(format!("{entity} refers to a record that does not exist"))
        }
        Some(ffi::SQLITE_CONSTRAINT_CHECK | ffi::SQLITE_CONSTRAINT_NOTNULL) => {
            AppError::InvalidInput(format!("{entity} contains an invalid value"))
        }
        _ => AppError::Database(error),
    }
}

/// Maps the constraint violations of a deletion: a record still referenced is reported as in use.
pub(crate) fn map_delete_error(error: rusqlite::Error, entity: &'static str) -> AppError {
    match extended_code(&error) {
        Some(ffi::SQLITE_CONSTRAINT_FOREIGNKEY | ffi::SQLITE_CONSTRAINT_TRIGGER) => {
            AppError::InUse {
                entity,
                reason: "other records still refer to it".to_owned(),
            }
        }
        _ => AppError::Database(error),
    }
}

/// Fails with `NotFound` when an update or a deletion touched no row.
pub(crate) fn expect_one(affected: usize, entity: &'static str) -> AppResult<()> {
    if affected == 0 {
        Err(AppError::NotFound { entity })
    } else {
        Ok(())
    }
}

/// Counts the rows of `table` where `column` equals `value` (table and column names are constants).
pub(crate) fn count_where(
    connection: &Connection,
    table: &str,
    column: &str,
    value: &str,
) -> AppResult<i64> {
    Ok(connection.query_row(
        &format!("SELECT count(*) FROM {table} WHERE {column} = ?1"),
        [value],
        |row| row.get(0),
    )?)
}

/// Parses a stored JSON column, falling back to an empty object for unexpected content.
pub(crate) fn json_value(text: &str) -> serde_json::Value {
    serde_json::from_str(text).unwrap_or_else(|_| serde_json::Value::Object(serde_json::Map::new()))
}

/// Serializes a JSON value for storage; only objects are accepted.
pub(crate) fn json_object_text(value: &serde_json::Value, field: &str) -> AppResult<String> {
    if !value.is_object() {
        return Err(AppError::InvalidInput(format!(
            "{field} must be a JSON object"
        )));
    }
    serde_json::to_string(value).map_err(|error| AppError::Internal(error.to_string()))
}

/// Icon names are Lucide identifiers chosen in the interface (kebab-case).
pub(crate) fn check_icon(icon: &str) -> AppResult<()> {
    let valid = !icon.is_empty()
        && icon.len() <= 64
        && icon.chars().all(|character| {
            character.is_ascii_lowercase() || character.is_ascii_digit() || character == '-'
        });
    if valid {
        Ok(())
    } else {
        Err(AppError::InvalidInput(
            "icon is not a valid icon name".to_owned(),
        ))
    }
}

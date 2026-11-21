//! Database integrity check (specification §5.2), available from Settings › Storage.

use rusqlite::Connection;
use serde::Serialize;
use ts_rs::TS;

use crate::error::AppResult;
use crate::util::now_ms;

const MAX_REPORTED_PROBLEMS: usize = 20;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct IntegrityReport {
    pub ok: bool,
    pub problems: Vec<String>,
    pub checked_at: i64,
}

/// Runs SQLite's structural check and the foreign key check.
pub fn check(connection: &Connection) -> AppResult<IntegrityReport> {
    let mut problems: Vec<String> = Vec::new();
    {
        let mut statement = connection.prepare("PRAGMA integrity_check")?;
        let rows = statement.query_map([], |row| row.get::<_, String>(0))?;
        for row in rows {
            let message = row?;
            if message != "ok" {
                problems.push(message);
            }
        }
    }
    {
        let mut statement =
            connection.prepare("SELECT \"table\", rowid, parent FROM pragma_foreign_key_check")?;
        let rows = statement.query_map([], |row| {
            Ok(format!(
                "foreign key violation in {} (row {}) referencing {}",
                row.get::<_, String>(0)?,
                row.get::<_, Option<i64>>(1)?
                    .map_or_else(|| "?".to_owned(), |rowid| rowid.to_string()),
                row.get::<_, String>(2)?
            ))
        })?;
        for row in rows {
            problems.push(row?);
        }
    }
    problems.truncate(MAX_REPORTED_PROBLEMS);
    Ok(IntegrityReport {
        ok: problems.is_empty(),
        problems,
        checked_at: now_ms(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::testing::open_temporary;

    #[test]
    fn a_new_database_is_healthy() {
        let (_dir, database) = open_temporary();
        let report = database.read(check).expect("check runs");
        assert!(report.ok, "{:?}", report.problems);
    }

    #[test]
    fn foreign_key_violations_are_reported() {
        let (_dir, database) = open_temporary();
        database
            .with_writer(|connection| {
                connection.pragma_update(None, "foreign_keys", "OFF")?;
                connection.execute(
                    "INSERT INTO folders (id, workspace_id, name, name_key, created_at, updated_at)
                     VALUES ('f', 'missing-workspace', 'Dossier', 'dossier', 0, 0)",
                    [],
                )?;
                connection.pragma_update(None, "foreign_keys", "ON")?;
                Ok(())
            })
            .expect("corrupt on purpose");
        let report = database.read(check).expect("check runs");
        assert!(!report.ok);
        assert!(
            report
                .problems
                .iter()
                .any(|problem| problem.contains("folders"))
        );
    }
}

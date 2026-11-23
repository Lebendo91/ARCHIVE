//! Versioned schema migrations (specification §5.2, ARCHITECTURE.md §6.4).
//!
//! * Migrations are SQL files embedded in the binary and applied in order, each in its own transaction.
//! * `schema_migrations` records each applied migration with a checksum: an applied migration that was
//!   modified afterwards is detected instead of silently diverging.
//! * Before migrating an existing database, a consistent copy is written with `VACUUM INTO`.
//! * A database created by a newer version of ARCHIVE is never modified.

use std::path::Path;

use rusqlite::{Connection, TransactionBehavior, params};
use serde::Serialize;
use sha2::{Digest, Sha256};
use ts_rs::TS;

use crate::error::{AppError, AppResult};
use crate::util::now_ms;

#[derive(Debug, Clone, Copy)]
pub struct Migration {
    pub version: i64,
    pub name: &'static str,
    pub sql: &'static str,
}

pub const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 1,
        name: "initial",
        sql: include_str!("../../migrations/0001_initial.sql"),
    },
    Migration {
        version: 2,
        name: "search",
        sql: include_str!("../../migrations/0002_search.sql"),
    },
    Migration {
        version: 3,
        name: "memory",
        sql: include_str!("../../migrations/0003_memory.sql"),
    },
];

/// Schema version expected by this build.
pub fn latest_version() -> i64 {
    MIGRATIONS.last().map_or(0, |migration| migration.version)
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct MigrationReport {
    pub from_version: i64,
    pub to_version: i64,
    pub applied: Vec<i64>,
    /// File name of the copy taken before migrating, if any.
    pub backup_file: Option<String>,
}

/// Checksum of a migration, independent of the line endings of the checkout.
pub fn checksum(sql: &str) -> String {
    hex::encode(Sha256::digest(sql.replace("\r\n", "\n").as_bytes()))
}

pub fn migrate(connection: &mut Connection, backups_dir: &Path) -> AppResult<MigrationReport> {
    migrate_with(connection, backups_dir, MIGRATIONS)
}

pub(crate) fn migrate_with(
    connection: &mut Connection,
    backups_dir: &Path,
    migrations: &[Migration],
) -> AppResult<MigrationReport> {
    connection.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
           version INTEGER PRIMARY KEY NOT NULL,
           name TEXT NOT NULL,
           checksum TEXT NOT NULL,
           applied_at INTEGER NOT NULL
         )",
    )?;

    let applied: Vec<(i64, String)> = {
        let mut statement = connection
            .prepare("SELECT version, checksum FROM schema_migrations ORDER BY version")?;
        statement
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
            .collect::<Result<_, _>>()?
    };
    let latest = migrations.last().map_or(0, |migration| migration.version);
    let current = applied.last().map_or(0, |(version, _)| *version);

    if current > latest {
        return Err(AppError::DatabaseTooNew {
            found: current,
            supported: latest,
        });
    }
    for (version, recorded) in &applied {
        let migration = migrations
            .iter()
            .find(|candidate| candidate.version == *version)
            .ok_or(AppError::MigrationFailed {
                version: *version,
                reason: "unknown migration recorded in the database".to_owned(),
            })?;
        if checksum(migration.sql) != *recorded {
            return Err(AppError::MigrationFailed {
                version: *version,
                reason: "an applied migration was modified afterwards".to_owned(),
            });
        }
    }

    let pending: Vec<&Migration> = migrations
        .iter()
        .filter(|migration| migration.version > current)
        .collect();
    if pending.is_empty() {
        return Ok(MigrationReport {
            from_version: current,
            to_version: current,
            applied: Vec::new(),
            backup_file: None,
        });
    }

    let backup_file = if current > 0 {
        Some(backup_before_migration(
            connection,
            backups_dir,
            current,
            latest,
        )?)
    } else {
        None
    };

    let mut applied_now = Vec::with_capacity(pending.len());
    for migration in pending {
        let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
        transaction
            .execute_batch(migration.sql)
            .map_err(|error| AppError::MigrationFailed {
                version: migration.version,
                reason: error.to_string(),
            })?;
        transaction.execute(
            "INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?1, ?2, ?3, ?4)",
            params![migration.version, migration.name, checksum(migration.sql), now_ms()],
        )?;
        transaction.commit()?;
        applied_now.push(migration.version);
        log::info!(
            "database migration {} ({}) applied",
            migration.version,
            migration.name
        );
    }
    connection.pragma_update(None, "user_version", latest)?;

    Ok(MigrationReport {
        from_version: current,
        to_version: latest,
        applied: applied_now,
        backup_file,
    })
}

/// Writes a consistent copy of the database before migrating it. Migrating without a backup is refused.
fn backup_before_migration(
    connection: &Connection,
    backups_dir: &Path,
    from: i64,
    to: i64,
) -> AppResult<String> {
    std::fs::create_dir_all(backups_dir)?;
    let file_name = format!("pre-migration-v{from}-to-v{to}-{}.db", now_ms());
    let target = backups_dir.join(&file_name);
    connection
        .execute("VACUUM INTO ?1", params![target.to_string_lossy()])
        .map_err(|error| AppError::MigrationFailed {
            version: to,
            reason: format!("backup before migration failed: {error}"),
        })?;
    log::info!("database copied to backups/{file_name} before migrating from v{from} to v{to}");
    Ok(file_name)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temporary() -> (tempfile::TempDir, Connection, std::path::PathBuf) {
        let dir = tempfile::tempdir().expect("temporary directory");
        let connection = Connection::open(dir.path().join("archive.db")).expect("open");
        connection
            .pragma_update(None, "foreign_keys", "ON")
            .expect("foreign keys");
        let backups = dir.path().join("backups");
        (dir, connection, backups)
    }

    fn table_exists(connection: &Connection, name: &str) -> bool {
        connection
            .query_row(
                "SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
                [name],
                |row| row.get::<_, i64>(0),
            )
            .map(|count| count == 1)
            .unwrap_or(false)
    }

    const V1: Migration = Migration {
        version: 1,
        name: "first",
        sql: "CREATE TABLE first (id INTEGER PRIMARY KEY);",
    };
    const V2: Migration = Migration {
        version: 2,
        name: "second",
        sql: "CREATE TABLE second (id INTEGER PRIMARY KEY);",
    };

    #[test]
    fn a_fresh_database_receives_every_migration_without_backup() {
        let (_dir, mut connection, backups) = temporary();
        let report = migrate(&mut connection, &backups).expect("migrates");
        assert_eq!(report.from_version, 0);
        assert_eq!(report.to_version, latest_version());
        assert!(report.backup_file.is_none());
        for table in [
            "workspaces",
            "folders",
            "documents",
            "document_contents",
            "notes",
            "tags",
            "document_tags",
            "note_tags",
            "relations",
            "timeline_events",
            "ai_providers",
            "app_settings",
            "search_index",
            "search_titles",
            "search_entries",
            "search_index_state",
            "search_history",
            "processing_jobs",
            "content_profiles",
            "entity_terms",
            "search_vocabulary",
            "concepts",
            "concept_mentions",
            "memory_state",
        ] {
            assert!(table_exists(&connection, table), "missing table {table}");
        }
        let user_version: i64 = connection
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .expect("pragma");
        assert_eq!(user_version, latest_version());
        let foreign_key_problems: i64 = connection
            .query_row("SELECT count(*) FROM pragma_foreign_key_check", [], |row| {
                row.get(0)
            })
            .expect("foreign key check");
        assert_eq!(foreign_key_problems, 0);
    }

    #[test]
    fn migrating_twice_changes_nothing() {
        let (_dir, mut connection, backups) = temporary();
        migrate(&mut connection, &backups).expect("first run");
        let report = migrate(&mut connection, &backups).expect("second run");
        assert!(report.applied.is_empty());
        assert_eq!(report.from_version, report.to_version);
    }

    #[test]
    fn an_existing_database_is_backed_up_before_new_migrations() {
        let (_dir, mut connection, backups) = temporary();
        migrate_with(&mut connection, &backups, &[V1]).expect("v1");
        connection
            .execute("INSERT INTO first (id) VALUES (42)", [])
            .expect("data");
        let report = migrate_with(&mut connection, &backups, &[V1, V2]).expect("v2");
        assert_eq!(report.applied, vec![2]);
        let file = report.backup_file.expect("backup taken");
        let copy = Connection::open(backups.join(&file)).expect("backup opens");
        let kept: i64 = copy
            .query_row("SELECT id FROM first", [], |row| row.get(0))
            .expect("data in backup");
        assert_eq!(kept, 42);
        assert!(
            !table_exists(&copy, "second"),
            "the backup predates the migration"
        );
        assert!(table_exists(&connection, "second"));
    }

    #[test]
    fn a_failing_migration_is_rolled_back_entirely() {
        let (_dir, mut connection, backups) = temporary();
        migrate_with(&mut connection, &backups, &[V1]).expect("v1");
        let broken = Migration {
            version: 2,
            name: "broken",
            sql: "CREATE TABLE half (id INTEGER); INSERT INTO missing_table VALUES (1);",
        };
        let error = migrate_with(&mut connection, &backups, &[V1, broken]).expect_err("must fail");
        assert!(matches!(
            error,
            AppError::MigrationFailed { version: 2, .. }
        ));
        assert!(
            !table_exists(&connection, "half"),
            "partial migration must not remain"
        );
        let version: i64 = connection
            .query_row("SELECT max(version) FROM schema_migrations", [], |row| {
                row.get(0)
            })
            .expect("version");
        assert_eq!(version, 1);
    }

    #[test]
    fn a_modified_migration_is_detected() {
        let (_dir, mut connection, backups) = temporary();
        migrate_with(&mut connection, &backups, &[V1]).expect("v1");
        let altered = Migration {
            sql: "CREATE TABLE first (id INTEGER PRIMARY KEY, extra TEXT);",
            ..V1
        };
        let error = migrate_with(&mut connection, &backups, &[altered]).expect_err("must fail");
        assert!(matches!(
            error,
            AppError::MigrationFailed { version: 1, .. }
        ));
    }

    #[test]
    fn a_database_from_a_newer_version_is_left_untouched() {
        let (_dir, mut connection, backups) = temporary();
        migrate_with(&mut connection, &backups, &[V1, V2]).expect("newer app");
        let error = migrate_with(&mut connection, &backups, &[V1]).expect_err("older app refuses");
        assert!(matches!(
            error,
            AppError::DatabaseTooNew {
                found: 2,
                supported: 1
            }
        ));
        assert!(table_exists(&connection, "second"));
    }

    #[test]
    fn checksums_ignore_line_endings() {
        assert_eq!(checksum("a;\r\nb;"), checksum("a;\nb;"));
    }
}

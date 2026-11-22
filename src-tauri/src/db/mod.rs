//! SQLite database: one write connection and a few read-only connections in WAL mode, so that reads never
//! wait for a long write (ARCHITECTURE.md §5, §6).

pub mod integrity;
pub mod migrations;

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Mutex, MutexGuard, PoisonError};

use rusqlite::{Connection, OpenFlags, Transaction, TransactionBehavior};

use crate::error::{AppError, AppResult};
pub use migrations::MigrationReport;

const READ_CONNECTIONS: usize = 2;
const BUSY_TIMEOUT_MS: u32 = 5_000;

pub struct Database {
    path: PathBuf,
    writer: Mutex<Connection>,
    readers: Vec<Mutex<Connection>>,
    next_reader: AtomicUsize,
}

fn lock(mutex: &Mutex<Connection>) -> MutexGuard<'_, Connection> {
    // A panic while holding the lock leaves the connection usable: any open transaction was rolled back
    // when it was dropped.
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

fn configure(connection: &Connection, read_only: bool) -> AppResult<()> {
    connection.busy_timeout(std::time::Duration::from_millis(u64::from(BUSY_TIMEOUT_MS)))?;
    connection.pragma_update(None, "foreign_keys", "ON")?;
    // Case- and accent-insensitive matching for Library searches (SQLite folds ASCII letters only).
    connection.create_scalar_function(
        "archive_fold",
        1,
        rusqlite::functions::FunctionFlags::SQLITE_UTF8
            | rusqlite::functions::FunctionFlags::SQLITE_DETERMINISTIC,
        |context| {
            let text: Option<String> = context.get(0)?;
            Ok(text.map(|text| crate::util::fold_for_search(&text)))
        },
    )?;
    if read_only {
        connection.pragma_update(None, "query_only", "ON")?;
    } else {
        let mode: String =
            connection.pragma_update_and_check(None, "journal_mode", "WAL", |row| row.get(0))?;
        if !mode.eq_ignore_ascii_case("wal") {
            return Err(AppError::DatabaseUnavailable(format!(
                "WAL mode refused (journal_mode = {mode})"
            )));
        }
        connection.pragma_update(None, "synchronous", "NORMAL")?;
    }
    Ok(())
}

impl Database {
    /// Opens (or creates) the database at `path` and applies the pending migrations. A copy of an existing
    /// database is written to `backups_dir` before any migration.
    pub fn open(path: &Path, backups_dir: &Path) -> AppResult<(Self, MigrationReport)> {
        let flags = OpenFlags::SQLITE_OPEN_READ_WRITE
            | OpenFlags::SQLITE_OPEN_CREATE
            | OpenFlags::SQLITE_OPEN_NO_MUTEX;
        let mut writer = Connection::open_with_flags(path, flags)?;
        configure(&writer, false)?;
        let report = migrations::migrate(&mut writer, backups_dir)?;

        let readers = (0..READ_CONNECTIONS)
            .map(|_| {
                let reader = Connection::open_with_flags(
                    path,
                    OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
                )?;
                configure(&reader, true)?;
                Ok(Mutex::new(reader))
            })
            .collect::<AppResult<Vec<_>>>()?;

        Ok((
            Self {
                path: path.to_path_buf(),
                writer: Mutex::new(writer),
                readers,
                next_reader: AtomicUsize::new(0),
            },
            report,
        ))
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    /// Runs `operation` on a read-only connection.
    pub fn read<T>(&self, operation: impl FnOnce(&Connection) -> AppResult<T>) -> AppResult<T> {
        let start = self.next_reader.fetch_add(1, Ordering::Relaxed);
        for offset in 0..self.readers.len() {
            let index = (start + offset) % self.readers.len();
            if let Some(reader) = self.readers.get(index)
                && let Ok(connection) = reader.try_lock()
            {
                return operation(&connection);
            }
        }
        let index = start % self.readers.len().max(1);
        match self.readers.get(index) {
            Some(reader) => operation(&lock(reader)),
            None => operation(&lock(&self.writer)),
        }
    }

    /// Runs `operation` inside an immediate write transaction, committed if it succeeds and rolled back
    /// otherwise (specification §5.2: related operations are transactional). The search index follows the
    /// entities the operation changed, in the same transaction.
    pub fn write<T>(
        &self,
        operation: impl FnOnce(&Transaction<'_>) -> AppResult<T>,
    ) -> AppResult<T> {
        let mut connection = lock(&self.writer);
        let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
        crate::search::index::discard_pending();
        crate::memory::queue::discard_queued();
        let result = operation(&transaction).and_then(|value| {
            // The derived data follows in the same transaction: the search index, then the queue of the
            // memory engine for the documents and notes changed.
            let changed = crate::search::index::flush_pending(&transaction)?;
            crate::memory::queue::on_changed(&transaction, &changed)?;
            Ok(value)
        });
        match result {
            Ok(value) => {
                transaction.commit()?;
                if crate::memory::queue::take_queued() {
                    crate::memory::worker::wake();
                }
                Ok(value)
            }
            Err(error) => {
                crate::search::index::discard_pending();
                crate::memory::queue::discard_queued();
                Err(error)
            }
        }
    }

    /// Runs `operation` with the write connection outside any transaction (maintenance operations).
    pub fn with_writer<T>(
        &self,
        operation: impl FnOnce(&Connection) -> AppResult<T>,
    ) -> AppResult<T> {
        operation(&lock(&self.writer))
    }
}

#[cfg(test)]
pub mod testing {
    use super::Database;

    /// Database in a fresh temporary directory, with every migration applied.
    pub fn open_temporary() -> (tempfile::TempDir, Database) {
        let dir = tempfile::tempdir().expect("temporary directory");
        let backups = dir.path().join("backups");
        std::fs::create_dir_all(&backups).expect("backups directory");
        let (database, _) =
            Database::open(&dir.path().join("archive.db"), &backups).expect("database opens");
        (dir, database)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn opens_in_wal_mode_with_foreign_keys() {
        let (_dir, database) = testing::open_temporary();
        let (mode, foreign_keys): (String, i64) = database
            .with_writer(|connection| {
                Ok((
                    connection.pragma_query_value(None, "journal_mode", |row| row.get(0))?,
                    connection.pragma_query_value(None, "foreign_keys", |row| row.get(0))?,
                ))
            })
            .expect("pragmas readable");
        assert_eq!(mode, "wal");
        assert_eq!(foreign_keys, 1);
    }

    #[test]
    fn read_connections_cannot_write() {
        let (_dir, database) = testing::open_temporary();
        let result = database.read(|connection| {
            connection.execute("INSERT INTO app_settings VALUES ('k', '1', 0)", [])?;
            Ok(())
        });
        assert!(result.is_err());
    }

    #[test]
    fn failed_write_operations_are_rolled_back() {
        let (_dir, database) = testing::open_temporary();
        let result: AppResult<()> = database.write(|transaction| {
            transaction.execute(
                "INSERT INTO app_settings VALUES ('language', '\"fr\"', 0)",
                [],
            )?;
            Err(AppError::Internal("simulated failure".to_owned()))
        });
        assert!(result.is_err());
        let count: i64 = database
            .read(|connection| {
                Ok(connection
                    .query_row("SELECT count(*) FROM app_settings", [], |row| row.get(0))?)
            })
            .expect("count");
        assert_eq!(count, 0);
    }

    #[test]
    fn data_persists_after_the_database_is_reopened() {
        let dir = tempfile::tempdir().expect("temporary directory");
        let path = dir.path().join("archive.db");
        let backups = dir.path().join("backups");
        std::fs::create_dir_all(&backups).expect("backups directory");
        {
            let (database, report) = Database::open(&path, &backups).expect("first open");
            assert_eq!(report.from_version, 0);
            database
                .write(|transaction| {
                    transaction.execute(
                        "INSERT INTO app_settings VALUES ('language', '\"en\"', 1)",
                        [],
                    )?;
                    Ok(())
                })
                .expect("write");
        }
        let (database, report) = Database::open(&path, &backups).expect("second open");
        assert!(
            report.applied.is_empty(),
            "no migration on an up-to-date database"
        );
        assert!(
            report.backup_file.is_none(),
            "no backup when nothing is migrated"
        );
        let value: String = database
            .read(|connection| {
                Ok(connection.query_row(
                    "SELECT setting_value FROM app_settings WHERE setting_key = 'language'",
                    [],
                    |row| row.get(0),
                )?)
            })
            .expect("read back");
        assert_eq!(value, "\"en\"");
    }
}

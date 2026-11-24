//! Backups and restoration (specification §16, ARCHITECTURE.md §7.1).
//!
//! A backup is an open ZIP file: `manifest.json`, a consistent snapshot of the database (`VACUUM INTO`) and the
//! managed copies of the documents under `files/`, each with its SHA-256 in the manifest. No secret is in it:
//! the API keys are in the operating system's credential store. A restoration is prepared while ARCHIVE runs
//! (checked and extracted into `restore/`) and applied at the next start, before the database opens; the data
//! it replaces is kept in `backups/before-restore-…/`, never deleted.

use std::fs::{self, File};
use std::io::{self, BufReader, BufWriter, Read, Write};
use std::path::{Path, PathBuf};

use rusqlite::{Connection, OptionalExtension, Transaction, params};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use ts_rs::TS;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

use crate::db::{Database, migrations};
use crate::error::{AppError, AppResult};
use crate::paths::AppPaths;
use crate::storage::FileStore;
use crate::util::{new_id, now_ms, validate_id};

pub const FORMAT: &str = "archive-backup";
pub const FORMAT_VERSION: u32 = 1;
const MANIFEST: &str = "manifest.json";
const DATABASE: &str = "archive.db";
const MARKER: &str = "restore.json";
const STAGING: &str = "staging";
/// A manifest larger than this is not one of ours.
const MANIFEST_MAX_BYTES: u64 = 64 * 1024 * 1024;

/// What a backup holds, as counts.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export)]
pub struct BackupContents {
    #[ts(type = "number")]
    pub documents: i64,
    #[ts(type = "number")]
    pub notes: i64,
    #[ts(type = "number")]
    pub workspaces: i64,
    #[ts(type = "number")]
    pub tags: i64,
    #[ts(type = "number")]
    pub relations: i64,
    #[ts(type = "number")]
    pub conversations: i64,
    /// Managed files (copies of the documents, the trash included).
    #[ts(type = "number")]
    pub files: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ManifestEntry {
    pub path: String,
    pub size: u64,
    pub sha256: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    pub format: String,
    pub format_version: u32,
    pub app_version: String,
    pub schema_version: i64,
    pub created_at: i64,
    pub contents: BackupContents,
    /// Always false: keys are never in a backup.
    pub secrets_included: bool,
    pub database: ManifestEntry,
    pub files: Vec<ManifestEntry>,
}

/// What the interface shows of a backup.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct BackupSummary {
    pub app_version: String,
    #[ts(type = "number")]
    pub schema_version: i64,
    #[ts(type = "number")]
    pub created_at: i64,
    pub contents: BackupContents,
    #[ts(type = "number")]
    pub size_bytes: u64,
}

/// Why a file cannot be restored.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(tag = "kind", rename_all = "snake_case")]
#[ts(export)]
pub enum BackupProblem {
    /// Not a ZIP file, or no manifest of ARCHIVE in it.
    NotABackup,
    /// Made by a newer version of ARCHIVE.
    TooNew {
        #[ts(type = "number")]
        schema_version: i64,
    },
    /// An entry that has no place in a backup (a path outside, an unknown name).
    UnexpectedEntry {
        name: String,
    },
    MissingEntry {
        name: String,
    },
    /// An entry whose content no longer matches its fingerprint.
    Altered {
        name: String,
    },
    /// The database of the backup fails its integrity check.
    DatabaseDamaged,
}

/// Outcome of a verification.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct BackupCheck {
    pub summary: Option<BackupSummary>,
    pub problems: Vec<BackupProblem>,
}

impl BackupCheck {
    pub fn valid(&self) -> bool {
        self.summary.is_some() && self.problems.is_empty()
    }
}

/// A backup of the history.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct BackupRecord {
    pub id: String,
    pub path: String,
    #[ts(type = "number")]
    pub created_at: i64,
    #[ts(type = "number")]
    pub size_bytes: i64,
    #[ts(type = "number")]
    pub schema_version: i64,
    pub app_version: String,
    pub contents: BackupContents,
    #[ts(type = "number | null")]
    pub verified_at: Option<i64>,
    /// `true` valid, `false` invalid, `null` never verified.
    pub valid: Option<bool>,
    /// The file is still where it was saved.
    pub available: bool,
}

/// Progress of a backup being written.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct BackupProgress {
    pub done: u32,
    pub total: u32,
}

fn count(connection: &Connection, sql: &str) -> AppResult<i64> {
    Ok(connection.query_row(sql, [], |row| row.get(0))?)
}

pub fn contents(connection: &Connection) -> AppResult<BackupContents> {
    Ok(BackupContents {
        documents: count(
            connection,
            "SELECT count(*) FROM documents WHERE deleted_at IS NULL",
        )?,
        notes: count(
            connection,
            "SELECT count(*) FROM notes WHERE deleted_at IS NULL",
        )?,
        workspaces: count(connection, "SELECT count(*) FROM workspaces")?,
        tags: count(connection, "SELECT count(*) FROM tags")?,
        relations: count(connection, "SELECT count(*) FROM relations")?,
        conversations: count(connection, "SELECT count(*) FROM conversations")?,
        files: count(connection, "SELECT count(*) FROM documents")?,
    })
}

/// Hex SHA-256 of what a reader gives, copied to `sink` on the way.
fn copy_hashed(reader: &mut impl Read, sink: &mut impl Write) -> io::Result<(u64, String)> {
    let mut hasher = Sha256::new();
    let mut buffer = vec![0; 1024 * 1024];
    let mut size = 0;
    loop {
        let read = reader.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
        sink.write_all(&buffer[..read])?;
        size += read as u64;
    }
    Ok((size, hex::encode(hasher.finalize())))
}

/// Writes a backup of the database and the managed files to `destination` (a ZIP file). The file appears only
/// once complete: an interrupted backup leaves no truncated file under its name.
pub fn create(
    database: &Database,
    paths: &AppPaths,
    destination: &Path,
    mut progress: impl FnMut(BackupProgress),
) -> AppResult<BackupSummary> {
    let store = FileStore::new(paths);
    fs::create_dir_all(&paths.tmp_dir)?;
    let snapshot = paths.tmp_dir.join(format!("backup-{}.db", new_id()));
    database.snapshot(&snapshot)?;
    // Everything else is read in the snapshot: the files listed are those of the database saved.
    let connection =
        Connection::open_with_flags(&snapshot, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    let stored: Vec<String> = match connection
        .prepare("SELECT stored_filename FROM documents ORDER BY id")
        .and_then(|mut statement| {
            statement
                .query_map([], |row| row.get(0))?
                .collect::<Result<Vec<String>, _>>()
        }) {
        Ok(stored) => stored,
        Err(error) => {
            drop(connection);
            let _ = fs::remove_file(&snapshot);
            return Err(error.into());
        }
    };
    let result = (|| -> AppResult<BackupSummary> {
        let mut files = Vec::with_capacity(stored.len());
        for name in &stored {
            let path = store.path_for(name)?;
            if !path.is_file() {
                return Err(AppError::InvalidInput(format!(
                    "a managed file is missing ({name}): run the integrity check of the storage settings"
                )));
            }
            let relative = path
                .strip_prefix(&paths.data_dir)
                .map_err(|_| AppError::Storage("managed file outside the data folder".to_owned()))?
                .components()
                .map(|component| component.as_os_str().to_string_lossy().into_owned())
                .collect::<Vec<_>>()
                .join("/");
            files.push((relative, path));
        }
        let partial = destination.with_extension("zip.partial");
        let file = File::create(&partial)?;
        let mut zip = ZipWriter::new(BufWriter::new(file));
        let deflated = SimpleFileOptions::default()
            .compression_method(CompressionMethod::Deflated)
            .large_file(true);
        let stored_options = SimpleFileOptions::default()
            .compression_method(CompressionMethod::Stored)
            .large_file(true);
        let total = u32::try_from(files.len() + 1).unwrap_or(u32::MAX);
        zip.start_file(DATABASE, deflated)
            .map_err(|error| AppError::Storage(error.to_string()))?;
        let (size, sha256) = copy_hashed(&mut BufReader::new(File::open(&snapshot)?), &mut zip)?;
        let database = ManifestEntry {
            path: DATABASE.to_owned(),
            size,
            sha256,
        };
        progress(BackupProgress { done: 1, total });
        let mut entries = Vec::with_capacity(files.len());
        for (index, (relative, path)) in files.iter().enumerate() {
            // Documents are mostly compressed already (PDF, images, DOCX): stored as they are, quickly.
            zip.start_file(relative.as_str(), stored_options)
                .map_err(|error| AppError::Storage(error.to_string()))?;
            let (size, sha256) = copy_hashed(&mut BufReader::new(File::open(path)?), &mut zip)?;
            entries.push(ManifestEntry {
                path: relative.clone(),
                size,
                sha256,
            });
            progress(BackupProgress {
                done: u32::try_from(index + 2).unwrap_or(u32::MAX),
                total,
            });
        }
        let manifest = Manifest {
            format: FORMAT.to_owned(),
            format_version: FORMAT_VERSION,
            app_version: env!("CARGO_PKG_VERSION").to_owned(),
            schema_version: migrations::latest_version(),
            created_at: now_ms(),
            contents: contents(&connection)?,
            secrets_included: false,
            database,
            files: entries,
        };
        zip.start_file(MANIFEST, deflated)
            .map_err(|error| AppError::Storage(error.to_string()))?;
        let text = serde_json::to_vec_pretty(&manifest)
            .map_err(|error| AppError::Internal(error.to_string()))?;
        zip.write_all(&text)?;
        let writer = zip
            .finish()
            .map_err(|error| AppError::Storage(error.to_string()))?;
        writer
            .into_inner()
            .map_err(|error| AppError::Io(error.into_error()))?
            .sync_all()?;
        fs::rename(&partial, destination)?;
        Ok(BackupSummary {
            app_version: manifest.app_version,
            schema_version: manifest.schema_version,
            created_at: manifest.created_at,
            contents: manifest.contents,
            size_bytes: fs::metadata(destination)?.len(),
        })
    })();
    drop(connection);
    let _ = fs::remove_file(&snapshot);
    if result.is_err() {
        let _ = fs::remove_file(destination.with_extension("zip.partial"));
    }
    result
}

/// A managed file's place in a backup: `files/<2 hex>/<uuid>.<ext>`, nothing else.
fn managed_entry(name: &str) -> bool {
    let parts: Vec<&str> = name.split('/').collect();
    let [root, shard, file] = parts.as_slice() else {
        return false;
    };
    let Some((id, extension)) = file.split_once('.') else {
        return false;
    };
    *root == "files"
        && validate_id(id, "id").is_ok()
        && id.ends_with(shard)
        && shard.len() == 2
        && !extension.is_empty()
        && extension
            .chars()
            .all(|character| character.is_ascii_alphanumeric())
}

/// Checks a backup; with `extract_to`, writes its database and files there on the way (to restore them).
/// `scratch` is a folder for the copy of the database the integrity check reads.
pub fn verify(path: &Path, scratch: &Path, extract_to: Option<&Path>) -> AppResult<BackupCheck> {
    let size_bytes = fs::metadata(path)?.len();
    let not_a_backup = || BackupCheck {
        summary: None,
        problems: vec![BackupProblem::NotABackup],
    };
    let Ok(mut archive) = ZipArchive::new(BufReader::new(File::open(path)?)) else {
        return Ok(not_a_backup());
    };
    let manifest: Option<Manifest> = archive.by_name(MANIFEST).ok().and_then(|entry| {
        if entry.size() > MANIFEST_MAX_BYTES {
            return None;
        }
        serde_json::from_reader(entry.take(MANIFEST_MAX_BYTES)).ok()
    });
    let Some(manifest) = manifest.filter(|manifest| manifest.format == FORMAT) else {
        return Ok(not_a_backup());
    };
    let mut problems = Vec::new();
    if manifest.schema_version > migrations::latest_version() {
        problems.push(BackupProblem::TooNew {
            schema_version: manifest.schema_version,
        });
    }
    let expected: Vec<&ManifestEntry> = std::iter::once(&manifest.database)
        .chain(manifest.files.iter())
        .collect();
    let names: Vec<Option<String>> = archive
        .file_names()
        .map(|name| name.ok().map(std::borrow::Cow::into_owned))
        .collect();
    for name in names {
        let Some(name) = name else {
            problems.push(BackupProblem::UnexpectedEntry {
                name: "?".to_owned(),
            });
            continue;
        };
        let listed = name == MANIFEST || expected.iter().any(|entry| entry.path == name);
        if !listed || (name != MANIFEST && name != DATABASE && !managed_entry(&name)) {
            problems.push(BackupProblem::UnexpectedEntry {
                name: name.chars().take(200).collect(),
            });
        }
    }
    fs::create_dir_all(scratch)?;
    let temporary = scratch.join(format!("verify-{}.db", new_id()));
    for entry in expected {
        if entry.path != DATABASE && !managed_entry(&entry.path) {
            problems.push(BackupProblem::UnexpectedEntry {
                name: entry.path.chars().take(200).collect(),
            });
            continue;
        }
        let Ok(mut file) = archive.by_name(&entry.path) else {
            problems.push(BackupProblem::MissingEntry {
                name: entry.path.clone(),
            });
            continue;
        };
        let target: Option<PathBuf> = match (extract_to, entry.path == DATABASE) {
            (Some(root), _) => Some(root.join(&entry.path)),
            (None, true) => Some(temporary.clone()),
            (None, false) => None,
        };
        let (size, sha256) = match &target {
            Some(target) => {
                if let Some(parent) = target.parent() {
                    fs::create_dir_all(parent)?;
                }
                let mut out = BufWriter::new(File::create(target)?);
                let hashed = copy_hashed(&mut file, &mut out)?;
                out.flush()?;
                hashed
            }
            None => copy_hashed(&mut file, &mut io::sink())?,
        };
        if size != entry.size || sha256 != entry.sha256 {
            problems.push(BackupProblem::Altered {
                name: entry.path.clone(),
            });
        }
    }
    let database = extract_to.map_or_else(|| temporary.clone(), |root| root.join(DATABASE));
    if !problems.iter().any(|problem| {
        matches!(problem, BackupProblem::MissingEntry { name } | BackupProblem::Altered { name } if name == DATABASE)
    }) {
        let intact = Connection::open_with_flags(
            &database,
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
        )
        .and_then(|connection| {
            connection.query_row("PRAGMA integrity_check", [], |row| row.get::<_, String>(0))
        })
        .is_ok_and(|result| result == "ok");
        if !intact {
            problems.push(BackupProblem::DatabaseDamaged);
        }
    }
    let _ = fs::remove_file(&temporary);
    Ok(BackupCheck {
        summary: Some(BackupSummary {
            app_version: manifest.app_version,
            schema_version: manifest.schema_version,
            created_at: manifest.created_at,
            contents: manifest.contents,
            size_bytes,
        }),
        problems,
    })
}

/// A backup of the history, carried over a restoration: the restored database only knows the backups made before
/// it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HistoryEntry {
    path: String,
    created_at: i64,
    size_bytes: i64,
    schema_version: i64,
    app_version: String,
    contents: BackupContents,
    verified_at: Option<i64>,
    valid: Option<bool>,
}

impl From<&BackupRecord> for HistoryEntry {
    fn from(record: &BackupRecord) -> Self {
        Self {
            path: record.path.clone(),
            created_at: record.created_at,
            size_bytes: record.size_bytes,
            schema_version: record.schema_version,
            app_version: record.app_version.clone(),
            contents: record.contents,
            verified_at: record.verified_at,
            valid: record.valid,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RestoreMarker {
    source: String,
    created_at: i64,
    prepared_at: i64,
    #[serde(default)]
    history: Vec<HistoryEntry>,
}

/// Checks a backup and extracts it, ready to be applied at the next start. `history` is the current history of
/// the backups, carried into the restored database.
pub fn stage_restore(
    paths: &AppPaths,
    backup: &Path,
    history: &[BackupRecord],
) -> AppResult<BackupCheck> {
    if paths.restore_dir.exists() {
        fs::remove_dir_all(&paths.restore_dir)?;
    }
    let staging = paths.restore_dir.join(STAGING);
    fs::create_dir_all(&staging)?;
    let check = verify(backup, &paths.tmp_dir, Some(&staging))?;
    match &check.summary {
        Some(summary) if check.valid() => {
            let source = backup.to_string_lossy().into_owned();
            let prepared_at = now_ms();
            // The backup restored was just verified: so it appears in the history.
            let mut history: Vec<HistoryEntry> = history
                .iter()
                .filter(|record| record.path != source)
                .map(HistoryEntry::from)
                .collect();
            history.push(HistoryEntry {
                path: source.clone(),
                created_at: summary.created_at,
                size_bytes: i64::try_from(summary.size_bytes).unwrap_or(i64::MAX),
                schema_version: summary.schema_version,
                app_version: summary.app_version.clone(),
                contents: summary.contents,
                verified_at: Some(prepared_at),
                valid: Some(true),
            });
            let marker = RestoreMarker {
                source,
                created_at: summary.created_at,
                prepared_at,
                history,
            };
            let text = serde_json::to_vec(&marker)
                .map_err(|error| AppError::Internal(error.to_string()))?;
            fs::write(paths.restore_dir.join(MARKER), text)?;
        }
        _ => {
            fs::remove_dir_all(&paths.restore_dir)?;
        }
    }
    Ok(check)
}

/// What happened to a restoration prepared before the start.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RestoreOutcome {
    pub applied: bool,
    /// Date of the backup restored.
    #[ts(type = "number")]
    pub backup_created_at: i64,
    /// Folder holding the data that was in place: the data a restoration replaced, or, when a failed
    /// restoration could not put everything back, what is still there (never deleted). `None` when a failed
    /// restoration left the data as it was.
    pub kept_in: Option<String>,
}

/// A restoration tried at this start: what to tell the user, and the history of the backups to carry into the
/// restored database once it is open.
#[derive(Debug, Clone)]
pub struct StartRestore {
    pub outcome: RestoreOutcome,
    history: Vec<HistoryEntry>,
}

impl StartRestore {
    /// Puts back into the restored database the backups it does not know, or knows with older details. Nothing
    /// when the restoration was not applied: the database is the one that had this history. Returns the number
    /// of backups written.
    pub fn carry_history(&self, transaction: &Transaction<'_>) -> AppResult<usize> {
        if !self.outcome.applied {
            return Ok(0);
        }
        let mut written = 0;
        for entry in &self.history {
            if entry.path.is_empty() || entry.path.len() > 4096 || entry.size_bytes < 0 {
                continue;
            }
            let contents = serde_json::to_string(&entry.contents)
                .map_err(|error| AppError::Internal(error.to_string()))?;
            let verification = entry
                .valid
                .map(|valid| if valid { "valid" } else { "invalid" });
            written += transaction.execute(
                "INSERT INTO backups (id, path, created_at, size_bytes, schema_version, app_version,
                                      contents_json, verified_at, verification)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
                 ON CONFLICT (path) DO UPDATE SET created_at = excluded.created_at,
                   size_bytes = excluded.size_bytes, schema_version = excluded.schema_version,
                   app_version = excluded.app_version, contents_json = excluded.contents_json,
                   verified_at = excluded.verified_at, verification = excluded.verification",
                params![
                    new_id(),
                    entry.path,
                    entry.created_at,
                    entry.size_bytes,
                    entry.schema_version,
                    entry.app_version,
                    contents,
                    entry.verified_at,
                    verification
                ],
            )?;
        }
        Ok(written)
    }
}

/// Applies a prepared restoration. Runs at start, before the database is opened: nothing holds its files.
pub fn apply_pending_restore(paths: &AppPaths) -> Option<StartRestore> {
    let marker_path = paths.restore_dir.join(MARKER);
    let marker: RestoreMarker = serde_json::from_slice(&fs::read(&marker_path).ok()?).ok()?;
    // Whatever happens, the restoration is tried once only.
    let _ = fs::remove_file(&marker_path);
    let staging = paths.restore_dir.join(STAGING);
    let kept_name = format!("before-restore-{}", now_ms());
    let kept = paths.backups_dir.join(&kept_name);
    // What was moved aside (from, to), and whether the restored database took the place of the current one.
    let mut moved: Vec<(PathBuf, PathBuf)> = Vec::new();
    let mut database_placed = false;
    let result = (|| -> io::Result<()> {
        if !staging.join(DATABASE).is_file() {
            return Err(io::Error::new(
                io::ErrorKind::NotFound,
                "staged database missing",
            ));
        }
        fs::create_dir_all(&kept)?;
        let mut current: Vec<PathBuf> = ["", "-wal", "-shm"]
            .iter()
            .map(|suffix| paths.data_dir.join(format!("{DATABASE}{suffix}")))
            .collect();
        current.push(paths.files_dir.clone());
        for path in current.into_iter().filter(|path| path.exists()) {
            let target = kept.join(path.file_name().unwrap_or_default());
            fs::rename(&path, &target)?;
            moved.push((path, target));
        }
        fs::rename(staging.join(DATABASE), &paths.database_file)?;
        database_placed = true;
        let staged_files = staging.join("files");
        if staged_files.exists() {
            fs::rename(&staged_files, &paths.files_dir)
        } else {
            fs::create_dir_all(&paths.files_dir)
        }
    })();
    // The extracted copy is not needed any more: a new attempt extracts the backup again.
    let _ = fs::remove_dir_all(&paths.restore_dir);
    if let Err(error) = result {
        log::error!("the restoration could not be applied: {error}");
        // Back as it was: the restored database out (it is a copy of the backup), the data in place again.
        if database_placed {
            let _ = fs::remove_file(&paths.database_file);
        }
        let mut stranded = false;
        for (original, aside) in moved.into_iter().rev() {
            if let Err(error) = fs::rename(&aside, &original) {
                stranded = true;
                log::error!(
                    "{} could not be put back, it stays in backups/{kept_name}: {error}",
                    original.file_name().unwrap_or_default().to_string_lossy()
                );
            }
        }
        if !stranded {
            // Empty again: removed. Anything left in it is kept.
            let _ = fs::remove_dir(&kept);
        }
        return Some(StartRestore {
            outcome: RestoreOutcome {
                applied: false,
                backup_created_at: marker.created_at,
                kept_in: stranded.then(|| kept.display().to_string()),
            },
            history: Vec::new(),
        });
    }
    log::info!(
        "backup of {} restored; the replaced data is in backups/{kept_name}",
        marker.created_at
    );
    Some(StartRestore {
        outcome: RestoreOutcome {
            applied: true,
            backup_created_at: marker.created_at,
            kept_in: Some(kept.display().to_string()),
        },
        history: marker.history,
    })
}

fn record(row: &rusqlite::Row<'_>) -> rusqlite::Result<BackupRecord> {
    let path: String = row.get(1)?;
    let contents: String = row.get(6)?;
    let verification: Option<String> = row.get(8)?;
    Ok(BackupRecord {
        id: row.get(0)?,
        available: Path::new(&path).is_file(),
        path,
        created_at: row.get(2)?,
        size_bytes: row.get(3)?,
        schema_version: row.get(4)?,
        app_version: row.get(5)?,
        contents: serde_json::from_str(&contents).unwrap_or_default(),
        verified_at: row.get(7)?,
        valid: verification.map(|value| value == "valid"),
    })
}

const COLUMNS: &str = "id, path, created_at, size_bytes, schema_version, app_version, contents_json, verified_at, verification";

/// Remembers a backup (or updates it, by its path).
pub fn remember(
    transaction: &Transaction<'_>,
    path: &Path,
    summary: &BackupSummary,
    valid: Option<bool>,
) -> AppResult<BackupRecord> {
    let text = path.to_string_lossy().into_owned();
    let contents = serde_json::to_string(&summary.contents)
        .map_err(|error| AppError::Internal(error.to_string()))?;
    let verified_at = valid.map(|_| now_ms());
    let verification = valid.map(|valid| if valid { "valid" } else { "invalid" });
    transaction.execute(
        "INSERT INTO backups (id, path, created_at, size_bytes, schema_version, app_version, contents_json,
                              verified_at, verification)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
         ON CONFLICT (path) DO UPDATE SET created_at = excluded.created_at, size_bytes = excluded.size_bytes,
           schema_version = excluded.schema_version, app_version = excluded.app_version,
           contents_json = excluded.contents_json,
           verified_at = coalesce(excluded.verified_at, backups.verified_at),
           verification = coalesce(excluded.verification, backups.verification)",
        params![
            new_id(),
            text,
            summary.created_at,
            i64::try_from(summary.size_bytes).unwrap_or(i64::MAX),
            summary.schema_version,
            summary.app_version,
            contents,
            verified_at,
            verification
        ],
    )?;
    Ok(transaction.query_row(
        &format!("SELECT {COLUMNS} FROM backups WHERE path = ?1"),
        [&text],
        record,
    )?)
}

pub fn get(connection: &Connection, id: &str) -> AppResult<BackupRecord> {
    validate_id(id, "backup")?;
    connection
        .query_row(
            &format!("SELECT {COLUMNS} FROM backups WHERE id = ?1"),
            [id],
            record,
        )
        .optional()?
        .ok_or(AppError::NotFound { entity: "backup" })
}

pub fn list(connection: &Connection) -> AppResult<Vec<BackupRecord>> {
    let mut statement = connection.prepare(&format!(
        "SELECT {COLUMNS} FROM backups ORDER BY created_at DESC, id"
    ))?;
    let rows = statement.query_map([], record)?.collect::<Result<_, _>>()?;
    Ok(rows)
}

pub fn mark_verified(transaction: &Transaction<'_>, id: &str, valid: bool) -> AppResult<()> {
    transaction.execute(
        "UPDATE backups SET verified_at = ?2, verification = ?3 WHERE id = ?1",
        params![id, now_ms(), if valid { "valid" } else { "invalid" }],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests;

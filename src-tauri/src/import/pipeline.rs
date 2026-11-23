//! Import of files into the Library (specification §7.2), one file at a time, each with its own outcome:
//! one bad file never stops the others. Original files are opened read-only and never modified.
//!
//! For each file: validate → identify the type → copy into managed storage (SHA-256 computed while
//! copying) → refuse duplicates → extract text and metadata from the managed copy → save in SQLite with a
//! timeline event, in one transaction. Any failure after the copy removes the copy.

use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::UNIX_EPOCH;

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use ts_rs::TS;

use super::detect::{FileKind, HEADER_LEN};
use super::extract::{ExtractionIssue, extract};
use crate::db::Database;
use crate::error::{AppError, AppResult};
use crate::repo::EntityKind;
use crate::repo::documents::{self, Document, NewDocument, TITLE_MAX};
use crate::repo::timeline::{self, NewTimelineEvent, TimelineEventType};
use crate::repo::{folders, workspaces};
use crate::storage::FileStore;
use crate::util::{new_id, validate_id};

/// Largest file accepted, in bytes.
pub const MAX_IMPORT_BYTES: u64 = 512 * 1024 * 1024;

/// Where imported documents go. Without a workspace, they are kept « without workspace ».
#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct ImportTarget {
    #[serde(default)]
    #[ts(optional)]
    pub workspace_id: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub folder_id: Option<String>,
}

/// A file announced at the start of an import. Its name is for display only.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ImportFile {
    pub index: u32,
    pub name: String,
    /// Unknown when the file cannot be read.
    pub size: Option<i64>,
}

/// Why a file was not imported.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum ImportFailure {
    /// The extension is not one of the supported formats.
    Unsupported,
    /// A folder or a special file.
    NotAFile,
    TooLarge,
    /// The file could not be read (permissions, file locked, removed meanwhile).
    Unreadable,
    /// The content does not match the extension (for example an executable renamed `.pdf`).
    ContentMismatch,
    /// The managed copy could not be written (disk full, permissions).
    Storage,
    Database,
}

impl ImportFailure {
    /// Failures that may disappear on a new attempt (file locked, disk full…), unlike a wrong format.
    pub fn is_retryable(self) -> bool {
        matches!(self, Self::Unreadable | Self::Storage | Self::Database)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct DocumentRef {
    pub id: String,
    pub title: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(tag = "status", rename_all = "snake_case")]
#[ts(export)]
pub enum ImportOutcome {
    Imported {
        document: Box<Document>,
        /// Set when the text could not be extracted, or only partially.
        issue: Option<ExtractionIssue>,
    },
    /// Same content as a document already in the Library: nothing was copied.
    Duplicate {
        existing: DocumentRef,
    },
    Failed {
        reason: ImportFailure,
    },
    /// Not processed: the import was cancelled before this file.
    Cancelled,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ImportSummary {
    pub imported: u32,
    pub duplicates: u32,
    pub failed: u32,
    pub cancelled: u32,
}

/// Progress events sent to the interface while an import runs.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(tag = "event", rename_all = "snake_case")]
#[ts(export)]
pub enum ImportProgress {
    Started {
        files: Vec<ImportFile>,
    },
    /// One file was processed.
    File {
        index: u32,
        outcome: ImportOutcome,
    },
    Finished {
        summary: ImportSummary,
    },
}

pub struct ImportContext<'a> {
    pub database: &'a Database,
    pub store: &'a FileStore,
    pub cancel: &'a AtomicBool,
}

/// Name shown to the user: the last component of the path, without control characters.
fn display_name(path: &Path) -> String {
    let name = path
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default();
    sanitize(&name, TITLE_MAX)
}

fn sanitize(value: &str, max_chars: usize) -> String {
    value
        .chars()
        .map(|character| {
            if character.is_control() {
                ' '
            } else {
                character
            }
        })
        .take(max_chars)
        .collect::<String>()
        .trim()
        .to_owned()
}

/// Initial title: the file name without its extension.
fn title_for(path: &Path) -> String {
    let stem = path
        .file_stem()
        .map(|stem| sanitize(&stem.to_string_lossy(), TITLE_MAX))
        .unwrap_or_default();
    if stem.is_empty() {
        display_name(path)
    } else {
        stem
    }
}

fn read_header(path: &Path) -> std::io::Result<Vec<u8>> {
    let mut header = Vec::with_capacity(HEADER_LEN);
    File::open(path)?
        .take(HEADER_LEN as u64)
        .read_to_end(&mut header)?;
    Ok(header)
}

fn validate_target(database: &Database, target: &ImportTarget) -> AppResult<()> {
    database.read(|connection| {
        match (&target.workspace_id, &target.folder_id) {
            (None, None) => {}
            (Some(workspace_id), folder_id) => {
                workspaces::get(connection, workspace_id)?;
                if let Some(folder_id) = folder_id {
                    let folder = folders::get(connection, folder_id)?;
                    if &folder.workspace_id != workspace_id {
                        return Err(AppError::InvalidInput(
                            "the folder belongs to another workspace".to_owned(),
                        ));
                    }
                }
            }
            (None, Some(_)) => {
                return Err(AppError::InvalidInput(
                    "a folder requires its workspace".to_owned(),
                ));
            }
        }
        Ok(())
    })
}

/// Imports `paths` into `target`, reporting each step through `emit`.
pub fn import_paths(
    context: &ImportContext<'_>,
    paths: &[PathBuf],
    target: &ImportTarget,
    mut emit: impl FnMut(ImportProgress),
) -> AppResult<ImportSummary> {
    validate_target(context.database, target)?;
    let files = paths
        .iter()
        .zip(0_u32..)
        .map(|(path, index)| ImportFile {
            index,
            name: display_name(path),
            size: fs::metadata(path)
                .ok()
                .filter(fs::Metadata::is_file)
                .and_then(|metadata| i64::try_from(metadata.len()).ok()),
        })
        .collect();
    emit(ImportProgress::Started { files });

    let mut summary = ImportSummary::default();
    for (path, index) in paths.iter().zip(0_u32..) {
        let outcome = if context.cancel.load(Ordering::SeqCst) {
            ImportOutcome::Cancelled
        } else {
            import_one(context, path, target)
        };
        match &outcome {
            ImportOutcome::Imported { .. } => summary.imported += 1,
            ImportOutcome::Duplicate { .. } => summary.duplicates += 1,
            ImportOutcome::Failed { .. } => summary.failed += 1,
            ImportOutcome::Cancelled => summary.cancelled += 1,
        }
        emit(ImportProgress::File { index, outcome });
    }
    emit(ImportProgress::Finished { summary });
    Ok(summary)
}

fn failed(reason: ImportFailure) -> ImportOutcome {
    ImportOutcome::Failed { reason }
}

fn import_one(context: &ImportContext<'_>, path: &Path, target: &ImportTarget) -> ImportOutcome {
    let Ok(source) = fs::metadata(path) else {
        return failed(ImportFailure::Unreadable);
    };
    if !source.is_file() {
        return failed(ImportFailure::NotAFile);
    }
    let Some(kind) = path
        .extension()
        .and_then(|extension| extension.to_str())
        .and_then(FileKind::from_extension)
    else {
        return failed(ImportFailure::Unsupported);
    };
    if source.len() > MAX_IMPORT_BYTES {
        return failed(ImportFailure::TooLarge);
    }
    let Ok(header) = read_header(path) else {
        return failed(ImportFailure::Unreadable);
    };
    if !kind.matches_signature(&header) {
        return failed(ImportFailure::ContentMismatch);
    }

    let id = new_id();
    let stored = match context.store.import_copy(path, &id, kind.extension()) {
        Ok(stored) => stored,
        Err(error) => {
            log::warn!("import: copy failed: {error}");
            return failed(match error {
                AppError::Io(_) if fs::File::open(path).is_err() => ImportFailure::Unreadable,
                _ => ImportFailure::Storage,
            });
        }
    };
    let discard = || {
        if let Err(error) = context.store.remove(&stored.stored_filename) {
            log::warn!("import: could not remove a discarded copy: {error}");
        }
    };

    match context
        .database
        .read(|connection| documents::find_by_hash(connection, &stored.sha256))
    {
        Ok(Some(existing)) => {
            discard();
            return ImportOutcome::Duplicate {
                existing: DocumentRef {
                    id: existing.id,
                    title: existing.title,
                },
            };
        }
        Ok(None) => {}
        Err(error) => {
            log::warn!("import: duplicate check failed: {error}");
            discard();
            return failed(ImportFailure::Database);
        }
    }

    let extraction = match context.store.path_for(&stored.stored_filename) {
        Ok(managed) => extract(kind, &managed),
        Err(error) => {
            log::warn!("import: managed path unavailable: {error}");
            discard();
            return failed(ImportFailure::Storage);
        }
    };
    let mut metadata: Map<String, Value> = extraction.metadata.clone();
    metadata.insert("format".to_owned(), Value::from(kind.extension()));
    if let Some(modified) = source
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .and_then(|duration| i64::try_from(duration.as_millis()).ok())
    {
        metadata.insert("sourceModifiedAt".to_owned(), Value::from(modified));
    }
    if let Some(issue) = extraction.issue {
        metadata.insert("extractionIssue".to_owned(), Value::from(issue.as_str()));
    }

    let input = NewDocument {
        id: id.clone(),
        title: title_for(path),
        original_filename: display_name(path),
        stored_filename: stored.stored_filename.clone(),
        file_extension: kind.extension().to_owned(),
        mime_type: kind.mime_type().to_owned(),
        file_size: i64::try_from(stored.size).unwrap_or(i64::MAX),
        content_hash: stored.sha256.clone(),
        workspace_id: target.workspace_id.clone(),
        folder_id: target.folder_id.clone(),
        metadata: Value::Object(metadata),
    };
    let saved = context.database.write(|transaction| {
        let document = documents::insert(transaction, &input)?;
        documents::set_processing_status(transaction, &document.id, extraction.status)?;
        if let Some(text) = &extraction.text {
            documents::set_content(transaction, &document.id, text, extraction.extractor)?;
        }
        timeline::record(
            transaction,
            &NewTimelineEvent {
                event_type: TimelineEventType::DocumentImported,
                entity: (EntityKind::Document, &document.id),
                workspace_id: target.workspace_id.as_deref(),
                description: &document.title,
                metadata: serde_json::json!({ "format": kind.extension() }),
            },
        )?;
        documents::get(transaction, &document.id)
    });
    match saved {
        Ok(document) => ImportOutcome::Imported {
            document: Box::new(document),
            issue: extraction.issue,
        },
        Err(AppError::DuplicateContent { existing_id }) => {
            discard();
            let title = context
                .database
                .read(|connection| documents::get(connection, &existing_id))
                .map(|document| document.title)
                .unwrap_or_default();
            ImportOutcome::Duplicate {
                existing: DocumentRef {
                    id: existing_id,
                    title,
                },
            }
        }
        Err(error) => {
            log::warn!("import: saving failed: {error}");
            discard();
            failed(ImportFailure::Database)
        }
    }
}

/// Validates an identifier received from the interface before it reaches the pipeline.
pub fn check_target_ids(target: &ImportTarget) -> AppResult<()> {
    if let Some(id) = &target.workspace_id {
        validate_id(id, "workspace id")?;
    }
    if let Some(id) = &target.folder_id {
        validate_id(id, "folder id")?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::testing::open_temporary;
    use crate::import::extract::tests::docx_bytes;
    use crate::paths::AppPaths;
    use crate::repo::documents::ProcessingStatus;
    use crate::repo::workspaces::NewWorkspace;
    use crate::storage::hash_file;

    struct Fixture {
        _dir: tempfile::TempDir,
        sources: PathBuf,
        database: Database,
        store: FileStore,
        cancel: AtomicBool,
    }

    fn fixture() -> Fixture {
        let (dir, database) = open_temporary();
        let paths = AppPaths::from_data_dir(dir.path().join("data"));
        paths.ensure_directories().expect("directories");
        let sources = dir.path().join("sources");
        fs::create_dir_all(&sources).expect("sources");
        Fixture {
            store: FileStore::new(&paths),
            _dir: dir,
            sources,
            database,
            cancel: AtomicBool::new(false),
        }
    }

    impl Fixture {
        fn source(&self, name: &str, bytes: &[u8]) -> PathBuf {
            let path = self.sources.join(name);
            fs::write(&path, bytes).expect("source");
            path
        }

        fn import(
            &self,
            paths: &[PathBuf],
            target: &ImportTarget,
        ) -> (ImportSummary, Vec<ImportProgress>) {
            let context = ImportContext {
                database: &self.database,
                store: &self.store,
                cancel: &self.cancel,
            };
            let mut events = Vec::new();
            let summary =
                import_paths(&context, paths, target, |event| events.push(event)).expect("import");
            (summary, events)
        }
    }

    fn outcomes(events: &[ImportProgress]) -> Vec<&ImportOutcome> {
        events
            .iter()
            .filter_map(|event| match event {
                ImportProgress::File { outcome, .. } => Some(outcome),
                _ => None,
            })
            .collect()
    }

    #[test]
    fn supported_files_are_imported_with_their_text_and_originals_stay_intact() {
        let fixture = fixture();
        let text = fixture.source("Notes de cours.txt", "Loi d’Ohm : U = R × I".as_bytes());
        let docx = fixture.source(
            "Rapport.docx",
            &docx_bytes(
                "<w:document xmlns:w=\"w\"><w:body><w:p><w:r><w:t>Montage astable</w:t></w:r></w:p></w:body></w:document>",
                None,
            ),
        );
        let pdf = fixture.source("Fiche NE555.pdf", b"%PDF-1.7\n%\xE2\xE3\n1 0 obj\n");
        let before: Vec<_> = [&text, &docx, &pdf]
            .iter()
            .map(|path| hash_file(path).expect("hash"))
            .collect();

        let (summary, events) = fixture.import(
            &[text.clone(), docx.clone(), pdf.clone()],
            &ImportTarget::default(),
        );
        assert_eq!(summary.imported, 3);

        let after: Vec<_> = [&text, &docx, &pdf]
            .iter()
            .map(|path| hash_file(path).expect("hash"))
            .collect();
        assert_eq!(before, after, "original files must not change");

        let ImportProgress::Started { files } = &events[0] else {
            panic!("first event announces the files")
        };
        assert_eq!(files[0].name, "Notes de cours.txt");
        let documents: Vec<&Document> = outcomes(&events)
            .into_iter()
            .map(|outcome| match outcome {
                ImportOutcome::Imported { document, .. } => document.as_ref(),
                other => panic!("unexpected outcome {other:?}"),
            })
            .collect();
        assert_eq!(documents[0].title, "Notes de cours");
        assert_eq!(documents[0].indexing_status, ProcessingStatus::Completed);
        assert_eq!(documents[1].mime_type, FileKind::Docx.mime_type());
        assert_eq!(documents[2].indexing_status, ProcessingStatus::Pending);
        let content = fixture
            .database
            .read(|c| documents::content(c, &documents[1].id))
            .expect("content");
        assert_eq!(content.as_deref(), Some("Montage astable"));

        let managed = fixture
            .store
            .path_for(&documents[0].stored_filename)
            .expect("path");
        assert_eq!(
            hash_file(&managed).expect("hash").1,
            documents[0].content_hash
        );
        let events = fixture
            .database
            .read(|c| timeline::list(c, 10))
            .expect("timeline");
        assert_eq!(events.len(), 3);
        assert!(
            events
                .iter()
                .all(|event| event.event_type == TimelineEventType::DocumentImported)
        );
    }

    #[test]
    fn duplicates_are_detected_by_content_whatever_the_name() {
        let fixture = fixture();
        let first = fixture.source("cours.txt", b"contenu identique");
        let second = fixture.source("copie du cours.md", b"contenu identique");
        fixture.import(std::slice::from_ref(&first), &ImportTarget::default());
        let (summary, events) = fixture.import(&[second], &ImportTarget::default());
        assert_eq!(summary.duplicates, 1);
        assert!(matches!(
            outcomes(&events)[0],
            ImportOutcome::Duplicate { existing } if existing.title == "cours"
        ));
        // No managed copy is left behind for the duplicate.
        assert_eq!(fixture.store.usage().expect("usage").files, 1);
    }

    #[test]
    fn invalid_files_are_reported_one_by_one_without_stopping_the_import() {
        let fixture = fixture();
        let renamed_executable = fixture.source("facture.pdf", b"MZ\x90\x00\x03\x00\x00\x00");
        let unsupported = fixture.source("programme.exe", b"MZ");
        let folder = fixture.sources.join("dossier");
        fs::create_dir_all(&folder).expect("folder");
        let missing = fixture.sources.join("absent.txt");
        let valid = fixture.source("valide.csv", b"a,b\n1,2\n");

        let (summary, events) = fixture.import(
            &[renamed_executable, unsupported, folder, missing, valid],
            &ImportTarget::default(),
        );
        assert_eq!((summary.imported, summary.failed), (1, 4));
        let reasons: Vec<_> = outcomes(&events)
            .into_iter()
            .filter_map(|outcome| match outcome {
                ImportOutcome::Failed { reason } => Some(*reason),
                _ => None,
            })
            .collect();
        assert_eq!(
            reasons,
            [
                ImportFailure::ContentMismatch,
                ImportFailure::Unsupported,
                ImportFailure::NotAFile,
                ImportFailure::Unreadable
            ]
        );
        assert_eq!(fixture.store.usage().expect("usage").files, 1);
    }

    #[test]
    fn files_over_the_size_limit_are_refused_before_any_copy() {
        let fixture = fixture();
        let huge = fixture.source("archive-complete.csv", b"a,b\n");
        // A sparse file: its size is beyond the limit without using disk space.
        fs::OpenOptions::new()
            .write(true)
            .open(&huge)
            .expect("open")
            .set_len(MAX_IMPORT_BYTES + 1)
            .expect("set_len");

        let (summary, events) =
            fixture.import(std::slice::from_ref(&huge), &ImportTarget::default());
        assert_eq!((summary.imported, summary.failed), (0, 1));
        assert!(matches!(
            outcomes(&events)[0],
            ImportOutcome::Failed {
                reason: ImportFailure::TooLarge
            }
        ));
        assert_eq!(fixture.store.usage().expect("usage").files, 0);
        assert_eq!(
            fs::metadata(&huge).expect("original").len(),
            MAX_IMPORT_BYTES + 1
        );
    }

    #[test]
    fn malformed_content_is_kept_and_flagged() {
        let fixture = fixture();
        let broken = fixture.source("export.json", b"{\"cle\": ");
        let (_, events) = fixture.import(&[broken], &ImportTarget::default());
        let ImportOutcome::Imported { document, issue } = outcomes(&events)[0] else {
            panic!("a malformed JSON is stored, not refused")
        };
        assert_eq!(*issue, Some(ExtractionIssue::InvalidJson));
        assert_eq!(document.indexing_status, ProcessingStatus::Failed);
        assert_eq!(document.metadata["extractionIssue"], "invalid_json");
    }

    #[test]
    fn documents_go_into_the_target_workspace_and_folder() {
        let fixture = fixture();
        let (workspace, folder, other) = fixture
            .database
            .write(|tx| {
                let workspace = workspaces::create(
                    tx,
                    &NewWorkspace {
                        name: "Électronique".to_owned(),
                        description: None,
                        color: None,
                        icon: None,
                    },
                )?;
                let other = workspaces::create(
                    tx,
                    &NewWorkspace {
                        name: "Autre".to_owned(),
                        description: None,
                        color: None,
                        icon: None,
                    },
                )?;
                let folder = folders::create(tx, &workspace.id, None, "Cours")?;
                Ok((workspace, folder, other))
            })
            .expect("setup");
        let file = fixture.source("loi.txt", b"U = R I");
        let target = ImportTarget {
            workspace_id: Some(workspace.id.clone()),
            folder_id: Some(folder.id.clone()),
        };
        let (_, events) = fixture.import(&[file], &target);
        let ImportOutcome::Imported { document, .. } = outcomes(&events)[0] else {
            panic!("imported")
        };
        assert_eq!(
            document.workspace_id.as_deref(),
            Some(workspace.id.as_str())
        );
        assert_eq!(document.folder_id.as_deref(), Some(folder.id.as_str()));

        let context = ImportContext {
            database: &fixture.database,
            store: &fixture.store,
            cancel: &fixture.cancel,
        };
        let mismatched = ImportTarget {
            workspace_id: Some(other.id),
            folder_id: Some(folder.id),
        };
        assert!(import_paths(&context, &[], &mismatched, |_| {}).is_err());
    }

    #[test]
    fn a_cancelled_import_stops_before_the_next_file() {
        let fixture = fixture();
        let first = fixture.source("a.txt", b"premier");
        let second = fixture.source("b.txt", b"second");
        fixture.cancel.store(true, Ordering::SeqCst);
        let (summary, _) = fixture.import(&[first, second], &ImportTarget::default());
        assert_eq!((summary.imported, summary.cancelled), (0, 2));
        assert_eq!(fixture.store.usage().expect("usage").files, 0);
    }
}

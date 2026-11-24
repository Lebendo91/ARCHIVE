//! Export of the user's data in open formats (specification §16.4, ARCHITECTURE.md §7.1): the documents' files
//! under their original names, the notes in Markdown, CSV tables and a complete JSON file, arranged by workspace
//! and folder. Everything is readable without ARCHIVE. Nothing in the trash and no secret is exported.
//!
//! The export is written into a new folder, `<name>.partial` until it is complete: an interrupted export leaves
//! nothing under its final name, and a failed one removes what it wrote. Nothing else is ever touched.

use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::{self, BufWriter, Write};
use std::path::{Path, PathBuf};

use rusqlite::{Connection, Row};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use ts_rs::TS;

use crate::db::Database;
use crate::error::{AppError, AppResult};
use crate::paths::AppPaths;
use crate::storage::FileStore;
use crate::util::{file_stamp, iso_datetime, now_ms, safe_file_name, validate_id};

pub const FORMAT: &str = "archive-export";
pub const FORMAT_VERSION: u32 = 1;
const DOCUMENTS: &str = "documents";
const NOTES: &str = "notes";
const METADATA: &str = "metadata";
/// Longest name of a folder or file written, in characters: paths stay readable, and short enough for Windows.
const NAME_MAX: usize = 100;
/// Deepest chain of folders followed; a deeper (or circular) chain is cut there.
const DEPTH_MAX: usize = 32;

/// What to export: the whole knowledge base, or one workspace.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[ts(export)]
pub enum ExportScope {
    All,
    Workspace { id: String },
}

/// A note written as a TipTap document: the interface converts it to Markdown, with the conversion of the export
/// of one note (Phase 5), and sends it back with the export.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ExportNoteSource {
    pub id: String,
    pub content: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ExportProgress {
    pub done: u32,
    pub total: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ExportSummary {
    /// The folder written.
    pub folder: String,
    pub documents: u32,
    pub notes: u32,
    pub workspaces: u32,
    pub relations: u32,
    /// Documents whose managed copy is missing: named here, in the tables and in `archive.json`, not written.
    pub missing_files: Vec<String>,
}

struct Workspace {
    id: String,
    name: String,
    description: String,
    color: String,
    icon: String,
    archived: bool,
    created_at: i64,
    updated_at: i64,
}

struct Folder {
    id: String,
    workspace_id: String,
    parent_id: Option<String>,
    name: String,
    created_at: i64,
}

struct Tag {
    id: String,
    name: String,
    color: String,
}

struct Document {
    id: String,
    title: String,
    original_filename: String,
    stored_filename: String,
    extension: String,
    mime_type: String,
    size: i64,
    sha256: String,
    workspace_id: Option<String>,
    folder_id: Option<String>,
    favorite: bool,
    archived: bool,
    created_at: i64,
    updated_at: i64,
    imported_at: i64,
    metadata: Value,
    tags: Vec<String>,
}

struct Note {
    id: String,
    title: String,
    content: String,
    format: String,
    text: String,
    workspace_id: Option<String>,
    folder_id: Option<String>,
    favorite: bool,
    archived: bool,
    created_at: i64,
    updated_at: i64,
    tags: Vec<String>,
}

struct Relation {
    id: String,
    source_type: String,
    source_id: String,
    target_type: String,
    target_id: String,
    relation_type: String,
    origin: String,
    status: String,
    confidence: Option<f64>,
    created_at: i64,
}

struct Mention {
    entity_type: String,
    entity_id: String,
    page: Option<i64>,
}

struct Concept {
    id: String,
    name: String,
    kind: String,
    mentions: Vec<Mention>,
}

struct Conversation {
    id: String,
    title: String,
    created_at: i64,
    updated_at: i64,
    messages: Vec<Value>,
}

/// The data exported, read at one moment.
struct Snapshot {
    workspaces: Vec<Workspace>,
    folders: Vec<Folder>,
    tags: Vec<Tag>,
    documents: Vec<Document>,
    notes: Vec<Note>,
    relations: Vec<Relation>,
    concepts: Vec<Concept>,
    conversations: Vec<Conversation>,
}

fn scope_workspace(scope: &ExportScope) -> AppResult<Option<&str>> {
    match scope {
        ExportScope::All => Ok(None),
        ExportScope::Workspace { id } => {
            validate_id(id, "workspace")?;
            Ok(Some(id.as_str()))
        }
    }
}

fn query<T>(
    connection: &Connection,
    sql: &str,
    params: impl rusqlite::Params,
    map: impl FnMut(&Row<'_>) -> rusqlite::Result<T>,
) -> AppResult<Vec<T>> {
    let mut statement = connection.prepare(sql)?;
    let rows = statement.query_map(params, map)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// Names of the tags of each item of a kind, in alphabetical order.
fn tag_names(
    connection: &Connection,
    table: &str,
    column: &str,
) -> AppResult<HashMap<String, Vec<String>>> {
    let pairs: Vec<(String, String)> = query(
        connection,
        &format!(
            "SELECT link.{column}, tags.name FROM {table} AS link JOIN tags ON tags.id = link.tag_id
             ORDER BY tags.name_key"
        ),
        [],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;
    let mut names: HashMap<String, Vec<String>> = HashMap::new();
    for (item, name) in pairs {
        names.entry(item).or_default().push(name);
    }
    Ok(names)
}

/// The notes of the scope written as TipTap documents, for the interface to convert.
pub fn notes_to_convert(
    connection: &Connection,
    scope: &ExportScope,
) -> AppResult<Vec<ExportNoteSource>> {
    let workspace = scope_workspace(scope)?;
    query(
        connection,
        "SELECT id, content FROM notes
         WHERE deleted_at IS NULL AND content_format = 'tiptap-json' AND (?1 IS NULL OR workspace_id = ?1)
         ORDER BY created_at, id",
        [workspace],
        |row| {
            Ok(ExportNoteSource {
                id: row.get(0)?,
                content: row.get(1)?,
            })
        },
    )
}

fn load(connection: &Connection, scope: &ExportScope) -> AppResult<Snapshot> {
    let workspace = scope_workspace(scope)?;
    // One read transaction: the tables agree with each other even if the user keeps writing.
    let transaction = connection.unchecked_transaction()?;
    let connection: &Connection = &transaction;
    let workspaces = query(
        connection,
        "SELECT id, name, description, color, icon, is_archived, created_at, updated_at FROM workspaces
         WHERE ?1 IS NULL OR id = ?1 ORDER BY sort_order, name_key",
        [workspace],
        |row| {
            Ok(Workspace {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                color: row.get(3)?,
                icon: row.get(4)?,
                archived: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        },
    )?;
    if workspace.is_some() && workspaces.is_empty() {
        return Err(AppError::NotFound {
            entity: "workspace",
        });
    }
    let folders = query(
        connection,
        "SELECT id, workspace_id, parent_id, name, created_at FROM folders
         WHERE ?1 IS NULL OR workspace_id = ?1 ORDER BY name_key, id",
        [workspace],
        |row| {
            Ok(Folder {
                id: row.get(0)?,
                workspace_id: row.get(1)?,
                parent_id: row.get(2)?,
                name: row.get(3)?,
                created_at: row.get(4)?,
            })
        },
    )?;
    let mut document_tags = tag_names(connection, "document_tags", "document_id")?;
    let documents = query(
        connection,
        "SELECT id, title, original_filename, stored_filename, file_extension, mime_type, file_size, content_hash,
                workspace_id, folder_id, is_favorite, is_archived, created_at, updated_at, imported_at,
                metadata_json
         FROM documents WHERE deleted_at IS NULL AND (?1 IS NULL OR workspace_id = ?1)
         ORDER BY imported_at, id",
        [workspace],
        |row| {
            let metadata: String = row.get(15)?;
            Ok(Document {
                id: row.get(0)?,
                title: row.get(1)?,
                original_filename: row.get(2)?,
                stored_filename: row.get(3)?,
                extension: row.get(4)?,
                mime_type: row.get(5)?,
                size: row.get(6)?,
                sha256: row.get(7)?,
                workspace_id: row.get(8)?,
                folder_id: row.get(9)?,
                favorite: row.get(10)?,
                archived: row.get(11)?,
                created_at: row.get(12)?,
                updated_at: row.get(13)?,
                imported_at: row.get(14)?,
                metadata: serde_json::from_str(&metadata).unwrap_or_else(|_| json!({})),
                tags: Vec::new(),
            })
        },
    )?
    .into_iter()
    .map(|mut document| {
        document.tags = document_tags.remove(&document.id).unwrap_or_default();
        document
    })
    .collect::<Vec<_>>();
    let mut note_tags = tag_names(connection, "note_tags", "note_id")?;
    let notes = query(
        connection,
        "SELECT id, title, content, content_format, content_text, workspace_id, folder_id, is_favorite,
                is_archived, created_at, updated_at
         FROM notes WHERE deleted_at IS NULL AND (?1 IS NULL OR workspace_id = ?1)
         ORDER BY created_at, id",
        [workspace],
        |row| {
            Ok(Note {
                id: row.get(0)?,
                title: row.get(1)?,
                content: row.get(2)?,
                format: row.get(3)?,
                text: row.get(4)?,
                workspace_id: row.get(5)?,
                folder_id: row.get(6)?,
                favorite: row.get(7)?,
                archived: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
                tags: Vec::new(),
            })
        },
    )?
    .into_iter()
    .map(|mut note| {
        note.tags = note_tags.remove(&note.id).unwrap_or_default();
        note
    })
    .collect::<Vec<_>>();

    let exported: HashSet<(&str, &str)> = documents
        .iter()
        .map(|document| ("document", document.id.as_str()))
        .chain(notes.iter().map(|note| ("note", note.id.as_str())))
        .collect();
    let relations = query(
        connection,
        "SELECT id, source_type, source_id, target_type, target_id, relation_type, origin, status, confidence,
                created_at
         FROM relations WHERE source_type IN ('document', 'note') AND target_type IN ('document', 'note')
         ORDER BY created_at, id",
        [],
        |row| {
            Ok(Relation {
                id: row.get(0)?,
                source_type: row.get(1)?,
                source_id: row.get(2)?,
                target_type: row.get(3)?,
                target_id: row.get(4)?,
                relation_type: row.get(5)?,
                origin: row.get(6)?,
                status: row.get(7)?,
                confidence: row.get(8)?,
                created_at: row.get(9)?,
            })
        },
    )?
    .into_iter()
    .filter(|relation| {
        exported.contains(&(relation.source_type.as_str(), relation.source_id.as_str()))
            && exported.contains(&(relation.target_type.as_str(), relation.target_id.as_str()))
    })
    .collect();

    let mut concepts: Vec<Concept> = Vec::new();
    let mentions: Vec<(String, String, String, Mention)> = query(
        connection,
        "SELECT concepts.id, concepts.name, concepts.kind, mentions.entity_type, mentions.entity_id, mentions.page
         FROM concept_mentions AS mentions JOIN concepts ON concepts.id = mentions.concept_id
         ORDER BY concepts.name_key, concepts.id, mentions.created_at",
        [],
        |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                Mention {
                    entity_type: row.get(3)?,
                    entity_id: row.get(4)?,
                    page: row.get(5)?,
                },
            ))
        },
    )?;
    for (id, name, kind, mention) in mentions {
        if !exported.contains(&(mention.entity_type.as_str(), mention.entity_id.as_str())) {
            continue;
        }
        match concepts.last_mut() {
            Some(concept) if concept.id == id => concept.mentions.push(mention),
            _ => concepts.push(Concept {
                id,
                name,
                kind,
                mentions: vec![mention],
            }),
        }
    }

    // The tags of the export: all of them, or those of the workspace's items.
    let used: HashSet<&String> = documents
        .iter()
        .flat_map(|document| &document.tags)
        .chain(notes.iter().flat_map(|note| &note.tags))
        .collect();
    let tags = query(
        connection,
        "SELECT id, name, color FROM tags ORDER BY name_key",
        [],
        |row| {
            Ok(Tag {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
            })
        },
    )?
    .into_iter()
    .filter(|tag| workspace.is_none() || used.contains(&tag.name))
    .collect();

    // Conversations are not tied to one workspace: they are part of a complete export only.
    let conversations = if workspace.is_none() {
        let mut messages: HashMap<String, Vec<Value>> = HashMap::new();
        let rows: Vec<(String, Value)> = query(
            connection,
            "SELECT conversation_id, role, content, status, sources_json, created_at FROM conversation_messages
             ORDER BY conversation_id, position",
            [],
            |row| {
                let sources: String = row.get(4)?;
                Ok((
                    row.get(0)?,
                    json!({
                        "role": row.get::<_, String>(1)?,
                        "content": row.get::<_, String>(2)?,
                        "status": row.get::<_, String>(3)?,
                        "sources": serde_json::from_str::<Value>(&sources).unwrap_or_else(|_| json!([])),
                        "createdAt": iso_datetime(row.get(5)?),
                    }),
                ))
            },
        )?;
        for (conversation, message) in rows {
            messages.entry(conversation).or_default().push(message);
        }
        query(
            connection,
            "SELECT id, title, created_at, updated_at FROM conversations ORDER BY created_at, id",
            [],
            |row| {
                Ok(Conversation {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    created_at: row.get(2)?,
                    updated_at: row.get(3)?,
                    messages: Vec::new(),
                })
            },
        )?
        .into_iter()
        .map(|mut conversation| {
            conversation.messages = messages.remove(&conversation.id).unwrap_or_default();
            conversation
        })
        .collect()
    } else {
        Vec::new()
    };
    drop(transaction);
    Ok(Snapshot {
        workspaces,
        folders,
        tags,
        documents,
        notes,
        relations,
        concepts,
        conversations,
    })
}

/// A name usable as one folder or file name on Windows, at most `NAME_MAX` characters. The extension is set
/// apart first, so that shortening a long name never cuts it.
fn segment(name: &str, fallback: &str) -> String {
    let base = if name.trim().is_empty() {
        fallback.trim()
    } else {
        name.trim()
    };
    let (stem, extension) = match base.rfind('.') {
        Some(index)
            if index > 0
                && index + 1 < base.len()
                && base.len() - index <= 17
                && base[index + 1..]
                    .chars()
                    .all(|character| character.is_ascii_alphanumeric()) =>
        {
            base.split_at(index)
        }
        _ => (base, ""),
    };
    // Reserved names and characters refused by Windows (`safe_file_name`), then the length.
    let stem = safe_file_name(stem);
    let keep = NAME_MAX.saturating_sub(extension.chars().count());
    let stem: String = stem.chars().take(keep).collect();
    let stem = stem.trim_end_matches([' ', '.']);
    if stem.is_empty() {
        format!("document{extension}")
    } else {
        format!("{stem}{extension}")
    }
}

/// Names taken in each folder of the export, compared as Windows does: without regard to case.
#[derive(Clone, Default)]
struct Names(HashMap<Vec<String>, HashSet<String>>);

impl Names {
    /// A name still free in `folder`: `name`, else `name (2)`, `name (3)`… (before the extension of a file).
    fn claim(&mut self, folder: &[String], name: &str, is_file: bool) -> String {
        let taken = self.0.entry(folder.to_vec()).or_default();
        let (stem, extension) = match name.rfind('.') {
            Some(index) if is_file && index > 0 => name.split_at(index),
            _ => (name, ""),
        };
        let mut candidate = name.to_owned();
        let mut number = 2;
        while !taken.insert(candidate.to_lowercase()) {
            candidate = format!("{stem} ({number}){extension}");
            number += 1;
        }
        candidate
    }
}

/// Where the workspaces and folders are written, relative to `documents/` and `notes/`, and how they read.
struct Layout {
    workspaces: HashMap<String, Vec<String>>,
    folders: HashMap<String, Vec<String>>,
    /// The path of each folder inside its workspace, with the names the user gave: `Cours/Analogique`.
    folder_labels: HashMap<String, String>,
    names: Names,
}

impl Layout {
    fn new(workspaces: &[Workspace], folders: &[Folder]) -> Self {
        let mut names = Names::default();
        let mut workspace_paths = HashMap::new();
        for workspace in workspaces {
            let name = names.claim(&[], &segment(&workspace.name, "workspace"), false);
            workspace_paths.insert(workspace.id.clone(), vec![name]);
        }
        let by_id: HashMap<&str, &Folder> = folders
            .iter()
            .map(|folder| (folder.id.as_str(), folder))
            .collect();
        let mut layout = Self {
            workspaces: workspace_paths,
            folders: HashMap::new(),
            folder_labels: HashMap::new(),
            names,
        };
        for folder in folders {
            layout.place(folder, &by_id, 0);
        }
        layout
    }

    fn place(
        &mut self,
        folder: &Folder,
        by_id: &HashMap<&str, &Folder>,
        depth: usize,
    ) -> Option<Vec<String>> {
        if let Some(path) = self.folders.get(&folder.id) {
            return Some(path.clone());
        }
        let workspace = self.workspaces.get(&folder.workspace_id)?.clone();
        let parent = folder
            .parent_id
            .as_deref()
            .and_then(|id| by_id.get(id))
            .filter(|parent| depth < DEPTH_MAX && parent.workspace_id == folder.workspace_id);
        let (mut path, label) = match parent {
            Some(parent) => match self.place(parent, by_id, depth + 1) {
                Some(path) => {
                    let label = self
                        .folder_labels
                        .get(&parent.id)
                        .cloned()
                        .unwrap_or_default();
                    (path, format!("{label}/{}", folder.name))
                }
                None => (workspace, folder.name.clone()),
            },
            None => (workspace, folder.name.clone()),
        };
        // The folder may have been placed while placing its parents (a circular chain): placed once only.
        if let Some(path) = self.folders.get(&folder.id) {
            return Some(path.clone());
        }
        let name = self
            .names
            .claim(&path, &segment(&folder.name, "folder"), false);
        path.push(name);
        self.folders.insert(folder.id.clone(), path.clone());
        self.folder_labels.insert(folder.id.clone(), label);
        Some(path)
    }

    /// The folder of an item, relative to `documents/` or `notes/`.
    fn location(&self, workspace_id: Option<&str>, folder_id: Option<&str>) -> Vec<String> {
        folder_id
            .and_then(|id| self.folders.get(id))
            .or_else(|| workspace_id.and_then(|id| self.workspaces.get(id)))
            .cloned()
            .unwrap_or_default()
    }
}

fn relative(root: &str, folder: &[String], name: &str) -> String {
    std::iter::once(root)
        .chain(folder.iter().map(String::as_str))
        .chain(std::iter::once(name))
        .collect::<Vec<_>>()
        .join("/")
}

fn on_disk(base: &Path, relative: &str) -> PathBuf {
    relative
        .split('/')
        .fold(base.to_path_buf(), |path, part| path.join(part))
}

/// One cell of a CSV table (RFC 4180). A spreadsheet runs a cell that starts like a formula: such a cell is kept
/// as text with a leading apostrophe (`archive.json` holds the exact value).
fn cell(value: &str) -> String {
    let value = if value.starts_with(['=', '+', '-', '@', '\t', '\r']) {
        format!("'{value}")
    } else {
        value.to_owned()
    };
    if value.contains([',', '"', '\n', '\r']) {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value
    }
}

/// A CSV table in UTF-8 with a byte order mark (so that spreadsheets read the accents), lines ending with CRLF.
fn write_csv(path: &Path, header: &[&str], rows: &[Vec<String>]) -> io::Result<()> {
    let mut out = BufWriter::new(File::create(path)?);
    out.write_all("\u{feff}".as_bytes())?;
    out.write_all(header.join(",").as_bytes())?;
    out.write_all(b"\r\n")?;
    for row in rows {
        let line: Vec<String> = row.iter().map(|value| cell(value)).collect();
        out.write_all(line.join(",").as_bytes())?;
        out.write_all(b"\r\n")?;
    }
    out.flush()
}

fn yes_no(value: bool) -> String {
    if value { "true" } else { "false" }.to_owned()
}

fn optional(value: Option<&str>) -> Value {
    value.map_or(Value::Null, |value| Value::String(value.to_owned()))
}

/// A folder name free in `parent`, for the export and for its `.partial` form.
fn free_name(parent: &Path, base: &str) -> String {
    let mut name = base.to_owned();
    let mut number = 2;
    while parent.join(&name).exists() || parent.join(format!("{name}.partial")).exists() {
        name = format!("{base} ({number})");
        number += 1;
    }
    name
}

/// Writes the export into a new folder of `parent`. `markdown` holds the Markdown of the notes written as TipTap
/// documents (converted by the interface); a note missing from it is written as its plain text. `untitled` names
/// the notes without title.
pub fn export(
    database: &Database,
    paths: &AppPaths,
    parent: &Path,
    scope: &ExportScope,
    markdown: &HashMap<String, String>,
    untitled: &str,
    mut progress: impl FnMut(ExportProgress),
) -> AppResult<ExportSummary> {
    // Never inside ARCHIVE's own data, where the export would mix with the managed files.
    let data_dir = paths.data_dir.canonicalize()?;
    if parent.canonicalize()?.starts_with(&data_dir) {
        return Err(AppError::InvalidInput(
            "an export cannot be written inside the data folder of ARCHIVE".to_owned(),
        ));
    }
    let snapshot = database.read(|connection| load(connection, scope))?;
    let now = now_ms();
    let base = match (scope, snapshot.workspaces.first()) {
        (ExportScope::Workspace { .. }, Some(workspace)) => format!(
            "ARCHIVE-export-{}-{}",
            segment(&workspace.name, "workspace"),
            file_stamp(now)
        ),
        _ => format!("ARCHIVE-export-{}", file_stamp(now)),
    };
    let name = free_name(parent, &base);
    let partial = parent.join(format!("{name}.partial"));
    let target = parent.join(&name);
    fs::create_dir(&partial)?;
    let written = write(
        &snapshot,
        paths,
        &partial,
        scope,
        markdown,
        untitled,
        now,
        &mut progress,
    )
    .and_then(|summary| {
        fs::rename(&partial, &target)?;
        Ok(summary)
    });
    match written {
        Ok(mut summary) => {
            summary.folder = target.display().to_string();
            Ok(summary)
        }
        Err(error) => {
            // Only the folder this export created.
            let _ = fs::remove_dir_all(&partial);
            Err(error)
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn write(
    snapshot: &Snapshot,
    paths: &AppPaths,
    base: &Path,
    scope: &ExportScope,
    markdown: &HashMap<String, String>,
    untitled: &str,
    now: i64,
    progress: &mut impl FnMut(ExportProgress),
) -> AppResult<ExportSummary> {
    let store = FileStore::new(paths);
    let layout = Layout::new(&snapshot.workspaces, &snapshot.folders);
    let total =
        u32::try_from(snapshot.documents.len() + snapshot.notes.len() + 1).unwrap_or(u32::MAX);
    let mut done = 0;
    let workspace_names: HashMap<&str, &str> = snapshot
        .workspaces
        .iter()
        .map(|workspace| (workspace.id.as_str(), workspace.name.as_str()))
        .collect();
    let folder_label = |id: Option<&str>| -> String {
        id.and_then(|id| layout.folder_labels.get(id))
            .cloned()
            .unwrap_or_default()
    };
    let workspace_name = |id: Option<&str>| -> String {
        id.and_then(|id| workspace_names.get(id))
            .map(|name| (*name).to_owned())
            .unwrap_or_default()
    };

    // The original files, under their original names.
    let mut document_names = layout.names.clone();
    let mut document_files: HashMap<&str, Option<String>> = HashMap::new();
    let mut missing_files = Vec::new();
    for document in &snapshot.documents {
        let folder = layout.location(
            document.workspace_id.as_deref(),
            document.folder_id.as_deref(),
        );
        let mut wanted = segment(&document.original_filename, &document.title);
        if Path::new(&wanted).extension().is_none() {
            wanted = format!("{wanted}.{}", document.extension);
        }
        let source = store.path_for(&document.stored_filename)?;
        if source.is_file() {
            let name = document_names.claim(&folder, &wanted, true);
            let file = relative(DOCUMENTS, &folder, &name);
            let destination = on_disk(base, &file);
            if let Some(parent) = destination.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::copy(&source, &destination)?;
            document_files.insert(&document.id, Some(file));
        } else {
            log::warn!(
                "export: the managed copy of document {} is missing",
                document.id
            );
            missing_files.push(document.title.clone());
            document_files.insert(&document.id, None);
        }
        done += 1;
        progress(ExportProgress { done, total });
    }

    // The notes in Markdown, their details in a YAML header.
    let mut note_names = layout.names.clone();
    let mut note_files: HashMap<&str, (String, String)> = HashMap::new();
    let mut as_plain_text = 0;
    for note in &snapshot.notes {
        let folder = layout.location(note.workspace_id.as_deref(), note.folder_id.as_deref());
        let title = if note.title.trim().is_empty() {
            untitled
        } else {
            note.title.as_str()
        };
        let name = note_names.claim(
            &folder,
            &segment(&format!("{}.md", title.trim()), untitled),
            true,
        );
        let body = match note.format.as_str() {
            "tiptap-json" => markdown.get(&note.id).cloned().unwrap_or_else(|| {
                as_plain_text += 1;
                note.text.clone()
            }),
            _ => note.content.clone(),
        };
        let mut header = vec![
            ("title", json!(title)),
            ("id", json!(note.id)),
            ("created", json!(iso_datetime(note.created_at))),
            ("updated", json!(iso_datetime(note.updated_at))),
        ];
        let workspace = workspace_name(note.workspace_id.as_deref());
        if !workspace.is_empty() {
            header.push(("workspace", json!(workspace)));
        }
        let folder_path = folder_label(note.folder_id.as_deref());
        if !folder_path.is_empty() {
            header.push(("folder", json!(folder_path)));
        }
        if !note.tags.is_empty() {
            header.push(("tags", json!(note.tags)));
        }
        if note.favorite {
            header.push(("favorite", json!(true)));
        }
        let mut text = String::from("---\n");
        for (key, value) in header {
            text.push_str(&format!("{key}: {value}\n"));
        }
        text.push_str("---\n\n");
        text.push_str(body.trim_end());
        text.push('\n');
        let file = relative(NOTES, &folder, &name);
        let destination = on_disk(base, &file);
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(&destination, &text)?;
        note_files.insert(&note.id, (file, body));
        done += 1;
        progress(ExportProgress { done, total });
    }
    if as_plain_text > 0 {
        log::warn!("export: {as_plain_text} notes written as plain text (no Markdown received)");
    }

    // The tables.
    let metadata = base.join(METADATA);
    fs::create_dir_all(&metadata)?;
    let titles: HashMap<(&str, &str), &str> = snapshot
        .documents
        .iter()
        .map(|document| (("document", document.id.as_str()), document.title.as_str()))
        .chain(
            snapshot
                .notes
                .iter()
                .map(|note| (("note", note.id.as_str()), note.title.as_str())),
        )
        .collect();
    write_csv(
        &metadata.join("documents.csv"),
        &[
            "id",
            "title",
            "file",
            "original_filename",
            "extension",
            "mime_type",
            "size_bytes",
            "sha256",
            "workspace",
            "folder",
            "tags",
            "favorite",
            "archived",
            "created_at",
            "updated_at",
            "imported_at",
        ],
        &snapshot
            .documents
            .iter()
            .map(|document| {
                vec![
                    document.id.clone(),
                    document.title.clone(),
                    document_files
                        .get(document.id.as_str())
                        .cloned()
                        .flatten()
                        .unwrap_or_default(),
                    document.original_filename.clone(),
                    document.extension.clone(),
                    document.mime_type.clone(),
                    document.size.to_string(),
                    document.sha256.clone(),
                    workspace_name(document.workspace_id.as_deref()),
                    folder_label(document.folder_id.as_deref()),
                    document.tags.join("; "),
                    yes_no(document.favorite),
                    yes_no(document.archived),
                    iso_datetime(document.created_at),
                    iso_datetime(document.updated_at),
                    iso_datetime(document.imported_at),
                ]
            })
            .collect::<Vec<_>>(),
    )?;
    write_csv(
        &metadata.join("notes.csv"),
        &[
            "id",
            "title",
            "file",
            "workspace",
            "folder",
            "tags",
            "favorite",
            "archived",
            "created_at",
            "updated_at",
        ],
        &snapshot
            .notes
            .iter()
            .map(|note| {
                vec![
                    note.id.clone(),
                    note.title.clone(),
                    note_files
                        .get(note.id.as_str())
                        .map(|(file, _)| file.clone())
                        .unwrap_or_default(),
                    workspace_name(note.workspace_id.as_deref()),
                    folder_label(note.folder_id.as_deref()),
                    note.tags.join("; "),
                    yes_no(note.favorite),
                    yes_no(note.archived),
                    iso_datetime(note.created_at),
                    iso_datetime(note.updated_at),
                ]
            })
            .collect::<Vec<_>>(),
    )?;
    write_csv(
        &metadata.join("workspaces.csv"),
        &[
            "id",
            "name",
            "description",
            "color",
            "icon",
            "archived",
            "documents",
            "notes",
            "created_at",
            "updated_at",
        ],
        &snapshot
            .workspaces
            .iter()
            .map(|workspace| {
                let id = Some(workspace.id.as_str());
                vec![
                    workspace.id.clone(),
                    workspace.name.clone(),
                    workspace.description.clone(),
                    workspace.color.clone(),
                    workspace.icon.clone(),
                    yes_no(workspace.archived),
                    snapshot
                        .documents
                        .iter()
                        .filter(|item| item.workspace_id.as_deref() == id)
                        .count()
                        .to_string(),
                    snapshot
                        .notes
                        .iter()
                        .filter(|item| item.workspace_id.as_deref() == id)
                        .count()
                        .to_string(),
                    iso_datetime(workspace.created_at),
                    iso_datetime(workspace.updated_at),
                ]
            })
            .collect::<Vec<_>>(),
    )?;
    write_csv(
        &metadata.join("relations.csv"),
        &[
            "id",
            "source_type",
            "source_id",
            "source_title",
            "target_type",
            "target_id",
            "target_title",
            "type",
            "origin",
            "status",
            "confidence",
            "created_at",
        ],
        &snapshot
            .relations
            .iter()
            .map(|relation| {
                let title = |kind: &str, id: &str| {
                    titles
                        .get(&(kind, id))
                        .map(|title| (*title).to_owned())
                        .unwrap_or_default()
                };
                vec![
                    relation.id.clone(),
                    relation.source_type.clone(),
                    relation.source_id.clone(),
                    title(&relation.source_type, &relation.source_id),
                    relation.target_type.clone(),
                    relation.target_id.clone(),
                    title(&relation.target_type, &relation.target_id),
                    relation.relation_type.clone(),
                    relation.origin.clone(),
                    relation.status.clone(),
                    relation
                        .confidence
                        .map(|value| format!("{value:.3}"))
                        .unwrap_or_default(),
                    iso_datetime(relation.created_at),
                ]
            })
            .collect::<Vec<_>>(),
    )?;

    // Everything, in one JSON file.
    let scope_json = match (scope, snapshot.workspaces.first()) {
        (ExportScope::Workspace { id }, Some(workspace)) => {
            json!({ "kind": "workspace", "id": id, "name": workspace.name })
        }
        _ => json!({ "kind": "all" }),
    };
    let archive = json!({
        "format": FORMAT,
        "formatVersion": FORMAT_VERSION,
        "appVersion": env!("CARGO_PKG_VERSION"),
        "exportedAt": iso_datetime(now),
        "scope": scope_json,
        "workspaces": snapshot.workspaces.iter().map(|workspace| json!({
            "id": workspace.id,
            "name": workspace.name,
            "description": workspace.description,
            "color": workspace.color,
            "icon": workspace.icon,
            "archived": workspace.archived,
            "createdAt": iso_datetime(workspace.created_at),
            "updatedAt": iso_datetime(workspace.updated_at),
        })).collect::<Vec<_>>(),
        "folders": snapshot.folders.iter().map(|folder| json!({
            "id": folder.id,
            "workspaceId": folder.workspace_id,
            "parentId": folder.parent_id,
            "name": folder.name,
            "path": folder_label(Some(&folder.id)),
            "createdAt": iso_datetime(folder.created_at),
        })).collect::<Vec<_>>(),
        "tags": snapshot.tags.iter().map(|tag| json!({
            "id": tag.id,
            "name": tag.name,
            "color": tag.color,
        })).collect::<Vec<_>>(),
        "documents": snapshot.documents.iter().map(|document| json!({
            "id": document.id,
            "title": document.title,
            "file": document_files.get(document.id.as_str()).cloned().flatten(),
            "originalFilename": document.original_filename,
            "extension": document.extension,
            "mimeType": document.mime_type,
            "sizeBytes": document.size,
            "sha256": document.sha256,
            "workspaceId": optional(document.workspace_id.as_deref()),
            "folderId": optional(document.folder_id.as_deref()),
            "tags": document.tags,
            "favorite": document.favorite,
            "archived": document.archived,
            "createdAt": iso_datetime(document.created_at),
            "updatedAt": iso_datetime(document.updated_at),
            "importedAt": iso_datetime(document.imported_at),
            "metadata": document.metadata,
        })).collect::<Vec<_>>(),
        "notes": snapshot.notes.iter().map(|note| {
            let (file, body) = note_files.get(note.id.as_str()).cloned().unwrap_or_default();
            json!({
                "id": note.id,
                "title": note.title,
                "file": file,
                "markdown": body,
                "workspaceId": optional(note.workspace_id.as_deref()),
                "folderId": optional(note.folder_id.as_deref()),
                "tags": note.tags,
                "favorite": note.favorite,
                "archived": note.archived,
                "createdAt": iso_datetime(note.created_at),
                "updatedAt": iso_datetime(note.updated_at),
            })
        }).collect::<Vec<_>>(),
        "relations": snapshot.relations.iter().map(|relation| json!({
            "id": relation.id,
            "sourceType": relation.source_type,
            "sourceId": relation.source_id,
            "targetType": relation.target_type,
            "targetId": relation.target_id,
            "type": relation.relation_type,
            "origin": relation.origin,
            "status": relation.status,
            "confidence": relation.confidence,
            "createdAt": iso_datetime(relation.created_at),
        })).collect::<Vec<_>>(),
        "concepts": snapshot.concepts.iter().map(|concept| json!({
            "id": concept.id,
            "name": concept.name,
            "kind": concept.kind,
            "mentions": concept.mentions.iter().map(|mention| json!({
                "type": mention.entity_type,
                "id": mention.entity_id,
                "page": mention.page,
            })).collect::<Vec<_>>(),
        })).collect::<Vec<_>>(),
        "conversations": snapshot.conversations.iter().map(|conversation| json!({
            "id": conversation.id,
            "title": conversation.title,
            "createdAt": iso_datetime(conversation.created_at),
            "updatedAt": iso_datetime(conversation.updated_at),
            "messages": conversation.messages,
        })).collect::<Vec<_>>(),
    });
    let mut out = BufWriter::new(File::create(base.join("archive.json"))?);
    serde_json::to_writer_pretty(&mut out, &archive).map_err(|error| {
        AppError::Internal(format!("archive.json could not be written: {error}"))
    })?;
    out.write_all(b"\n")?;
    out.flush()?;
    done += 1;
    progress(ExportProgress { done, total });

    Ok(ExportSummary {
        folder: String::new(),
        documents: u32::try_from(snapshot.documents.len() - missing_files.len())
            .unwrap_or(u32::MAX),
        notes: u32::try_from(snapshot.notes.len()).unwrap_or(u32::MAX),
        workspaces: u32::try_from(snapshot.workspaces.len()).unwrap_or(u32::MAX),
        relations: u32::try_from(snapshot.relations.len()).unwrap_or(u32::MAX),
        missing_files,
    })
}

#[cfg(test)]
mod tests;

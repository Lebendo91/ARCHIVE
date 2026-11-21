//! Library documents (specification §7.3–7.5): filtered and sorted lists, editing, archiving, trash and
//! permanent deletion, and the text of PDF files extracted by the interface.

use rusqlite::types::ToSql;
use rusqlite::{Connection, Transaction, params_from_iter};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use ts_rs::TS;

use crate::error::{AppError, AppResult};
use crate::import::detect::FileKind;
use crate::import::extract::{CONTENT_MAX_BYTES, ExtractionIssue, truncate_utf8};
use crate::repo::documents::{self, Document, ProcessingStatus};
use crate::repo::tags::{self, Tag, Tagged};
use crate::repo::timeline::{self, NewTimelineEvent, TimelineEventType};
use crate::repo::{EntityKind, folders, workspaces};
use crate::util::{fold_for_search, now_ms, validate_id};

pub const PAGE_MAX: u32 = 200;

/// Which part of the Library a list shows.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum DocumentState {
    Active,
    Archived,
    Trashed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum DocumentSort {
    Title,
    ImportedAt,
    UpdatedAt,
    FileSize,
    LastOpenedAt,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
#[ts(export)]
pub enum WorkspaceScope {
    /// Documents kept without workspace.
    Unassigned,
    Workspace {
        id: String,
    },
}

#[derive(Debug, Clone, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct DocumentQuery {
    /// Matches the title or the original file name, whatever the case and accents.
    #[serde(default)]
    #[ts(optional)]
    pub search: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub workspace: Option<WorkspaceScope>,
    #[serde(default)]
    #[ts(optional)]
    pub folder_id: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub kinds: Option<Vec<FileKind>>,
    #[serde(default)]
    #[ts(optional)]
    pub tag_id: Option<String>,
    pub favorites_only: bool,
    pub state: DocumentState,
    #[serde(default)]
    #[ts(optional)]
    pub imported_after: Option<i64>,
    #[serde(default)]
    #[ts(optional)]
    pub updated_after: Option<i64>,
    #[serde(default)]
    #[ts(optional)]
    pub indexing: Option<ProcessingStatus>,
    pub sort: DocumentSort,
    pub descending: bool,
    pub limit: u32,
    pub offset: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct DocumentItem {
    pub document: Document,
    pub tags: Vec<Tag>,
}

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct DocumentPage {
    pub items: Vec<DocumentItem>,
    /// Number of documents matching the query, all pages included.
    pub total: i64,
}

/// Escapes the wildcards of a `LIKE` pattern (escape character `\`).
fn like_pattern(search: &str) -> String {
    let mut pattern = String::from("%");
    for character in fold_for_search(search.trim()).chars() {
        if matches!(character, '%' | '_' | '\\') {
            pattern.push('\\');
        }
        pattern.push(character);
    }
    pattern.push('%');
    pattern
}

pub fn list(connection: &Connection, query: &DocumentQuery) -> AppResult<DocumentPage> {
    if query.limit == 0 || query.limit > PAGE_MAX {
        return Err(AppError::InvalidInput(format!(
            "limit must be between 1 and {PAGE_MAX}"
        )));
    }
    let mut clauses: Vec<String> = Vec::new();
    let mut values: Vec<Box<dyn ToSql>> = Vec::new();
    clauses.push(
        match query.state {
            DocumentState::Active => "d.deleted_at IS NULL AND d.is_archived = 0",
            DocumentState::Archived => "d.deleted_at IS NULL AND d.is_archived = 1",
            DocumentState::Trashed => "d.deleted_at IS NOT NULL",
        }
        .to_owned(),
    );
    if let Some(search) = query
        .search
        .as_deref()
        .filter(|text| !text.trim().is_empty())
    {
        clauses.push(
            "(archive_fold(d.title) LIKE ? ESCAPE '\\' OR archive_fold(d.original_filename) LIKE ? ESCAPE '\\')"
                .to_owned(),
        );
        let pattern = like_pattern(search);
        values.push(Box::new(pattern.clone()));
        values.push(Box::new(pattern));
    }
    match &query.workspace {
        None => {}
        Some(WorkspaceScope::Unassigned) => clauses.push("d.workspace_id IS NULL".to_owned()),
        Some(WorkspaceScope::Workspace { id }) => {
            validate_id(id, "workspace id")?;
            clauses.push("d.workspace_id = ?".to_owned());
            values.push(Box::new(id.clone()));
        }
    }
    if let Some(folder_id) = &query.folder_id {
        validate_id(folder_id, "folder id")?;
        clauses.push("d.folder_id = ?".to_owned());
        values.push(Box::new(folder_id.clone()));
    }
    if let Some(kinds) = query.kinds.as_ref().filter(|kinds| !kinds.is_empty()) {
        let placeholders = vec!["?"; kinds.len()].join(", ");
        clauses.push(format!("d.file_extension IN ({placeholders})"));
        for kind in kinds {
            values.push(Box::new(kind.extension()));
        }
    }
    if let Some(tag_id) = &query.tag_id {
        validate_id(tag_id, "tag id")?;
        clauses.push(
            "EXISTS (SELECT 1 FROM document_tags t WHERE t.document_id = d.id AND t.tag_id = ?)"
                .to_owned(),
        );
        values.push(Box::new(tag_id.clone()));
    }
    if query.favorites_only {
        clauses.push("d.is_favorite = 1".to_owned());
    }
    if let Some(after) = query.imported_after {
        clauses.push("d.imported_at >= ?".to_owned());
        values.push(Box::new(after));
    }
    if let Some(after) = query.updated_after {
        clauses.push("d.updated_at >= ?".to_owned());
        values.push(Box::new(after));
    }
    if let Some(status) = query.indexing {
        clauses.push("d.indexing_status = ?".to_owned());
        values.push(Box::new(status));
    }
    let filter = clauses.join(" AND ");
    let direction = if query.descending { "DESC" } else { "ASC" };
    let order = match query.sort {
        DocumentSort::Title => format!("archive_fold(d.title) {direction}"),
        DocumentSort::ImportedAt => format!("d.imported_at {direction}"),
        DocumentSort::UpdatedAt => format!("d.updated_at {direction}"),
        DocumentSort::FileSize => format!("d.file_size {direction}"),
        // Never opened documents come last, whatever the direction.
        DocumentSort::LastOpenedAt => {
            format!("d.last_opened_at IS NULL, d.last_opened_at {direction}")
        }
    };

    let total: i64 = connection.query_row(
        &format!("SELECT count(*) FROM documents d WHERE {filter}"),
        params_from_iter(values.iter()),
        |row| row.get(0),
    )?;
    let mut statement = connection.prepare(&format!(
        "SELECT d.id FROM documents d WHERE {filter} ORDER BY {order}, d.id LIMIT ? OFFSET ?"
    ))?;
    values.push(Box::new(query.limit));
    values.push(Box::new(query.offset));
    let ids: Vec<String> = statement
        .query_map(params_from_iter(values.iter()), |row| row.get(0))?
        .collect::<Result<_, _>>()?;
    let items = ids
        .iter()
        .map(|id| {
            Ok(DocumentItem {
                document: documents::get(connection, id)?,
                tags: tags::list_for(connection, Tagged::Document(id))?,
            })
        })
        .collect::<AppResult<_>>()?;
    Ok(DocumentPage { items, total })
}

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct DocumentDetail {
    pub document: Document,
    pub tags: Vec<Tag>,
    /// Extracted text, if any (bounded in size by the extraction).
    pub content: Option<String>,
}

pub fn detail(connection: &Connection, id: &str) -> AppResult<DocumentDetail> {
    Ok(DocumentDetail {
        document: documents::get(connection, id)?,
        tags: tags::list_for(connection, Tagged::Document(id))?,
        content: documents::content(connection, id)?,
    })
}

/// New place of a document: `None` for « without workspace ». A folder requires its workspace.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct DocumentLocation {
    pub workspace_id: Option<String>,
    pub folder_id: Option<String>,
}

pub fn rename(transaction: &Transaction<'_>, id: &str, title: &str) -> AppResult<Document> {
    documents::rename(transaction, id, title)
}

pub fn move_to(
    transaction: &Transaction<'_>,
    id: &str,
    location: &DocumentLocation,
) -> AppResult<Document> {
    validate_id(id, "document id")?;
    match (&location.workspace_id, &location.folder_id) {
        (None, Some(_)) => {
            return Err(AppError::InvalidInput(
                "a folder requires its workspace".to_owned(),
            ));
        }
        (Some(workspace_id), folder_id) => {
            workspaces::get(transaction, workspace_id)?;
            if let Some(folder_id) = folder_id
                && &folders::get(transaction, folder_id)?.workspace_id != workspace_id
            {
                return Err(AppError::InvalidInput(
                    "the folder belongs to another workspace".to_owned(),
                ));
            }
        }
        (None, None) => {}
    }
    let affected = transaction.execute(
        "UPDATE documents SET workspace_id = ?2, folder_id = ?3, updated_at = ?4 WHERE id = ?1",
        rusqlite::params![id, location.workspace_id, location.folder_id, now_ms()],
    )?;
    if affected != 1 {
        return Err(AppError::NotFound { entity: "document" });
    }
    documents::get(transaction, id)
}

fn record(
    transaction: &Transaction<'_>,
    event_type: TimelineEventType,
    document: &Document,
) -> AppResult<()> {
    timeline::record(
        transaction,
        &NewTimelineEvent {
            event_type,
            entity: (EntityKind::Document, &document.id),
            workspace_id: document.workspace_id.as_deref(),
            description: &document.title,
            metadata: serde_json::json!({}),
        },
    )?;
    Ok(())
}

pub fn set_favorite(
    transaction: &Transaction<'_>,
    id: &str,
    favorite: bool,
) -> AppResult<Document> {
    let before = documents::get(transaction, id)?;
    let document = documents::set_favorite(transaction, id, favorite)?;
    if favorite && !before.is_favorite {
        record(transaction, TimelineEventType::ResourceFavorited, &document)?;
    }
    Ok(document)
}

pub fn set_archived(
    transaction: &Transaction<'_>,
    id: &str,
    archived: bool,
) -> AppResult<Document> {
    let before = documents::get(transaction, id)?;
    let document = documents::set_archived(transaction, id, archived)?;
    if before.is_archived != archived {
        let event = if archived {
            TimelineEventType::ResourceArchived
        } else {
            TimelineEventType::ResourceRestored
        };
        record(transaction, event, &document)?;
    }
    Ok(document)
}

/// Replaces the tags of a document.
pub fn set_tags(
    transaction: &Transaction<'_>,
    id: &str,
    tag_ids: &[String],
) -> AppResult<Vec<Tag>> {
    documents::get(transaction, id)?;
    for tag in tags::list_for(transaction, Tagged::Document(id))? {
        if !tag_ids.contains(&tag.id) {
            tags::detach(transaction, &tag.id, Tagged::Document(id))?;
        }
    }
    for tag_id in tag_ids {
        tags::get(transaction, tag_id)?;
        tags::attach(transaction, tag_id, Tagged::Document(id))?;
    }
    tags::list_for(transaction, Tagged::Document(id))
}

pub fn mark_opened(transaction: &Transaction<'_>, id: &str) -> AppResult<()> {
    validate_id(id, "document id")?;
    transaction.execute(
        "UPDATE documents SET last_opened_at = ?2 WHERE id = ?1",
        rusqlite::params![id, now_ms()],
    )?;
    Ok(())
}

/// PDF documents whose text is still to be extracted by the interface, oldest first.
pub fn pending_extraction(connection: &Connection, limit: u32) -> AppResult<Vec<String>> {
    let mut statement = connection.prepare(
        "SELECT id FROM documents WHERE file_extension = 'pdf' AND indexing_status IN ('pending', 'processing')
         AND deleted_at IS NULL ORDER BY imported_at, id LIMIT ?1",
    )?;
    let ids = statement.query_map([limit.min(PAGE_MAX)], |row| row.get(0))?;
    Ok(ids.collect::<Result<_, _>>()?)
}

/// Result of a PDF text extraction, sent by the interface (pdf.js).
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
#[ts(export)]
pub enum PdfExtraction {
    Text {
        text: String,
        #[serde(rename = "pageCount")]
        #[ts(rename = "pageCount")]
        page_count: u32,
    },
    /// pdf.js could not read the file.
    Failed,
}

pub fn save_pdf_extraction(
    transaction: &Transaction<'_>,
    id: &str,
    extraction: PdfExtraction,
) -> AppResult<Document> {
    let document = documents::get(transaction, id)?;
    if FileKind::from_mime_type(&document.mime_type) != Some(FileKind::Pdf) {
        return Err(AppError::InvalidInput(
            "the document is not a PDF".to_owned(),
        ));
    }
    let mut metadata = document.metadata.as_object().cloned().unwrap_or_default();
    metadata.remove("extractionIssue");
    let (status, issue) = match extraction {
        PdfExtraction::Text { text, page_count } => {
            metadata.insert("pageCount".to_owned(), Value::from(page_count));
            let normalized = text.replace('\0', "");
            let (text, truncated) = truncate_utf8(normalized, CONTENT_MAX_BYTES);
            if text.trim().is_empty() {
                (
                    ProcessingStatus::Completed,
                    Some(ExtractionIssue::NoTextLayer),
                )
            } else {
                documents::set_content(transaction, id, &text, "pdfjs")?;
                (
                    ProcessingStatus::Completed,
                    truncated.then_some(ExtractionIssue::Truncated),
                )
            }
        }
        PdfExtraction::Failed => (ProcessingStatus::Failed, Some(ExtractionIssue::InvalidPdf)),
    };
    if let Some(issue) = issue {
        metadata.insert("extractionIssue".to_owned(), Value::from(issue.as_str()));
    }
    documents::set_processing_status(transaction, id, status)?;
    documents::set_metadata(transaction, id, &Value::Object(metadata))?;
    documents::get(transaction, id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;
    use crate::db::testing::open_temporary;
    use crate::repo::TokenColor;
    use crate::repo::documents::NewDocument;
    use crate::repo::workspaces::NewWorkspace;
    use crate::util::new_id;

    fn add(database: &Database, title: &str, extension: &str, workspace: Option<&str>) -> Document {
        let id = new_id();
        let kind = FileKind::from_extension(extension).expect("kind");
        let hash = hex::encode(<sha2::Sha256 as sha2::Digest>::digest(id.as_bytes()));
        database
            .write(|tx| {
                documents::insert(
                    tx,
                    &NewDocument {
                        stored_filename: format!("{id}.{extension}"),
                        id: id.clone(),
                        title: title.to_owned(),
                        original_filename: format!("{title}.{extension}"),
                        file_extension: extension.to_owned(),
                        mime_type: kind.mime_type().to_owned(),
                        file_size: i64::try_from(title.len()).expect("size") * 100,
                        content_hash: hash.clone(),
                        workspace_id: workspace.map(str::to_owned),
                        folder_id: None,
                        metadata: serde_json::json!({}),
                    },
                )
            })
            .expect("document")
    }

    fn query() -> DocumentQuery {
        DocumentQuery {
            search: None,
            workspace: None,
            folder_id: None,
            kinds: None,
            tag_id: None,
            favorites_only: false,
            state: DocumentState::Active,
            imported_after: None,
            updated_after: None,
            indexing: None,
            sort: DocumentSort::Title,
            descending: false,
            limit: 50,
            offset: 0,
        }
    }

    fn titles(page: &DocumentPage) -> Vec<&str> {
        page.items
            .iter()
            .map(|item| item.document.title.as_str())
            .collect()
    }

    #[test]
    fn search_ignores_case_and_accents_and_escapes_wildcards() {
        let (_dir, database) = open_temporary();
        add(&database, "Électricité générale", "pdf", None);
        add(&database, "Cours NE555", "docx", None);
        add(&database, "Taux_100%", "csv", None);
        let found = |search: &str| {
            database
                .read(|c| {
                    list(
                        c,
                        &DocumentQuery {
                            search: Some(search.to_owned()),
                            ..query()
                        },
                    )
                })
                .expect("list")
        };
        assert_eq!(titles(&found("ELECTRICITE")), ["Électricité générale"]);
        assert_eq!(titles(&found("ne555")), ["Cours NE555"]);
        assert_eq!(titles(&found("_100%")), ["Taux_100%"]);
        assert!(
            titles(&found("%")).len() == 1,
            "the % sign is not a wildcard"
        );
    }

    #[test]
    fn filters_sorting_and_pagination_combine() {
        let (_dir, database) = open_temporary();
        let workspace = database
            .write(|tx| {
                workspaces::create(
                    tx,
                    &NewWorkspace {
                        name: "Électronique".to_owned(),
                        description: None,
                        color: None,
                        icon: None,
                    },
                )
            })
            .expect("workspace");
        let a = add(&database, "Alpha", "pdf", Some(&workspace.id));
        add(&database, "Bravo", "docx", Some(&workspace.id));
        let c = add(&database, "Charlie long title", "pdf", None);
        database
            .write(|tx| {
                set_favorite(tx, &a.id, true)?;
                set_archived(tx, &c.id, true)?;
                Ok(())
            })
            .expect("flags");

        let in_workspace = database
            .read(|c| {
                list(
                    c,
                    &DocumentQuery {
                        workspace: Some(WorkspaceScope::Workspace {
                            id: workspace.id.clone(),
                        }),
                        sort: DocumentSort::Title,
                        descending: true,
                        ..query()
                    },
                )
            })
            .expect("list");
        assert_eq!(titles(&in_workspace), ["Bravo", "Alpha"]);
        assert_eq!(in_workspace.total, 2);

        let pdfs = database
            .read(|c| {
                list(
                    c,
                    &DocumentQuery {
                        kinds: Some(vec![FileKind::Pdf]),
                        ..query()
                    },
                )
            })
            .expect("list");
        assert_eq!(
            titles(&pdfs),
            ["Alpha"],
            "archived documents are not active"
        );

        let archived = database
            .read(|c| {
                list(
                    c,
                    &DocumentQuery {
                        state: DocumentState::Archived,
                        ..query()
                    },
                )
            })
            .expect("list");
        assert_eq!(titles(&archived), ["Charlie long title"]);

        let favorites = database
            .read(|c| {
                list(
                    c,
                    &DocumentQuery {
                        favorites_only: true,
                        ..query()
                    },
                )
            })
            .expect("list");
        assert_eq!(titles(&favorites), ["Alpha"]);

        let page = database
            .read(|c| {
                list(
                    c,
                    &DocumentQuery {
                        sort: DocumentSort::FileSize,
                        limit: 1,
                        offset: 1,
                        ..query()
                    },
                )
            })
            .expect("list");
        assert_eq!((titles(&page), page.total), (vec!["Bravo"], 2));
        assert!(
            database
                .read(|c| list(
                    c,
                    &DocumentQuery {
                        limit: 0,
                        ..query()
                    }
                ))
                .is_err()
        );
    }

    #[test]
    fn tags_moves_and_timeline_events() {
        let (_dir, database) = open_temporary();
        let document = add(&database, "Fiche", "pdf", None);
        let (workspace, folder, tag) = database
            .write(|tx| {
                let workspace = workspaces::create(
                    tx,
                    &NewWorkspace {
                        name: "Projets".to_owned(),
                        description: None,
                        color: None,
                        icon: None,
                    },
                )?;
                let folder = folders::create(tx, &workspace.id, None, "Fiches")?;
                let tag = tags::create(tx, "Composants", TokenColor::Blue)?;
                Ok((workspace, folder, tag))
            })
            .expect("setup");
        let moved = database
            .write(|tx| {
                move_to(
                    tx,
                    &document.id,
                    &DocumentLocation {
                        workspace_id: Some(workspace.id.clone()),
                        folder_id: Some(folder.id.clone()),
                    },
                )
            })
            .expect("move");
        assert_eq!(moved.folder_id.as_deref(), Some(folder.id.as_str()));
        assert!(
            database
                .write(|tx| move_to(
                    tx,
                    &document.id,
                    &DocumentLocation {
                        workspace_id: None,
                        folder_id: Some(folder.id.clone()),
                    },
                ))
                .is_err()
        );

        let tagged = database
            .write(|tx| set_tags(tx, &document.id, std::slice::from_ref(&tag.id)))
            .expect("tags");
        assert_eq!(tagged, std::slice::from_ref(&tag));
        let by_tag = database
            .read(|c| {
                list(
                    c,
                    &DocumentQuery {
                        tag_id: Some(tag.id.clone()),
                        ..query()
                    },
                )
            })
            .expect("list");
        assert_eq!(titles(&by_tag), ["Fiche"]);
        assert!(
            database
                .write(|tx| set_tags(tx, &document.id, &[]))
                .expect("clear")
                .is_empty()
        );

        database
            .write(|tx| {
                set_favorite(tx, &document.id, true)?;
                set_favorite(tx, &document.id, true)?;
                set_archived(tx, &document.id, true)?;
                set_archived(tx, &document.id, false)?;
                Ok(())
            })
            .expect("flags");
        let events: Vec<TimelineEventType> = database
            .read(|c| timeline::list(c, None, 10))
            .expect("timeline")
            .into_iter()
            .map(|event| event.event_type)
            .collect();
        assert_eq!(
            events,
            [
                TimelineEventType::ResourceRestored,
                TimelineEventType::ResourceArchived,
                TimelineEventType::ResourceFavorited
            ]
        );
    }

    #[test]
    fn pdf_text_extracted_by_the_interface_is_stored_and_bounded() {
        let (_dir, database) = open_temporary();
        let pdf = add(&database, "Fiche NE555", "pdf", None);
        let scan = add(&database, "Scan", "pdf", None);
        let text = add(&database, "Notes", "txt", None);
        assert_eq!(
            database
                .read(|c| pending_extraction(c, 10))
                .expect("pending"),
            vec![pdf.id.clone(), scan.id.clone()]
        );

        let saved = database
            .write(|tx| {
                save_pdf_extraction(
                    tx,
                    &pdf.id,
                    PdfExtraction::Text {
                        text: "Timer NE555\n\u{0}Brochage".to_owned(),
                        page_count: 12,
                    },
                )
            })
            .expect("save");
        assert_eq!(saved.indexing_status, ProcessingStatus::Completed);
        assert_eq!(saved.metadata["pageCount"], 12);
        assert_eq!(
            database
                .read(|c| documents::content(c, &pdf.id))
                .expect("content")
                .as_deref(),
            Some("Timer NE555\nBrochage")
        );

        let scanned = database
            .write(|tx| {
                save_pdf_extraction(
                    tx,
                    &scan.id,
                    PdfExtraction::Text {
                        text: "  \n ".to_owned(),
                        page_count: 3,
                    },
                )
            })
            .expect("save");
        assert_eq!(scanned.metadata["extractionIssue"], "no_text_layer");
        assert!(
            database
                .read(|c| pending_extraction(c, 10))
                .expect("pending")
                .is_empty()
        );
        assert!(
            database
                .write(|tx| save_pdf_extraction(tx, &text.id, PdfExtraction::Failed))
                .is_err(),
            "only PDF documents accept a PDF extraction"
        );
    }
}

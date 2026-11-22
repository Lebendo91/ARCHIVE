//! Notes (specification §8): filtered lists, content saved by revision, internal links and backlinks,
//! duplication, organisation, archiving, trash and permanent deletion.
//!
//! Internal links are ordinary links whose address is `archive://note/<id>` or `archive://document/<id>`: the
//! interface sends the targets of a note with each save, and the core keeps them as `links_to` relations, from
//! which the backlinks are read.

use rusqlite::types::ToSql;
use rusqlite::{Connection, OptionalExtension, Transaction, params, params_from_iter};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use ts_rs::TS;

use crate::error::{AppError, AppResult};
use crate::repo::EntityKind;
use crate::repo::notes::{self, CONTENT_MAX, Note, NoteContent, NoteFormat};
use crate::repo::relations::{self, NewRelation, RelationOrigin};
use crate::repo::tags::{self, Tag, Tagged};
use crate::repo::timeline::{self, NewTimelineEvent, TimelineEventType};
use crate::services::documents::{WorkspaceScope, check_location, like_pattern};
use crate::util::{now_ms, validate_id};

pub const PAGE_MAX: u32 = 200;
/// Most internal links a note can hold.
pub const LINKS_MAX: usize = 2_000;
/// A modification is recorded in the timeline at most once an hour per note: autosave would flood it.
const MODIFIED_EVENT_INTERVAL_MS: i64 = 60 * 60 * 1000;
const LINK_RELATION: &str = "links_to";
const EXCERPT_CHARS: i64 = 240;

/// Which notes a list shows.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum NoteState {
    Active,
    Archived,
    Trashed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum NoteSort {
    Title,
    CreatedAt,
    UpdatedAt,
    LastOpenedAt,
}

#[derive(Debug, Clone, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct NoteQuery {
    /// Matches the title or the text of the note, whatever the case and accents.
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
    pub tag_id: Option<String>,
    pub favorites_only: bool,
    /// Only notes opened at least once (« Recently opened »).
    pub opened_only: bool,
    pub state: NoteState,
    #[serde(default)]
    #[ts(optional)]
    pub updated_after: Option<i64>,
    pub sort: NoteSort,
    pub descending: bool,
    pub limit: u32,
    pub offset: u32,
}

/// A note without its content: lists never carry whole documents, only the beginning of their text.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct NoteSummary {
    pub id: String,
    pub title: String,
    pub excerpt: String,
    pub workspace_id: Option<String>,
    pub folder_id: Option<String>,
    pub is_favorite: bool,
    pub is_archived: bool,
    pub created_at: i64,
    pub updated_at: i64,
    pub last_opened_at: Option<i64>,
    pub deleted_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct NoteItem {
    pub note: NoteSummary,
    pub tags: Vec<Tag>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct NotePage {
    pub items: Vec<NoteItem>,
    /// Number of notes matching the query, all pages included.
    pub total: i64,
}

/// Kind of resource an internal link points to.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum LinkKind {
    Note,
    Document,
}

impl LinkKind {
    fn entity(self) -> EntityKind {
        match self {
            LinkKind::Note => EntityKind::Note,
            LinkKind::Document => EntityKind::Document,
        }
    }
}

/// Target of an internal link, as written in a note.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct LinkTarget {
    pub kind: LinkKind,
    pub id: String,
}

/// A resource a note links to, or a note that links here, with its current title.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct LinkedResource {
    pub kind: LinkKind,
    pub id: String,
    pub title: String,
    /// False while the resource is in the trash: it is named, but cannot be opened.
    pub available: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct NoteDetail {
    pub note: Note,
    pub tags: Vec<Tag>,
    /// Resources this note links to.
    pub links: Vec<LinkedResource>,
    /// Notes that link to this one (trash excluded).
    pub backlinks: Vec<LinkedResource>,
}

/// A new note: its first content, its place and its links.
#[derive(Debug, Clone, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct NewNote {
    pub content: NoteContent,
    #[serde(default)]
    #[ts(optional)]
    pub workspace_id: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub folder_id: Option<String>,
    #[serde(default)]
    pub links: Vec<LinkTarget>,
}

/// New place of a note: `None` for « without workspace ». A folder requires its workspace.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct NoteLocation {
    pub workspace_id: Option<String>,
    pub folder_id: Option<String>,
}

/// A TipTap document must be a JSON object of type `doc`; Markdown and plain text are kept as they are.
fn check_document(content: &NoteContent) -> AppResult<()> {
    if content.content_format != NoteFormat::TiptapJson {
        return Ok(());
    }
    let document: Value = serde_json::from_str(&content.content)
        .map_err(|_| AppError::InvalidInput("note content is not valid JSON".to_owned()))?;
    if document.get("type").and_then(Value::as_str) != Some("doc") {
        return Err(AppError::InvalidInput(
            "note content must be a TipTap document".to_owned(),
        ));
    }
    Ok(())
}

pub fn list(connection: &Connection, query: &NoteQuery) -> AppResult<NotePage> {
    if query.limit == 0 || query.limit > PAGE_MAX {
        return Err(AppError::InvalidInput(format!(
            "limit must be between 1 and {PAGE_MAX}"
        )));
    }
    let mut clauses: Vec<String> = Vec::new();
    let mut values: Vec<Box<dyn ToSql>> = Vec::new();
    clauses.push(
        match query.state {
            NoteState::Active => "n.deleted_at IS NULL AND n.is_archived = 0",
            NoteState::Archived => "n.deleted_at IS NULL AND n.is_archived = 1",
            NoteState::Trashed => "n.deleted_at IS NOT NULL",
        }
        .to_owned(),
    );
    if let Some(search) = query
        .search
        .as_deref()
        .filter(|text| !text.trim().is_empty())
    {
        clauses.push(
            "(archive_fold(n.title) LIKE ? ESCAPE '\\' OR archive_fold(n.content_text) LIKE ? ESCAPE '\\')"
                .to_owned(),
        );
        let pattern = like_pattern(search);
        values.push(Box::new(pattern.clone()));
        values.push(Box::new(pattern));
    }
    match &query.workspace {
        None => {}
        Some(WorkspaceScope::Unassigned) => clauses.push("n.workspace_id IS NULL".to_owned()),
        Some(WorkspaceScope::Workspace { id }) => {
            validate_id(id, "workspace id")?;
            clauses.push("n.workspace_id = ?".to_owned());
            values.push(Box::new(id.clone()));
        }
    }
    if let Some(folder_id) = &query.folder_id {
        validate_id(folder_id, "folder id")?;
        clauses.push("n.folder_id = ?".to_owned());
        values.push(Box::new(folder_id.clone()));
    }
    if let Some(tag_id) = &query.tag_id {
        validate_id(tag_id, "tag id")?;
        clauses.push(
            "EXISTS (SELECT 1 FROM note_tags t WHERE t.note_id = n.id AND t.tag_id = ?)".to_owned(),
        );
        values.push(Box::new(tag_id.clone()));
    }
    if query.favorites_only {
        clauses.push("n.is_favorite = 1".to_owned());
    }
    if query.opened_only {
        clauses.push("n.last_opened_at IS NOT NULL".to_owned());
    }
    if let Some(after) = query.updated_after {
        clauses.push("n.updated_at >= ?".to_owned());
        values.push(Box::new(after));
    }
    let filter = clauses.join(" AND ");
    let direction = if query.descending { "DESC" } else { "ASC" };
    let order = match query.sort {
        NoteSort::Title => format!("archive_fold(n.title) {direction}"),
        NoteSort::CreatedAt => format!("n.created_at {direction}"),
        NoteSort::UpdatedAt => format!("n.updated_at {direction}"),
        // Never opened notes come last, whatever the direction.
        NoteSort::LastOpenedAt => {
            format!("n.last_opened_at IS NULL, n.last_opened_at {direction}")
        }
    };

    let total: i64 = connection.query_row(
        &format!("SELECT count(*) FROM notes n WHERE {filter}"),
        params_from_iter(values.iter()),
        |row| row.get(0),
    )?;
    let mut statement = connection.prepare(&format!(
        "SELECT n.id, n.title, substr(n.content_text, 1, {EXCERPT_CHARS}), n.workspace_id, n.folder_id,
                n.is_favorite, n.is_archived, n.created_at, n.updated_at, n.last_opened_at, n.deleted_at
         FROM notes n WHERE {filter} ORDER BY {order}, n.id LIMIT ? OFFSET ?"
    ))?;
    values.push(Box::new(query.limit));
    values.push(Box::new(query.offset));
    let summaries: Vec<NoteSummary> = statement
        .query_map(params_from_iter(values.iter()), |row| {
            Ok(NoteSummary {
                id: row.get(0)?,
                title: row.get(1)?,
                excerpt: row.get(2)?,
                workspace_id: row.get(3)?,
                folder_id: row.get(4)?,
                is_favorite: row.get(5)?,
                is_archived: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
                last_opened_at: row.get(9)?,
                deleted_at: row.get(10)?,
            })
        })?
        .collect::<Result<_, _>>()?;
    let items = summaries
        .into_iter()
        .map(|note| {
            let tags = tags::list_for(connection, Tagged::Note(&note.id))?;
            Ok(NoteItem { note, tags })
        })
        .collect::<AppResult<_>>()?;
    Ok(NotePage { items, total })
}

/// Title and availability of a link target, or `None` if it no longer exists.
fn resource(
    connection: &Connection,
    kind: LinkKind,
    id: &str,
) -> AppResult<Option<LinkedResource>> {
    let sql = match kind {
        LinkKind::Note => "SELECT title, deleted_at IS NULL FROM notes WHERE id = ?1",
        LinkKind::Document => "SELECT title, deleted_at IS NULL FROM documents WHERE id = ?1",
    };
    Ok(connection
        .query_row(sql, [id], |row| {
            Ok(LinkedResource {
                kind,
                id: id.to_owned(),
                title: row.get(0)?,
                available: row.get(1)?,
            })
        })
        .optional()?)
}

/// Resources a note links to, in the order of their titles.
fn links_of(connection: &Connection, id: &str) -> AppResult<Vec<LinkedResource>> {
    let mut statement = connection.prepare(
        "SELECT target_type, target_id FROM relations
         WHERE source_type = 'note' AND source_id = ?1 AND relation_type = ?2",
    )?;
    let targets: Vec<(EntityKind, String)> = statement
        .query_map(params![id, LINK_RELATION], |row| {
            Ok((row.get(0)?, row.get(1)?))
        })?
        .collect::<Result<_, _>>()?;
    let mut links = Vec::new();
    for (kind, target) in targets {
        let kind = match kind {
            EntityKind::Note => LinkKind::Note,
            EntityKind::Document => LinkKind::Document,
            _ => continue,
        };
        if let Some(linked) = resource(connection, kind, &target)? {
            links.push(linked);
        }
    }
    links.sort_by_key(|linked| crate::util::fold_for_search(&linked.title));
    Ok(links)
}

/// Notes that link to a resource, trash excluded, in the order of their titles.
pub fn backlinks(
    connection: &Connection,
    kind: LinkKind,
    id: &str,
) -> AppResult<Vec<LinkedResource>> {
    let mut statement = connection.prepare(
        "SELECT n.id, n.title FROM relations r JOIN notes n ON n.id = r.source_id
         WHERE r.source_type = 'note' AND r.relation_type = ?1 AND r.target_type = ?2 AND r.target_id = ?3
           AND n.deleted_at IS NULL
         ORDER BY archive_fold(n.title), n.id",
    )?;
    let notes = statement
        .query_map(params![LINK_RELATION, kind.entity(), id], |row| {
            Ok(LinkedResource {
                kind: LinkKind::Note,
                id: row.get(0)?,
                title: row.get(1)?,
                available: true,
            })
        })?
        .collect::<Result<_, _>>()?;
    Ok(notes)
}

pub fn detail(connection: &Connection, id: &str) -> AppResult<NoteDetail> {
    Ok(NoteDetail {
        note: notes::get(connection, id)?,
        tags: tags::list_for(connection, Tagged::Note(id))?,
        links: links_of(connection, id)?,
        backlinks: backlinks(connection, LinkKind::Note, id)?,
    })
}

/// Replaces the internal links of a note. Targets that no longer exist, and links to the note itself, are
/// left out: the text keeps them, the relations do not.
fn set_links(transaction: &Transaction<'_>, id: &str, links: &[LinkTarget]) -> AppResult<()> {
    if links.len() > LINKS_MAX {
        return Err(AppError::InvalidInput(format!(
            "a note holds at most {LINKS_MAX} links"
        )));
    }
    transaction.execute(
        "DELETE FROM relations WHERE source_type = 'note' AND source_id = ?1 AND relation_type = ?2",
        params![id, LINK_RELATION],
    )?;
    let mut seen = std::collections::HashSet::new();
    for link in links {
        validate_id(&link.id, "link target id")?;
        if (link.kind == LinkKind::Note && link.id == id) || !seen.insert(link.clone()) {
            continue;
        }
        if resource(transaction, link.kind, &link.id)?.is_none() {
            continue;
        }
        relations::create(
            transaction,
            &NewRelation {
                source: (EntityKind::Note, id.to_owned()),
                target: (link.kind.entity(), link.id.clone()),
                relation_type: LINK_RELATION.to_owned(),
                origin: RelationOrigin::User,
                confidence: None,
                provenance: serde_json::json!({ "source": "note_link" }),
            },
        )?;
    }
    Ok(())
}

fn record(
    transaction: &Transaction<'_>,
    event_type: TimelineEventType,
    note: &Note,
) -> AppResult<()> {
    timeline::record(
        transaction,
        &NewTimelineEvent {
            event_type,
            entity: (EntityKind::Note, &note.id),
            workspace_id: note.workspace_id.as_deref(),
            description: &note.title,
            metadata: serde_json::json!({}),
        },
    )?;
    Ok(())
}

pub fn create(transaction: &Transaction<'_>, input: &NewNote) -> AppResult<Note> {
    check_document(&input.content)?;
    check_location(
        transaction,
        input.workspace_id.as_deref(),
        input.folder_id.as_deref(),
    )?;
    let note = notes::create(
        transaction,
        &input.content,
        input.workspace_id.as_deref(),
        input.folder_id.as_deref(),
    )?;
    set_links(transaction, &note.id, &input.links)?;
    record(transaction, TimelineEventType::NoteCreated, &note)?;
    Ok(note)
}

/// Saves a note edited from `revision`. A save based on an older revision is refused (`stale_revision`):
/// nothing is overwritten, and the interface decides with the user.
pub fn save(
    transaction: &Transaction<'_>,
    id: &str,
    revision: i64,
    content: &NoteContent,
    links: &[LinkTarget],
) -> AppResult<Note> {
    check_document(content)?;
    let note = notes::save(transaction, id, revision, content)?;
    set_links(transaction, id, links)?;
    let last_event: Option<i64> = transaction.query_row(
        "SELECT max(created_at) FROM timeline_events WHERE entity_type = 'note' AND entity_id = ?1",
        [id],
        |row| row.get(0),
    )?;
    if last_event.is_none_or(|at| now_ms() - at >= MODIFIED_EVENT_INTERVAL_MS) {
        record(transaction, TimelineEventType::NoteModified, &note)?;
    }
    Ok(note)
}

/// Renames a note without opening it: a new revision, the content unchanged.
pub fn rename(transaction: &Transaction<'_>, id: &str, title: &str) -> AppResult<Note> {
    let note = notes::get(transaction, id)?;
    let text: String = transaction.query_row(
        "SELECT content_text FROM notes WHERE id = ?1",
        [id],
        |row| row.get(0),
    )?;
    notes::save(
        transaction,
        id,
        note.revision,
        &NoteContent {
            title: title.to_owned(),
            content: note.content,
            content_format: note.content_format,
            content_text: text,
        },
    )
}

/// Copies a note under `title`: content, place, tags and links; never its backlinks, favorite or archive state.
pub fn duplicate(transaction: &Transaction<'_>, id: &str, title: &str) -> AppResult<Note> {
    let original = notes::get(transaction, id)?;
    if original.deleted_at.is_some() {
        return Err(AppError::InvalidInput(
            "a note in the trash cannot be duplicated".to_owned(),
        ));
    }
    let text: String = transaction.query_row(
        "SELECT content_text FROM notes WHERE id = ?1",
        [id],
        |row| row.get(0),
    )?;
    let links: Vec<LinkTarget> = links_of(transaction, id)?
        .into_iter()
        .map(|linked| LinkTarget {
            kind: linked.kind,
            id: linked.id,
        })
        .collect();
    let copy = create(
        transaction,
        &NewNote {
            content: NoteContent {
                title: title.to_owned(),
                content: original.content,
                content_format: original.content_format,
                content_text: text,
            },
            workspace_id: original.workspace_id,
            folder_id: original.folder_id,
            links,
        },
    )?;
    for tag in tags::list_for(transaction, Tagged::Note(id))? {
        tags::attach(transaction, &tag.id, Tagged::Note(&copy.id))?;
    }
    Ok(copy)
}

pub fn move_to(
    transaction: &Transaction<'_>,
    id: &str,
    location: &NoteLocation,
) -> AppResult<Note> {
    validate_id(id, "note id")?;
    check_location(
        transaction,
        location.workspace_id.as_deref(),
        location.folder_id.as_deref(),
    )?;
    let affected = transaction.execute(
        "UPDATE notes SET workspace_id = ?2, folder_id = ?3, updated_at = ?4 WHERE id = ?1",
        params![id, location.workspace_id, location.folder_id, now_ms()],
    )?;
    if affected != 1 {
        return Err(AppError::NotFound { entity: "note" });
    }
    notes::get(transaction, id)
}

pub fn set_favorite(transaction: &Transaction<'_>, id: &str, favorite: bool) -> AppResult<Note> {
    let before = notes::get(transaction, id)?;
    let note = notes::set_favorite(transaction, id, favorite)?;
    if favorite && !before.is_favorite {
        record(transaction, TimelineEventType::ResourceFavorited, &note)?;
    }
    Ok(note)
}

pub fn set_archived(transaction: &Transaction<'_>, id: &str, archived: bool) -> AppResult<Note> {
    let before = notes::get(transaction, id)?;
    let note = notes::set_archived(transaction, id, archived)?;
    if before.is_archived != archived {
        let event = if archived {
            TimelineEventType::ResourceArchived
        } else {
            TimelineEventType::ResourceRestored
        };
        record(transaction, event, &note)?;
    }
    Ok(note)
}

/// Replaces the tags of a note.
pub fn set_tags(
    transaction: &Transaction<'_>,
    id: &str,
    tag_ids: &[String],
) -> AppResult<Vec<Tag>> {
    notes::get(transaction, id)?;
    for tag in tags::list_for(transaction, Tagged::Note(id))? {
        if !tag_ids.contains(&tag.id) {
            tags::detach(transaction, &tag.id, Tagged::Note(id))?;
        }
    }
    for tag_id in tag_ids {
        tags::get(transaction, tag_id)?;
        tags::attach(transaction, tag_id, Tagged::Note(id))?;
    }
    tags::list_for(transaction, Tagged::Note(id))
}

pub fn mark_opened(transaction: &Transaction<'_>, id: &str) -> AppResult<()> {
    validate_id(id, "note id")?;
    transaction.execute(
        "UPDATE notes SET last_opened_at = ?2 WHERE id = ?1",
        params![id, now_ms()],
    )?;
    Ok(())
}

/// Checks the Markdown text of a note export.
pub fn check_markdown(markdown: &str) -> AppResult<()> {
    if markdown.len() > CONTENT_MAX {
        return Err(AppError::InvalidInput(
            "the exported note is too large".to_owned(),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;
    use crate::db::testing::open_temporary;
    use crate::repo::workspaces::{self, NewWorkspace};

    fn doc(text: &str) -> String {
        serde_json::json!({
            "type": "doc",
            "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": text }] }]
        })
        .to_string()
    }

    fn content(title: &str, text: &str) -> NoteContent {
        NoteContent {
            title: title.to_owned(),
            content: doc(text),
            content_format: NoteFormat::TiptapJson,
            content_text: text.to_owned(),
        }
    }

    fn new_note(database: &Database, title: &str, text: &str, links: Vec<LinkTarget>) -> Note {
        database
            .write(|tx| {
                create(
                    tx,
                    &NewNote {
                        content: content(title, text),
                        workspace_id: None,
                        folder_id: None,
                        links: links.clone(),
                    },
                )
            })
            .expect("note")
    }

    fn query() -> NoteQuery {
        NoteQuery {
            search: None,
            workspace: None,
            folder_id: None,
            tag_id: None,
            favorites_only: false,
            opened_only: false,
            state: NoteState::Active,
            updated_after: None,
            sort: NoteSort::UpdatedAt,
            descending: true,
            limit: 50,
            offset: 0,
        }
    }

    fn link(note: &Note) -> LinkTarget {
        LinkTarget {
            kind: LinkKind::Note,
            id: note.id.clone(),
        }
    }

    #[test]
    fn notes_are_created_saved_by_revision_and_listed_with_an_excerpt() {
        let (_dir, database) = open_temporary();
        let note = new_note(
            &database,
            "Lois de Kirchhoff",
            "La somme des courants est nulle.",
            vec![],
        );
        assert_eq!(note.revision, 1);

        let saved = database
            .write(|tx| {
                save(
                    tx,
                    &note.id,
                    1,
                    &content("Lois de Kirchhoff", "Loi des nœuds."),
                    &[],
                )
            })
            .expect("save");
        assert_eq!(saved.revision, 2);
        let stale = database.write(|tx| save(tx, &note.id, 1, &content("Ancien", "texte"), &[]));
        assert!(matches!(stale, Err(AppError::StaleRevision { .. })));
        assert_eq!(
            database
                .read(|c| notes::get(c, &note.id))
                .expect("get")
                .title,
            "Lois de Kirchhoff"
        );

        let page = database.read(|c| list(c, &query())).expect("list");
        assert_eq!(page.total, 1);
        assert_eq!(page.items[0].note.excerpt, "Loi des nœuds.");

        let events: Vec<String> = database
            .read(|c| {
                let mut statement = c.prepare(
                    "SELECT event_type FROM timeline_events WHERE entity_id = ?1 ORDER BY created_at",
                )?;
                let rows = statement.query_map([&note.id], |row| row.get(0))?;
                Ok(rows.collect::<Result<Vec<String>, _>>()?)
            })
            .expect("events");
        // A save right after the creation does not add a « modified » event: autosave would flood the timeline.
        assert_eq!(events, ["note_created"]);
    }

    #[test]
    fn invalid_documents_are_refused() {
        let (_dir, database) = open_temporary();
        let mut broken = content("Note", "texte");
        broken.content = "{\"type\":\"paragraph\"}".to_owned();
        let result = database.write(|tx| {
            create(
                tx,
                &NewNote {
                    content: broken.clone(),
                    workspace_id: None,
                    folder_id: None,
                    links: vec![],
                },
            )
        });
        assert!(matches!(result, Err(AppError::InvalidInput(_))));
        broken.content = "pas du JSON".to_owned();
        let result = database.write(|tx| {
            create(
                tx,
                &NewNote {
                    content: broken.clone(),
                    workspace_id: None,
                    folder_id: None,
                    links: vec![],
                },
            )
        });
        assert!(matches!(result, Err(AppError::InvalidInput(_))));
    }

    #[test]
    fn search_matches_title_and_text_whatever_the_case_and_accents() {
        let (_dir, database) = open_temporary();
        new_note(&database, "Électricité", "Loi d'Ohm", vec![]);
        new_note(&database, "Mécanique", "Les forces de frottement", vec![]);
        let mut by_title = query();
        by_title.search = Some("ELECTRICITE".to_owned());
        assert_eq!(
            database.read(|c| list(c, &by_title)).expect("list").total,
            1
        );
        let mut by_text = query();
        by_text.search = Some("frottement".to_owned());
        let page = database.read(|c| list(c, &by_text)).expect("list");
        assert_eq!(page.items[0].note.title, "Mécanique");
        let mut wildcard = query();
        wildcard.search = Some("%".to_owned());
        assert_eq!(
            database.read(|c| list(c, &wildcard)).expect("list").total,
            0
        );
    }

    #[test]
    fn links_give_backlinks_and_follow_the_trash() {
        let (_dir, database) = open_temporary();
        let target = new_note(&database, "Loi d'Ohm", "U = R × I", vec![]);
        let source = new_note(&database, "Circuits", "Voir la loi", vec![link(&target)]);
        let other = new_note(
            &database,
            "Résistances",
            "Voir aussi",
            vec![link(&target), link(&target)],
        );

        let detail = database
            .read(|c| super::detail(c, &target.id))
            .expect("detail");
        let names: Vec<_> = detail.backlinks.iter().map(|b| b.title.as_str()).collect();
        assert_eq!(names, ["Circuits", "Résistances"]);
        let source_detail = database
            .read(|c| super::detail(c, &source.id))
            .expect("detail");
        assert_eq!(source_detail.links.len(), 1);
        assert!(source_detail.links[0].available);

        // A note in the trash no longer counts as a backlink; its target shows as unavailable in its links.
        database
            .write(|tx| notes::trash(tx, &other.id))
            .expect("trash");
        database
            .write(|tx| notes::trash(tx, &target.id))
            .expect("trash");
        let detail = database
            .read(|c| super::detail(c, &target.id))
            .expect("detail");
        assert_eq!(detail.backlinks.len(), 1);
        let source_detail = database
            .read(|c| super::detail(c, &source.id))
            .expect("detail");
        assert!(!source_detail.links[0].available);

        // Saving replaces the links; a link to the note itself or to a missing note is left out.
        let source = database
            .read(|c| notes::get(c, &source.id))
            .expect("source");
        let missing = LinkTarget {
            kind: LinkKind::Note,
            id: crate::util::new_id(),
        };
        database
            .write(|tx| {
                save(
                    tx,
                    &source.id,
                    source.revision,
                    &content("Circuits", "Plus de lien"),
                    &[link(&source), missing.clone()],
                )
            })
            .expect("save");
        let source_detail = database
            .read(|c| super::detail(c, &source.id))
            .expect("detail");
        assert!(source_detail.links.is_empty());
    }

    #[test]
    fn duplicates_keep_content_place_tags_and_links_but_not_state() {
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
        let target = new_note(&database, "Loi d'Ohm", "U = R × I", vec![]);
        let original = database
            .write(|tx| {
                let note = create(
                    tx,
                    &NewNote {
                        content: content("Circuits", "Voir la loi"),
                        workspace_id: Some(workspace.id.clone()),
                        folder_id: None,
                        links: vec![link(&target)],
                    },
                )?;
                let tag = tags::create(tx, "Cours", crate::repo::TokenColor::Neutral)?;
                tags::attach(tx, &tag.id, Tagged::Note(&note.id))?;
                notes::set_favorite(tx, &note.id, true)
            })
            .expect("original");

        let copy = database
            .write(|tx| duplicate(tx, &original.id, "Circuits (copie)"))
            .expect("copy");
        assert_eq!(copy.title, "Circuits (copie)");
        assert_eq!(copy.content, original.content);
        assert_eq!(copy.workspace_id.as_deref(), Some(workspace.id.as_str()));
        assert!(!copy.is_favorite);
        let detail = database
            .read(|c| super::detail(c, &copy.id))
            .expect("detail");
        assert_eq!(detail.tags.len(), 1);
        assert_eq!(detail.links.len(), 1);
        let backlinks = database
            .read(|c| super::detail(c, &target.id))
            .expect("detail")
            .backlinks;
        assert_eq!(backlinks.len(), 2);
    }

    #[test]
    fn renaming_keeps_the_content_and_moving_checks_the_folder() {
        let (_dir, database) = open_temporary();
        let note = new_note(&database, "Brouillon", "Texte", vec![]);
        let renamed = database
            .write(|tx| rename(tx, &note.id, "  Lois de Kirchhoff  "))
            .expect("rename");
        assert_eq!(renamed.title, "Lois de Kirchhoff");
        assert_eq!(renamed.content, note.content);
        assert_eq!(renamed.revision, 2);

        let folder_without_workspace = database.write(|tx| {
            move_to(
                tx,
                &note.id,
                &NoteLocation {
                    workspace_id: None,
                    folder_id: Some(crate::util::new_id()),
                },
            )
        });
        assert!(matches!(
            folder_without_workspace,
            Err(AppError::InvalidInput(_))
        ));
    }
}

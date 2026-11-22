//! Search queries (specification §9.2, §9.3): the matches of the words typed, ranked by `bm25()` with a slight
//! advantage for favorites and recent items, filtered, paged, and returned with the words found highlighted
//! in their title and in an excerpt of their best passage. Without words, the filters alone list the items.

use std::collections::HashMap;

use rusqlite::types::Value;
use rusqlite::{Connection, params_from_iter};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::error::{AppError, AppResult};
use crate::repo::text_enum;
use crate::search::expression::ParsedQuery;
use crate::util::{now_ms, validate_id};

/// Most results in a page.
pub const PAGE_MAX: u32 = 100;
/// Longest query, in characters.
pub const QUERY_MAX: usize = 500;
/// Tokens of an excerpt around the words found.
const EXCERPT_TOKENS: i64 = 24;
/// Characters of the beginning of a text shown when no word of it was searched.
const PREVIEW_CHARS: i64 = 240;
const OPEN: char = '\u{E000}';
const CLOSE: char = '\u{E001}';
/// Weights of the columns in `bm25()`: entity_type, entity_id, page, title, body, tags, meta.
const WEIGHTS: &str = "0.0, 0.0, 0.0, 10.0, 1.0, 5.0, 2.0";
const DAY_MS: i64 = 24 * 60 * 60 * 1000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum SearchKind {
    Document,
    Note,
    Workspace,
    Tag,
}
text_enum!(SearchKind {
    Document => "document",
    Note => "note",
    Workspace => "workspace",
    Tag => "tag",
});

/// Date a filter applies to, and the date shown with a result.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum DateField {
    /// Added to ARCHIVE: imported for a document, created for anything else.
    Added,
    Updated,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum SearchSort {
    Relevance,
    Date,
}

#[derive(Debug, Clone, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct SearchRequest {
    /// The words searched, as typed: never interpreted as FTS5 syntax.
    pub text: String,
    /// Kinds of results returned (all if absent); the counts cover every kind.
    #[serde(default)]
    #[ts(optional)]
    pub kinds: Option<Vec<SearchKind>>,
    #[serde(default)]
    #[ts(optional)]
    pub workspace_id: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub tag_id: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub date_field: Option<DateField>,
    /// Start of the period (inclusive), in milliseconds since the epoch.
    #[serde(default)]
    #[ts(optional)]
    pub date_from: Option<i64>,
    /// End of the period (exclusive).
    #[serde(default)]
    #[ts(optional)]
    pub date_to: Option<i64>,
    pub favorites_only: bool,
    pub sort: SearchSort,
    pub limit: u32,
    pub offset: u32,
}

/// Part of a text, highlighted when it is a word found.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct TextSegment {
    pub text: String,
    pub matched: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SearchHit {
    pub kind: SearchKind,
    pub id: String,
    pub title: Vec<TextSegment>,
    /// The best passage around the words found, or the beginning of the text.
    pub excerpt: Vec<TextSegment>,
    /// Page of a PDF where the passage is, if known.
    pub page: Option<i64>,
    /// Tags of the item that the words found.
    pub matched_tags: Vec<String>,
    pub workspace_id: Option<String>,
    pub workspace_name: Option<String>,
    pub folder_name: Option<String>,
    /// Extension of a document (its format); `None` for the other kinds.
    pub file_extension: Option<String>,
    pub date: i64,
    pub date_field: DateField,
    pub is_favorite: bool,
    pub is_archived: bool,
    /// Found by part of its title only (« 555 » in « NE555 »), not by whole words.
    pub partial: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SearchCounts {
    pub documents: u32,
    pub notes: u32,
    pub workspaces: u32,
    pub tags: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SearchResults {
    pub hits: Vec<SearchHit>,
    /// Results of the kinds requested.
    pub total: u32,
    /// Results of each kind, whatever the kinds requested.
    pub counts: SearchCounts,
    /// The words searched, once common words were left out.
    pub words: Vec<String>,
}

/// How an item was found.
#[derive(Debug, Clone, Copy)]
struct Found {
    score: f64,
    /// Row of its best passage (word index) or of its title (trigram index).
    row_id: i64,
    page: Option<i64>,
    partial: bool,
}

/// What a result shows, and what filters apply to.
struct Facts {
    kind: SearchKind,
    id: String,
    title: String,
    workspace_id: Option<String>,
    workspace_name: Option<String>,
    folder_name: Option<String>,
    file_extension: Option<String>,
    date: i64,
    date_field: DateField,
    favorite: bool,
    archived: bool,
}

pub fn search(connection: &Connection, request: &SearchRequest) -> AppResult<SearchResults> {
    validate(request)?;
    let parsed = ParsedQuery::parse(&request.text);
    let expression = parsed.fts();
    let found = match &expression {
        Some(expression) => Some(matches(
            connection,
            expression,
            parsed.substrings().as_deref(),
        )?),
        None if has_filters(request) => None,
        None => {
            return Ok(SearchResults {
                hits: Vec::new(),
                total: 0,
                counts: SearchCounts::default(),
                words: parsed.words(),
            });
        }
    };

    // Every item found (or, without words, every item), with its facts, once the filters applied.
    let now = now_ms();
    let mut ranked: Vec<(Facts, Option<Found>)> = Vec::new();
    for kind in [
        SearchKind::Document,
        SearchKind::Note,
        SearchKind::Workspace,
        SearchKind::Tag,
    ] {
        let ids = match &found {
            Some(found) => {
                let ids: Vec<&str> = found
                    .keys()
                    .filter(|(found_kind, _)| *found_kind == kind)
                    .map(|(_, id)| id.as_str())
                    .collect();
                if ids.is_empty() {
                    continue;
                }
                Some(
                    serde_json::to_string(&ids)
                        .map_err(|error| AppError::Internal(error.to_string()))?,
                )
            }
            None => None,
        };
        for facts in facts(connection, kind, ids.as_deref(), request)? {
            let how = found
                .as_ref()
                .and_then(|found| found.get(&(kind, facts.id.clone())))
                .copied();
            ranked.push((facts, how));
        }
    }

    let mut counts = SearchCounts::default();
    for (facts, _) in &ranked {
        match facts.kind {
            SearchKind::Document => counts.documents += 1,
            SearchKind::Note => counts.notes += 1,
            SearchKind::Workspace => counts.workspaces += 1,
            SearchKind::Tag => counts.tags += 1,
        }
    }
    if let Some(kinds) = request.kinds.as_ref().filter(|kinds| !kinds.is_empty()) {
        ranked.retain(|(facts, _)| kinds.contains(&facts.kind));
    }
    let score = |facts: &Facts, how: Option<Found>| -> f64 {
        // bm25() is negative, better when lower: a favorite or a recent item weighs a little more.
        let mut factor = 1.0;
        if facts.favorite {
            factor += 0.2;
        }
        if now - facts.date < 30 * DAY_MS {
            factor += 0.1;
        }
        how.map_or(0.0, |how| how.score * factor)
    };
    match request.sort {
        SearchSort::Relevance => ranked.sort_by(|(a, how_a), (b, how_b)| {
            score(a, *how_a)
                .total_cmp(&score(b, *how_b))
                .then(b.date.cmp(&a.date))
                .then_with(|| a.title.cmp(&b.title))
        }),
        SearchSort::Date => ranked.sort_by(|(a, how_a), (b, how_b)| {
            b.date
                .cmp(&a.date)
                .then(score(a, *how_a).total_cmp(&score(b, *how_b)))
                .then_with(|| a.title.cmp(&b.title))
        }),
    }
    let total = u32::try_from(ranked.len()).unwrap_or(u32::MAX);
    let page: Vec<(Facts, Option<Found>)> = ranked
        .into_iter()
        .skip(request.offset as usize)
        .take(request.limit as usize)
        .collect();
    let hits = decorate(connection, expression.as_deref(), &parsed, page)?;
    Ok(SearchResults {
        hits,
        total,
        counts,
        words: parsed.words(),
    })
}

fn validate(request: &SearchRequest) -> AppResult<()> {
    if request.text.chars().count() > QUERY_MAX {
        return Err(AppError::InvalidInput(format!(
            "a search holds {QUERY_MAX} characters at most"
        )));
    }
    if request.limit == 0 || request.limit > PAGE_MAX {
        return Err(AppError::InvalidInput(format!(
            "a page holds 1 to {PAGE_MAX} results"
        )));
    }
    if let Some(id) = &request.workspace_id {
        validate_id(id, "workspace id")?;
    }
    if let Some(id) = &request.tag_id {
        validate_id(id, "tag id")?;
    }
    if let (Some(from), Some(to)) = (request.date_from, request.date_to)
        && from >= to
    {
        return Err(AppError::InvalidInput(
            "the period ends before it starts".to_owned(),
        ));
    }
    Ok(())
}

fn has_filters(request: &SearchRequest) -> bool {
    request.workspace_id.is_some()
        || request.tag_id.is_some()
        || request.date_from.is_some()
        || request.date_to.is_some()
        || request.favorites_only
        || request
            .kinds
            .as_ref()
            .is_some_and(|kinds| !kinds.is_empty())
}

/// Items whose indexed text holds every word (best passage of each), then those whose title merely contains
/// the words typed, which come after them.
fn matches(
    connection: &Connection,
    expression: &str,
    substrings: Option<&str>,
) -> AppResult<HashMap<(SearchKind, String), Found>> {
    let mut found: HashMap<(SearchKind, String), Found> = HashMap::new();
    // bm25() only works in the full-text query itself: its rows are materialized before being grouped.
    let mut statement = connection.prepare_cached(&format!(
        "WITH hits AS MATERIALIZED (
           SELECT entity_type, entity_id, rowid AS row_id, page, bm25(search_index, {WEIGHTS}) AS score
           FROM search_index WHERE search_index MATCH ?1
         )
         SELECT entity_type, entity_id, row_id, page, min(score) FROM hits GROUP BY entity_type, entity_id"
    ))?;
    let rows = statement.query_map([expression], |row| {
        Ok((
            row.get::<_, SearchKind>(0)?,
            row.get::<_, String>(1)?,
            Found {
                row_id: row.get(2)?,
                page: row.get(3)?,
                score: row.get(4)?,
                partial: false,
            },
        ))
    })?;
    for row in rows {
        let (kind, id, how) = row?;
        found.insert((kind, id), how);
    }
    if let Some(substrings) = substrings {
        let mut statement = connection.prepare_cached(
            "SELECT entity_type, entity_id, min(rowid) FROM search_titles WHERE search_titles MATCH ?1
             GROUP BY entity_type, entity_id",
        )?;
        let rows = statement.query_map([substrings], |row| {
            Ok((
                row.get::<_, SearchKind>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
            ))
        })?;
        for row in rows {
            let (kind, id, row_id) = row?;
            found.entry((kind, id)).or_insert(Found {
                score: 0.0,
                row_id,
                page: None,
                partial: true,
            });
        }
    }
    Ok(found)
}

/// Facts of the items of a kind (all of them, or those of `ids`, a JSON array), once the filters applied.
/// Items in the trash are never results.
fn facts(
    connection: &Connection,
    kind: SearchKind,
    ids: Option<&str>,
    request: &SearchRequest,
) -> AppResult<Vec<Facts>> {
    let updated = request.date_field == Some(DateField::Updated);
    let (sql, date_column) = match kind {
        SearchKind::Document => (
            "SELECT d.id, d.title, d.workspace_id, w.name, f.name, d.file_extension, d.imported_at, d.updated_at,
                    d.is_favorite, d.is_archived
             FROM documents d LEFT JOIN workspaces w ON w.id = d.workspace_id
             LEFT JOIN folders f ON f.id = d.folder_id
             WHERE d.deleted_at IS NULL",
            if updated { "d.updated_at" } else { "d.imported_at" },
        ),
        SearchKind::Note => (
            "SELECT d.id, d.title, d.workspace_id, w.name, f.name, NULL, d.created_at, d.updated_at,
                    d.is_favorite, d.is_archived
             FROM notes d LEFT JOIN workspaces w ON w.id = d.workspace_id
             LEFT JOIN folders f ON f.id = d.folder_id
             WHERE d.deleted_at IS NULL",
            if updated { "d.updated_at" } else { "d.created_at" },
        ),
        SearchKind::Workspace => {
            // A workspace has no tag and is no favorite; searching inside one does not list it.
            if request.tag_id.is_some() || request.favorites_only || request.workspace_id.is_some() {
                return Ok(Vec::new());
            }
            (
                "SELECT d.id, d.name, NULL, NULL, NULL, NULL, d.created_at, d.updated_at, 0, d.is_archived
                 FROM workspaces d WHERE 1 = 1",
                if updated { "d.updated_at" } else { "d.created_at" },
            )
        }
        SearchKind::Tag => {
            if request.tag_id.is_some() || request.favorites_only || request.workspace_id.is_some() {
                return Ok(Vec::new());
            }
            (
                "SELECT d.id, d.name, NULL, NULL, NULL, NULL, d.created_at, d.created_at, 0, 0
                 FROM tags d WHERE 1 = 1",
                "d.created_at",
            )
        }
    };
    let mut sql = sql.to_owned();
    let mut values: Vec<Value> = Vec::new();
    if let Some(ids) = ids {
        values.push(Value::Text(ids.to_owned()));
        sql.push_str(&format!(
            " AND d.id IN (SELECT value FROM json_each(?{}))",
            values.len()
        ));
    }
    if let Some(workspace_id) = &request.workspace_id {
        values.push(Value::Text(workspace_id.clone()));
        sql.push_str(&format!(" AND d.workspace_id = ?{}", values.len()));
    }
    if let Some(tag_id) = &request.tag_id {
        values.push(Value::Text(tag_id.clone()));
        let (table, column) = match kind {
            SearchKind::Note => ("note_tags", "note_id"),
            _ => ("document_tags", "document_id"),
        };
        sql.push_str(&format!(
            " AND EXISTS (SELECT 1 FROM {table} x WHERE x.{column} = d.id AND x.tag_id = ?{})",
            values.len()
        ));
    }
    if request.favorites_only {
        sql.push_str(" AND d.is_favorite = 1");
    }
    if let Some(from) = request.date_from {
        values.push(Value::Integer(from));
        sql.push_str(&format!(" AND {date_column} >= ?{}", values.len()));
    }
    if let Some(to) = request.date_to {
        values.push(Value::Integer(to));
        sql.push_str(&format!(" AND {date_column} < ?{}", values.len()));
    }
    let mut statement = connection.prepare(&sql)?;
    let rows = statement.query_map(params_from_iter(values), |row| {
        let added: i64 = row.get(6)?;
        let changed: i64 = row.get(7)?;
        // A note shows when it was last written; anything else when it was added, unless the filter is about
        // changes.
        let shows_update = updated || kind == SearchKind::Note;
        Ok(Facts {
            kind,
            id: row.get(0)?,
            title: row.get(1)?,
            workspace_id: row.get(2)?,
            workspace_name: row.get(3)?,
            folder_name: row.get(4)?,
            file_extension: row.get(5)?,
            date: if shows_update { changed } else { added },
            date_field: if shows_update {
                DateField::Updated
            } else {
                DateField::Added
            },
            favorite: row.get(8)?,
            archived: row.get(9)?,
        })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// The results of a page, with their highlighted title and excerpt.
fn decorate(
    connection: &Connection,
    expression: Option<&str>,
    parsed: &ParsedQuery,
    page: Vec<(Facts, Option<Found>)>,
) -> AppResult<Vec<SearchHit>> {
    // Highlights of the passages found by whole words.
    let passages: Vec<i64> = page
        .iter()
        .filter_map(|(_, how)| how.filter(|how| !how.partial).map(|how| how.row_id))
        .collect();
    let mut highlighted: HashMap<i64, (String, String, String)> = HashMap::new();
    if let (Some(expression), false) = (expression, passages.is_empty()) {
        let mut statement = connection.prepare_cached(
            "SELECT rowid, highlight(search_index, 3, ?2, ?3), snippet(search_index, 4, ?2, ?3, '…', ?4),
                    highlight(search_index, 5, ?2, ?3)
             FROM search_index WHERE search_index MATCH ?1 AND rowid IN (SELECT value FROM json_each(?5))",
        )?;
        let rows = statement.query_map(
            rusqlite::params![
                expression,
                OPEN.to_string(),
                CLOSE.to_string(),
                EXCERPT_TOKENS,
                serde_json::to_string(&passages)
                    .map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))?
            ],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    (row.get(1)?, row.get(2)?, row.get(3)?),
                ))
            },
        )?;
        for row in rows {
            let (row_id, texts) = row?;
            highlighted.insert(row_id, texts);
        }
    }
    // Titles found by part of a word.
    let titles: Vec<i64> = page
        .iter()
        .filter_map(|(_, how)| how.filter(|how| how.partial).map(|how| how.row_id))
        .collect();
    let mut partial_titles: HashMap<i64, String> = HashMap::new();
    if let (Some(substrings), false) = (parsed.substrings(), titles.is_empty()) {
        let mut statement = connection.prepare_cached(
            "SELECT rowid, highlight(search_titles, 2, ?2, ?3) FROM search_titles
             WHERE search_titles MATCH ?1 AND rowid IN (SELECT value FROM json_each(?4))",
        )?;
        let rows = statement.query_map(
            rusqlite::params![
                substrings,
                OPEN.to_string(),
                CLOSE.to_string(),
                serde_json::to_string(&titles)
                    .map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))?
            ],
            |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)),
        )?;
        for row in rows {
            let (row_id, title) = row?;
            // The title is the first line; a document's original file name follows it.
            partial_titles.insert(row_id, title.lines().next().unwrap_or_default().to_owned());
        }
    }

    let mut hits = Vec::with_capacity(page.len());
    for (facts, how) in page {
        let mut title = vec![TextSegment {
            text: facts.title.clone(),
            matched: false,
        }];
        let mut excerpt = Vec::new();
        let mut matched_tags = Vec::new();
        let mut page_number = None;
        match how {
            Some(how) if !how.partial => {
                page_number = how.page;
                if let Some((marked_title, marked_body, marked_tags)) = highlighted.get(&how.row_id)
                {
                    title = segments(marked_title);
                    excerpt = segments(marked_body);
                    matched_tags = marked_tags
                        .lines()
                        .filter(|tag| tag.contains(OPEN))
                        .map(|tag| tag.replace([OPEN, CLOSE], ""))
                        .collect();
                }
            }
            Some(how) => {
                if let Some(marked) = partial_titles.get(&how.row_id) {
                    title = segments(marked);
                }
            }
            None => {}
        }
        if excerpt.iter().all(|segment| segment.text.trim().is_empty()) {
            excerpt = beginning(connection, facts.kind, &facts.id)?;
        }
        hits.push(SearchHit {
            kind: facts.kind,
            id: facts.id,
            title,
            excerpt,
            page: page_number,
            matched_tags,
            workspace_id: facts.workspace_id,
            workspace_name: facts.workspace_name,
            folder_name: facts.folder_name,
            file_extension: facts.file_extension,
            date: facts.date,
            date_field: facts.date_field,
            is_favorite: facts.favorite,
            is_archived: facts.archived,
            partial: how.is_some_and(|how| how.partial),
        });
    }
    Ok(hits)
}

/// The beginning of the text of an item, when no passage of it was found by its words.
fn beginning(connection: &Connection, kind: SearchKind, id: &str) -> AppResult<Vec<TextSegment>> {
    let sql = match kind {
        SearchKind::Document => {
            "SELECT substr(content_text, 1, ?2) FROM document_contents WHERE document_id = ?1"
        }
        SearchKind::Note => "SELECT substr(content_text, 1, ?2) FROM notes WHERE id = ?1",
        SearchKind::Workspace => "SELECT substr(description, 1, ?2) FROM workspaces WHERE id = ?1",
        SearchKind::Tag => return Ok(Vec::new()),
    };
    let text: Option<String> = connection
        .prepare_cached(sql)?
        .query_row(rusqlite::params![id, PREVIEW_CHARS], |row| row.get(0))
        .ok();
    let text = tidy(&text.unwrap_or_default());
    Ok(if text.is_empty() {
        Vec::new()
    } else {
        vec![TextSegment {
            text,
            matched: false,
        }]
    })
}

/// Splits a text marked by `highlight()` or `snippet()` into plain and highlighted parts.
fn segments(marked: &str) -> Vec<TextSegment> {
    let mut parts = Vec::new();
    let mut current = String::new();
    let mut matched = false;
    for character in marked.chars() {
        if character == OPEN || character == CLOSE {
            if !current.is_empty() {
                parts.push(TextSegment {
                    text: std::mem::take(&mut current),
                    matched,
                });
            }
            matched = character == OPEN;
        } else {
            current.push(character);
        }
    }
    if !current.is_empty() {
        parts.push(TextSegment {
            text: current,
            matched,
        });
    }
    // Line and page breaks of the text become spaces in a one-line excerpt.
    let mut tidy_parts: Vec<TextSegment> = Vec::with_capacity(parts.len());
    for part in parts {
        let text = collapse(&part.text);
        if !text.is_empty() {
            tidy_parts.push(TextSegment {
                text,
                matched: part.matched,
            });
        }
    }
    tidy_parts
}

/// Whitespace runs (line and page breaks included) as single spaces, keeping the spaces at the edges so that
/// adjacent segments stay apart.
fn collapse(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut space = false;
    for character in text.chars() {
        if character.is_whitespace() {
            space = true;
        } else {
            if space {
                out.push(' ');
                space = false;
            }
            out.push(character);
        }
    }
    if space {
        out.push(' ');
    }
    out
}

fn tidy(text: &str) -> String {
    collapse(text).trim().to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn highlights_become_segments_on_one_line() {
        let marked = format!("Le {OPEN}NE555{CLOSE} en\nmode {OPEN}astable{CLOSE}\u{000C}page");
        assert_eq!(
            segments(&marked),
            vec![
                TextSegment {
                    text: "Le ".to_owned(),
                    matched: false
                },
                TextSegment {
                    text: "NE555".to_owned(),
                    matched: true
                },
                TextSegment {
                    text: " en mode ".to_owned(),
                    matched: false
                },
                TextSegment {
                    text: "astable".to_owned(),
                    matched: true
                },
                TextSegment {
                    text: " page".to_owned(),
                    matched: false
                },
            ]
        );
    }
}

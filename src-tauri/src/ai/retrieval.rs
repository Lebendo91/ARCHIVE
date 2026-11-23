//! The passages of the knowledge base sent with a question (specification §14.4): only from what the user chose
//! to share (documents and notes, or a workspace), the most relevant first, within a budget the user sets.
//! Nothing is ever sent from outside that choice, and the user sees the list before and after sending.

use std::collections::{HashMap, HashSet};

use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::error::{AppError, AppResult};
use crate::memory::ItemKind;
use crate::memory::analysis::words;
use crate::util::{fold_for_search, validate_id};

/// Items chosen one by one, at most.
pub const SCOPE_ITEMS_MAX: usize = 50;
/// Words of the question looked up in the index.
const TERMS_MAX: usize = 24;
/// Passages of one item at most, so that several items can answer.
const PASSAGES_PER_ITEM: usize = 3;
/// Characters of a passage sent at most: a window around the words of the question.
const PASSAGE_MAX_CHARS: usize = 1_600;
const EXCERPT_CHARS: usize = 280;
/// Ranked passages examined at most.
const CANDIDATES_MAX: i64 = 400;

/// A document or a note.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct ItemRef {
    pub kind: ItemKind,
    pub id: String,
}

/// What the user chose to share with the provider.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct AssistantScope {
    #[serde(default)]
    pub items: Vec<ItemRef>,
    #[serde(default)]
    pub workspace_id: Option<String>,
}

impl AssistantScope {
    pub fn is_empty(&self) -> bool {
        self.items.is_empty() && self.workspace_id.is_none()
    }

    pub fn check(&self) -> AppResult<()> {
        if self.items.len() > SCOPE_ITEMS_MAX {
            return Err(AppError::InvalidInput(format!(
                "at most {SCOPE_ITEMS_MAX} documents and notes can be shared at once"
            )));
        }
        for item in &self.items {
            validate_id(&item.id, "item")?;
        }
        if let Some(workspace) = &self.workspace_id {
            validate_id(workspace, "workspace")?;
        }
        Ok(())
    }
}

/// How much of the knowledge base goes with each question (a privacy preference, specification §15.4).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum ContextSize {
    Compact,
    #[default]
    Standard,
    Extended,
}

impl ContextSize {
    /// Passages and characters sent at most.
    pub fn budget(self) -> (usize, usize) {
        match self {
            Self::Compact => (4, 5_000),
            Self::Standard => (8, 12_000),
            Self::Extended => (16, 30_000),
        }
    }
}

/// A passage sent with a question. Only its reference and a short excerpt are kept with the answer.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SourcePassage {
    /// Number of the source in the answer: `[S1]`, `[S2]`…
    pub index: u32,
    pub kind: ItemKind,
    pub id: String,
    pub title: String,
    /// Page of a PDF document.
    #[ts(type = "number | null")]
    pub page: Option<i64>,
    pub excerpt: String,
    /// Characters sent.
    pub chars: u32,
    /// The text sent: never stored, never returned to the interface.
    #[serde(skip)]
    #[ts(skip)]
    pub text: String,
}

/// The items the scope covers, still in the knowledge base (not in the trash).
fn allowed(
    connection: &Connection,
    scope: &AssistantScope,
) -> AppResult<HashSet<(ItemKind, String)>> {
    let mut allowed = HashSet::new();
    let live = |kind: ItemKind, id: &str| -> AppResult<bool> {
        let table = match kind {
            ItemKind::Document => "documents",
            ItemKind::Note => "notes",
        };
        Ok(connection
            .query_row(
                &format!("SELECT 1 FROM {table} WHERE id = ?1 AND deleted_at IS NULL"),
                [id],
                |_| Ok(()),
            )
            .optional()?
            .is_some())
    };
    for item in &scope.items {
        if live(item.kind, &item.id)? {
            allowed.insert((item.kind, item.id.clone()));
        }
    }
    if let Some(workspace) = &scope.workspace_id {
        for (kind, table) in [(ItemKind::Document, "documents"), (ItemKind::Note, "notes")] {
            let mut statement = connection.prepare(&format!(
                "SELECT id FROM {table} WHERE workspace_id = ?1 AND deleted_at IS NULL"
            ))?;
            for id in statement.query_map([workspace], |row| row.get::<_, String>(0))? {
                allowed.insert((kind, id?));
            }
        }
    }
    Ok(allowed)
}

/// The folded words of a question worth looking up, each once.
pub fn terms(question: &str) -> Vec<String> {
    let mut seen = HashSet::new();
    words(question)
        .map(|(folded, _)| folded)
        .filter(|folded| seen.insert(folded.clone()))
        .take(TERMS_MAX)
        .collect()
}

/// A window of the passage around the first word of the question it holds, cut at word boundaries.
fn window(body: &str, terms: &[String], max_chars: usize) -> String {
    let body = body.trim();
    if body.chars().count() <= max_chars {
        return body.to_owned();
    }
    // Byte offset of the first word of the question in the text.
    let anchor = body
        .split(|character: char| !character.is_alphanumeric())
        .find(|word| !word.is_empty() && terms.contains(&fold_for_search(word)))
        .map_or(0, |word| word.as_ptr() as usize - body.as_ptr() as usize);
    // Start a little before the word, so that the sentence holding it is there, at the start of a word.
    let before: usize = body[..anchor]
        .chars()
        .rev()
        .take(max_chars / 5)
        .map(char::len_utf8)
        .sum();
    let mut start = anchor - before;
    if start > 0
        && let Some((space, character)) = body[start..]
            .char_indices()
            .find(|(_, character)| character.is_whitespace())
        && start + space + character.len_utf8() <= anchor
    {
        start += space + character.len_utf8();
    }
    let text: String = body[start..].chars().take(max_chars).collect();
    let text = match text.rfind(char::is_whitespace) {
        Some(end) if end > text.len() / 2 && start + text.len() < body.len() => &text[..end],
        _ => text.as_str(),
    };
    let mut result = String::new();
    if start > 0 {
        result.push('…');
    }
    result.push_str(text.trim());
    if start + text.len() < body.len() {
        result.push('…');
    }
    result
}

fn excerpt(text: &str) -> String {
    let text: String = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if text.chars().count() <= EXCERPT_CHARS {
        return text;
    }
    let cut: String = text.chars().take(EXCERPT_CHARS).collect();
    let cut = cut.rfind(' ').map_or(cut.as_str(), |end| &cut[..end]);
    format!("{cut}…")
}

struct Candidate {
    kind: ItemKind,
    id: String,
    page: Option<i64>,
    title: String,
    body: String,
}

fn candidate(row: &rusqlite::Row<'_>) -> rusqlite::Result<Option<Candidate>> {
    let kind: String = row.get(0)?;
    let Some(kind) = (match kind.as_str() {
        "document" => Some(ItemKind::Document),
        "note" => Some(ItemKind::Note),
        _ => None,
    }) else {
        return Ok(None);
    };
    Ok(Some(Candidate {
        kind,
        id: row.get(1)?,
        page: row.get(2)?,
        title: row.get(3)?,
        body: row.get(4)?,
    }))
}

/// The passages to send with a question, numbered from S1, the most relevant first.
pub fn passages(
    connection: &Connection,
    scope: &AssistantScope,
    question: &str,
    size: ContextSize,
) -> AppResult<Vec<SourcePassage>> {
    scope.check()?;
    if scope.is_empty() {
        return Ok(Vec::new());
    }
    let allowed = allowed(connection, scope)?;
    if allowed.is_empty() {
        return Ok(Vec::new());
    }
    let (passages_max, chars_max) = size.budget();
    let terms = terms(question);
    let mut chosen: Vec<SourcePassage> = Vec::new();
    let mut per_item: HashMap<(ItemKind, String), usize> = HashMap::new();
    let mut used = 0;
    let mut take = |candidate: Candidate, chosen: &mut Vec<SourcePassage>| -> bool {
        if chosen.len() >= passages_max || used >= chars_max {
            return false;
        }
        let key = (candidate.kind, candidate.id.clone());
        let count = per_item.entry(key).or_default();
        if *count >= PASSAGES_PER_ITEM {
            return true;
        }
        // Two characters of the room go to the ellipses of a window.
        let room = (chars_max - used).min(PASSAGE_MAX_CHARS);
        if room < 200 {
            return false;
        }
        let text = window(&candidate.body, &terms, room - 2);
        if text.is_empty() {
            return true;
        }
        let chars = text.chars().count();
        used += chars;
        *count += 1;
        chosen.push(SourcePassage {
            index: 0,
            kind: candidate.kind,
            id: candidate.id,
            title: candidate.title,
            page: candidate.page,
            excerpt: excerpt(&text),
            chars: u32::try_from(chars).unwrap_or(u32::MAX),
            text,
        });
        true
    };

    // The first passage of an item: its beginning.
    let mut first_passage = connection.prepare(
        "SELECT entity_type, entity_id, page, title, body FROM search_index WHERE rowid = (
           SELECT min(row_id) FROM search_entries
           WHERE entity_type = ?1 AND entity_id = ?2 AND index_name = 'text')",
    )?;
    let mut beginning = |kind: ItemKind, id: &str| -> AppResult<Option<Candidate>> {
        let kind = match kind {
            ItemKind::Document => "document",
            ItemKind::Note => "note",
        };
        Ok(first_passage
            .query_row(params![kind, id], candidate)
            .optional()?
            .flatten())
    };
    let represented = |chosen: &[SourcePassage], kind: ItemKind, id: &str| {
        chosen
            .iter()
            .any(|passage| passage.kind == kind && passage.id == id)
    };

    if !terms.is_empty() {
        // Quoted words joined by OR: nothing of the question is read as FTS5 syntax.
        let words = terms
            .iter()
            .map(|term| format!("\"{}\"", term.replace('"', "\"\"")))
            .collect::<Vec<_>>()
            .join(" OR ");
        // The title is repeated on every passage: the passages are ranked on their own text first.
        let mut statement = connection.prepare(
            "SELECT entity_type, entity_id, page, title, body FROM search_index
             WHERE search_index MATCH ?1 AND entity_type IN ('document', 'note')
             ORDER BY bm25(search_index, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0), rowid
             LIMIT ?2",
        )?;
        let rows = statement.query_map(
            params![format!("body : ({words})"), CANDIDATES_MAX],
            candidate,
        )?;
        let mut full = false;
        for row in rows {
            let Some(candidate) = row? else { continue };
            if !allowed.contains(&(candidate.kind, candidate.id.clone())) {
                continue;
            }
            if !take(candidate, &mut chosen) {
                full = true;
                break;
            }
        }
        // Items whose title names the words of the question come with their beginning.
        if !full {
            let mut statement = connection.prepare(
                "SELECT entity_type, entity_id FROM search_index
                 WHERE search_index MATCH ?1 AND entity_type IN ('document', 'note')
                 ORDER BY bm25(search_index, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0), rowid
                 LIMIT ?2",
            )?;
            let titled: Vec<(String, String)> = statement
                .query_map(
                    params![format!("title : ({words})"), CANDIDATES_MAX],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )?
                .collect::<Result<_, _>>()?;
            for (kind, id) in titled {
                let kind = if kind == "document" {
                    ItemKind::Document
                } else {
                    ItemKind::Note
                };
                if !allowed.contains(&(kind, id.clone())) || represented(&chosen, kind, &id) {
                    continue;
                }
                let Some(candidate) = beginning(kind, &id)? else {
                    continue;
                };
                if !take(candidate, &mut chosen) {
                    break;
                }
            }
        }
    }

    // Items chosen one by one always come with their beginning, even when the question names none of their
    // words (« Summarize this document »).
    for item in &scope.items {
        if !allowed.contains(&(item.kind, item.id.clone()))
            || represented(&chosen, item.kind, &item.id)
        {
            continue;
        }
        let Some(candidate) = beginning(item.kind, &item.id)? else {
            continue;
        };
        if !take(candidate, &mut chosen) {
            break;
        }
    }

    for (position, passage) in chosen.iter_mut().enumerate() {
        passage.index = u32::try_from(position + 1).unwrap_or(u32::MAX);
    }
    Ok(chosen)
}

#[cfg(test)]
mod tests {
    use rusqlite::Transaction;

    use super::*;
    use crate::db::testing::open_temporary;
    use crate::repo::documents::{self, NewDocument};
    use crate::repo::notes::{self, NoteContent, NoteFormat};
    use crate::repo::workspaces::{self, NewWorkspace};
    use crate::search::index::PAGE_BREAK;
    use crate::util::new_id;

    fn document(
        transaction: &Transaction<'_>,
        title: &str,
        text: &str,
        workspace: Option<&str>,
    ) -> AppResult<String> {
        let id = new_id();
        documents::insert(
            transaction,
            &NewDocument {
                stored_filename: format!("{id}.pdf"),
                id: id.clone(),
                title: title.to_owned(),
                original_filename: "cours.pdf".to_owned(),
                file_extension: "pdf".to_owned(),
                mime_type: "application/pdf".to_owned(),
                file_size: 2_048,
                content_hash: format!("{:0>64}", id.replace('-', "")),
                workspace_id: workspace.map(str::to_owned),
                folder_id: None,
                metadata: serde_json::json!({}),
            },
        )?;
        documents::set_content(transaction, &id, text, "test")?;
        Ok(id)
    }

    fn note(transaction: &Transaction<'_>, title: &str, text: &str) -> AppResult<String> {
        Ok(notes::create(
            transaction,
            &NoteContent {
                title: title.to_owned(),
                content: text.to_owned(),
                content_format: NoteFormat::Plain,
                content_text: text.to_owned(),
            },
            None,
            None,
        )?
        .id)
    }

    #[test]
    fn only_what_the_user_shared_is_sent_the_most_relevant_first() {
        let (_dir, database) = open_temporary();
        let (course, safety, other, workspace) = database
            .write(|transaction| {
                let workspace = workspaces::create(
                    transaction,
                    &NewWorkspace {
                        name: "Électronique".to_owned(),
                        description: None,
                        color: None,
                        icon: None,
                    },
                )?
                .id;
                let course = document(
                    transaction,
                    "Cours NE555",
                    &format!(
                        "Introduction aux circuits.{PAGE_BREAK}Le montage astable du NE555 oscille sans cesse entre deux états.{PAGE_BREAK}Le montage monostable délivre une seule impulsion."
                    ),
                    Some(&workspace),
                )?;
                let safety = note(transaction, "Sécurité électrique", "Couper le disjoncteur avant toute intervention.")?;
                let other = note(transaction, "Recette", "Le NE555 de la cuisine : astable et monostable de crêpes.")?;
                Ok((course, safety, other, workspace))
            })
            .expect("seeded");

        let scope = AssistantScope {
            items: vec![
                ItemRef {
                    kind: ItemKind::Document,
                    id: course.clone(),
                },
                ItemRef {
                    kind: ItemKind::Note,
                    id: safety.clone(),
                },
            ],
            workspace_id: None,
        };
        let sent = database
            .read(|connection| {
                passages(
                    connection,
                    &scope,
                    "Quelle différence entre un montage astable et monostable ?",
                    ContextSize::Standard,
                )
            })
            .expect("passages");
        // The note « Recette » matches the words too, but was not shared.
        assert!(sent.iter().all(|passage| passage.id != other), "{sent:?}");
        assert_eq!(sent[0].id, course);
        let pages: Vec<Option<i64>> = sent
            .iter()
            .filter(|p| p.id == course)
            .map(|p| p.page)
            .collect();
        assert!(
            pages.contains(&Some(2)) && pages.contains(&Some(3)),
            "{pages:?}"
        );
        // The shared note does not match, but comes with its beginning.
        let note_passage = sent
            .iter()
            .find(|passage| passage.id == safety)
            .expect("note");
        assert_eq!(note_passage.title, "Sécurité électrique");
        let indexes: Vec<u32> = sent.iter().map(|passage| passage.index).collect();
        assert_eq!(
            indexes,
            (1..=u32::try_from(sent.len()).expect("small")).collect::<Vec<_>>()
        );

        // A workspace shares its documents and notes, and only them.
        let by_workspace = database
            .read(|connection| {
                passages(
                    connection,
                    &AssistantScope {
                        items: Vec::new(),
                        workspace_id: Some(workspace.clone()),
                    },
                    "montage astable",
                    ContextSize::Compact,
                )
            })
            .expect("passages");
        assert!(!by_workspace.is_empty());
        assert!(
            by_workspace.iter().all(|passage| passage.id == course),
            "{by_workspace:?}"
        );

        // No scope, nothing sent; a trashed item is no longer shared.
        assert!(
            database
                .read(|connection| passages(
                    connection,
                    &AssistantScope::default(),
                    "NE555",
                    ContextSize::Extended
                ))
                .expect("passages")
                .is_empty()
        );
        database
            .write(|transaction| documents::trash(transaction, &course).map(|_| ()))
            .expect("trashed");
        let after_trash = database
            .read(|connection| {
                passages(connection, &scope, "montage astable", ContextSize::Standard)
            })
            .expect("passages");
        assert!(
            after_trash.iter().all(|passage| passage.id != course),
            "{after_trash:?}"
        );
    }

    #[test]
    fn the_budget_and_the_windows_bound_what_is_sent() {
        let (_dir, database) = open_temporary();
        let long = format!(
            "{} Le transistor bipolaire amplifie le courant de base. {}",
            "Remplissage sans rapport. ".repeat(200),
            "Suite sans rapport. ".repeat(200)
        );
        let ids = database
            .write(|transaction| {
                (0..12)
                    .map(|index| note(transaction, &format!("Transistor {index}"), &long))
                    .collect::<AppResult<Vec<_>>>()
            })
            .expect("seeded");
        let scope = AssistantScope {
            items: ids
                .iter()
                .map(|id| ItemRef {
                    kind: ItemKind::Note,
                    id: id.clone(),
                })
                .collect(),
            workspace_id: None,
        };
        for size in [
            ContextSize::Compact,
            ContextSize::Standard,
            ContextSize::Extended,
        ] {
            let sent = database
                .read(|connection| passages(connection, &scope, "transistor bipolaire", size))
                .expect("passages");
            let (passages_max, chars_max) = size.budget();
            assert!(sent.len() <= passages_max, "{size:?}");
            let total: usize = sent
                .iter()
                .map(|passage| passage.text.chars().count())
                .sum();
            assert!(total <= chars_max, "{size:?}: {total}");
            for passage in &sent {
                assert!(passage.text.chars().count() <= PASSAGE_MAX_CHARS + 2);
                assert!(
                    passage.text.contains("transistor bipolaire"),
                    "{}",
                    passage.text
                );
                assert!(passage.excerpt.chars().count() <= EXCERPT_CHARS + 1);
                assert_eq!(passage.chars as usize, passage.text.chars().count());
            }
        }
        // The text sent never leaves with the stored sources.
        let sent = database
            .read(|connection| passages(connection, &scope, "transistor", ContextSize::Compact))
            .expect("passages");
        let stored = serde_json::to_string(&sent).expect("json");
        assert!(!stored.contains("\"text\""), "{stored}");
    }

    #[test]
    fn questions_are_never_read_as_search_syntax() {
        let (_dir, database) = open_temporary();
        let id = database
            .write(|transaction| {
                note(
                    transaction,
                    "Syntaxe",
                    "Les guillemets \"et\" les étoiles * ne cassent rien.",
                )
            })
            .expect("seeded");
        let scope = AssistantScope {
            items: vec![ItemRef {
                kind: ItemKind::Note,
                id,
            }],
            workspace_id: None,
        };
        for question in [
            "\"guillemets",
            "étoiles* OR NOT",
            "NEAR(a b)",
            "col:value",
            "-- ;",
        ] {
            database
                .read(|connection| passages(connection, &scope, question, ContextSize::Standard))
                .unwrap_or_else(|error| panic!("{question}: {error}"));
        }
        let invalid = AssistantScope {
            items: vec![ItemRef {
                kind: ItemKind::Note,
                id: "../x".to_owned(),
            }],
            workspace_id: None,
        };
        assert!(
            database
                .read(|connection| passages(connection, &invalid, "x", ContextSize::Standard))
                .is_err()
        );
    }

    #[test]
    fn windows_keep_the_words_of_the_question() {
        let body = format!(
            "{}Le NE555 oscille.{}",
            "a ".repeat(2_000),
            " b".repeat(2_000)
        );
        let text = window(&body, &["ne555".to_owned()], 300);
        assert!(text.contains("NE555 oscille"), "{text}");
        assert!(text.starts_with('…') && text.ends_with('…'), "{text}");
        assert!(text.chars().count() <= 302);
        assert_eq!(window("court", &[], 300), "court");
    }
}

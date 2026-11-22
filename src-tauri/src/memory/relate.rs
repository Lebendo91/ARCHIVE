//! Relationships detected by rules (specification §10.4). Two items whose distinctive terms overlap are
//! suggested as related; shared tags and a shared workspace add to the confidence. Each suggestion records why
//! it was made (the shared terms, tags and workspace) and how sure the rule is: it is never presented as a
//! fact, and waits for the user to accept or reject it (§10.5). The engine never changes a relation the user
//! decided on, created, or wrote as a link in a note; and it never suggests again what the user rejected.

use std::collections::{HashMap, HashSet};

use rusqlite::{Connection, Transaction, params};
use serde_json::json;

use super::{ItemKind, analysis};
use crate::error::AppResult;
use crate::repo::EntityKind;
use crate::repo::relations::{self, NewRelation, Relation, RelationOrigin, RelationStatus};
use crate::util::now_ms;

/// Type of the relations suggested by the rules.
pub const RELATED: &str = "related_to";
/// Name of the rule, kept in the provenance of each suggestion.
pub const RULE: &str = "shared_terms";
pub const RULE_VERSION: i64 = 1;
/// New suggestions made for an item at a time, the most confident first.
const SUGGESTIONS_MAX: usize = 8;
/// Shared terms named in the provenance.
const TERMS_SHOWN: usize = 6;
/// Cosine similarity of the distinctive terms from which two shared terms make a suggestion.
const MIN_SIMILARITY: f64 = 0.12;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Changes {
    pub created: usize,
    pub updated: usize,
    pub removed: usize,
}

struct Other {
    kind: ItemKind,
    id: String,
    dot: f64,
    /// Shared terms: label and the product of the two weights.
    shared: Vec<(String, f64)>,
}

/// What the rule says of a pair of items.
#[derive(Debug, Clone, PartialEq)]
struct Assessment {
    confidence: f64,
    provenance: serde_json::Value,
}

fn tags_of(
    connection: &Connection,
    kind: ItemKind,
    id: &str,
) -> AppResult<HashMap<String, String>> {
    let sql = match kind {
        ItemKind::Document => {
            "SELECT t.id, t.name FROM document_tags x JOIN tags t ON t.id = x.tag_id WHERE x.document_id = ?1"
        }
        ItemKind::Note => {
            "SELECT t.id, t.name FROM note_tags x JOIN tags t ON t.id = x.tag_id WHERE x.note_id = ?1"
        }
    };
    let mut statement = connection.prepare_cached(sql)?;
    let rows = statement.query_map([id], |row| Ok((row.get(0)?, row.get(1)?)))?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// Workspace of a live item, or `None` if it is in the trash or no longer exists.
fn live(connection: &Connection, kind: ItemKind, id: &str) -> AppResult<Option<Option<String>>> {
    Ok(super::load(connection, kind, id)?
        .filter(|item| !item.trashed)
        .map(|item| item.workspace_id))
}

/// Items sharing at least one distinctive term with the item, with the dot product of their weights.
fn others(
    connection: &Connection,
    kind: ItemKind,
    id: &str,
    own: &[analysis::Term],
) -> AppResult<Vec<Other>> {
    let weights: HashMap<&str, (&str, f64)> = own
        .iter()
        .map(|term| (term.term.as_str(), (term.label.as_str(), term.weight)))
        .collect();
    let terms = serde_json::to_string(&own.iter().map(|term| &term.term).collect::<Vec<_>>())
        .map_err(|error| crate::error::AppError::Internal(error.to_string()))?;
    let mut statement = connection.prepare(
        "SELECT entity_type, entity_id, term, weight FROM entity_terms
         WHERE term IN (SELECT value FROM json_each(?1)) AND NOT (entity_type = ?2 AND entity_id = ?3)",
    )?;
    let rows = statement.query_map(params![terms, kind.entity(), id], |row| {
        Ok((
            row.get::<_, EntityKind>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, f64>(3)?,
        ))
    })?;
    let mut found: HashMap<(ItemKind, String), Other> = HashMap::new();
    for row in rows {
        let (entity, other_id, term, weight) = row?;
        let (Some(other_kind), Some((label, own_weight))) =
            (ItemKind::from_entity(entity), weights.get(term.as_str()))
        else {
            continue;
        };
        let other = found
            .entry((other_kind, other_id.clone()))
            .or_insert_with(|| Other {
                kind: other_kind,
                id: other_id,
                dot: 0.0,
                shared: Vec::new(),
            });
        other.dot += own_weight * weight;
        other
            .shared
            .push(((*label).to_owned(), own_weight * weight));
    }
    Ok(found.into_values().collect())
}

fn norm(connection: &Connection, kind: ItemKind, id: &str) -> AppResult<f64> {
    let sum: Option<f64> = connection.query_row(
        "SELECT sum(weight * weight) FROM entity_terms WHERE entity_type = ?1 AND entity_id = ?2",
        params![kind.entity(), id],
        |row| row.get(0),
    )?;
    Ok(sum.unwrap_or(0.0).sqrt())
}

/// The item's side of a comparison: its workspace, its tags and the norm of its terms.
struct Own<'a> {
    workspace: Option<&'a str>,
    tags: &'a HashMap<String, String>,
    norm: f64,
}

fn assess(connection: &Connection, own: &Own<'_>, other: &Other) -> AppResult<Option<Assessment>> {
    let Own {
        workspace,
        tags,
        norm: own_norm,
    } = *own;
    let Some(other_workspace) = live(connection, other.kind, &other.id)? else {
        return Ok(None);
    };
    let other_norm = norm(connection, other.kind, &other.id)?;
    if own_norm <= 0.0 || other_norm <= 0.0 {
        return Ok(None);
    }
    let similarity = other.dot / (own_norm * other_norm);
    let other_tags = tags_of(connection, other.kind, &other.id)?;
    let mut shared_tags: Vec<&String> = tags
        .iter()
        .filter(|(tag_id, _)| other_tags.contains_key(*tag_id))
        .map(|(_, name)| name)
        .collect();
    shared_tags.sort();
    let same_workspace = workspace.is_some() && workspace == other_workspace.as_deref();
    let qualifies = (other.shared.len() >= 2 && similarity >= MIN_SIMILARITY)
        || (!other.shared.is_empty() && !shared_tags.is_empty());
    if !qualifies {
        return Ok(None);
    }
    let confidence = (similarity * 0.8
        + 0.1 * shared_tags.len().min(2) as f64
        + if same_workspace { 0.05 } else { 0.0 })
    .clamp(0.05, 0.95);
    let mut shared = other.shared.clone();
    shared.sort_by(|a, b| b.1.total_cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    let terms: Vec<String> = shared
        .into_iter()
        .take(TERMS_SHOWN)
        .map(|(label, _)| label)
        .collect();
    Ok(Some(Assessment {
        confidence: (confidence * 100.0).round() / 100.0,
        provenance: json!({
            "rule": RULE,
            "version": RULE_VERSION,
            "terms": terms,
            "tags": shared_tags,
            "sameWorkspace": same_workspace,
            "similarity": (similarity * 100.0).round() / 100.0,
        }),
    }))
}

fn other_end(relation: &Relation, kind: ItemKind, id: &str) -> Option<(ItemKind, String)> {
    let own = kind.entity();
    if relation.source_type == own && relation.source_id == id {
        ItemKind::from_entity(relation.target_type).map(|other| (other, relation.target_id.clone()))
    } else {
        ItemKind::from_entity(relation.source_type).map(|other| (other, relation.source_id.clone()))
    }
}

fn is_rule_suggestion(relation: &Relation) -> bool {
    relation.origin == RelationOrigin::Rule
        && relation.status == RelationStatus::Suggested
        && relation.relation_type == RELATED
}

/// Suggests the relations of an item from its distinctive terms, updates those already suggested, and removes
/// those that no longer hold. Relations decided or created by the user are never touched.
pub fn suggest(transaction: &Transaction<'_>, kind: ItemKind, id: &str) -> AppResult<Changes> {
    let mut changes = Changes::default();
    let Some(workspace) = live(transaction, kind, id)? else {
        // In the trash: what was suggested stays, hidden, until the item is restored or deleted.
        return Ok(changes);
    };
    let own_terms = analysis::get(transaction, kind, id)?;
    let tags = tags_of(transaction, kind, id)?;
    let own = Own {
        workspace: workspace.as_deref(),
        tags: &tags,
        norm: norm(transaction, kind, id)?,
    };
    let mut assessed: Vec<(ItemKind, String, Assessment)> = Vec::new();
    if !own_terms.is_empty() {
        for other in others(transaction, kind, id, &own_terms)? {
            if let Some(assessment) = assess(transaction, &own, &other)? {
                assessed.push((other.kind, other.id, assessment));
            }
        }
    }
    let qualifying: HashMap<(ItemKind, String), &Assessment> = assessed
        .iter()
        .map(|(other_kind, other_id, assessment)| ((*other_kind, other_id.clone()), assessment))
        .collect();

    // The relations the item already has: suggestions are refreshed, any other relation stands.
    let existing = relations::list_for_entity(transaction, kind.entity(), id)?;
    let mut related: HashSet<(ItemKind, String)> = HashSet::new();
    let now = now_ms();
    for relation in &existing {
        let Some(other) = other_end(relation, kind, id) else {
            continue;
        };
        related.insert(other.clone());
        if !is_rule_suggestion(relation) {
            continue;
        }
        match qualifying.get(&other) {
            Some(assessment) => {
                if relation.confidence != Some(assessment.confidence)
                    || relation.provenance != assessment.provenance
                {
                    transaction.execute(
                        "UPDATE relations SET confidence = ?2, provenance_json = ?3, updated_at = ?4 WHERE id = ?1",
                        params![relation.id, assessment.confidence, assessment.provenance.to_string(), now],
                    )?;
                    changes.updated += 1;
                }
            }
            // A suggestion towards an item in the trash stays hidden; any other that no longer holds goes.
            None if live(transaction, other.0, &other.1)?.is_some() => {
                relations::delete(transaction, &relation.id)?;
                changes.removed += 1;
            }
            None => {}
        }
    }

    assessed.sort_by(|a, b| {
        b.2.confidence
            .total_cmp(&a.2.confidence)
            .then_with(|| a.1.cmp(&b.1))
    });
    for (other_kind, other_id, assessment) in assessed {
        if changes.created >= SUGGESTIONS_MAX {
            break;
        }
        if related.contains(&(other_kind, other_id.clone())) {
            continue;
        }
        // A relation without direction is stored once per pair, in a fixed order.
        let mut ends = [
            (kind.entity(), id.to_owned()),
            (other_kind.entity(), other_id.clone()),
        ];
        ends.sort_by(|a, b| (a.0.as_str(), &a.1).cmp(&(b.0.as_str(), &b.1)));
        let [source, target] = ends;
        relations::create(
            transaction,
            &NewRelation {
                source,
                target,
                relation_type: RELATED.to_owned(),
                origin: RelationOrigin::Rule,
                confidence: Some(assessment.confidence),
                provenance: assessment.provenance.clone(),
            },
        )?;
        related.insert((other_kind, other_id));
        changes.created += 1;
    }
    Ok(changes)
}

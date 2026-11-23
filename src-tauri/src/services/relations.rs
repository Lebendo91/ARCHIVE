//! Relations under the user's control (specification §10.5): accept, reject, edit or remove what the engine
//! suggests, and create relations by hand. The internal links of a note are relations too, but they live in its
//! text: they are shown with the note, and change only when the note is edited.

use rusqlite::{Connection, Transaction, params};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use ts_rs::TS;

use crate::error::{AppError, AppResult};
use crate::memory::ItemKind;
use crate::memory::relate::{RELATED, RULE};
use crate::repo::EntityKind;
use crate::repo::relations::{self, NewRelation, Relation, RelationOrigin, RelationStatus};
use crate::repo::timeline::{self, NewTimelineEvent, TimelineEventType};
use crate::services::notes::{LinkTarget, LinkedResource, resource};
use crate::util::validate_id;

/// Types of relation the user can choose. Without direction: related_to and contradicts.
pub const RELATION_TYPES: &[&str] = &[
    "related_to",
    "references",
    "explains",
    "example_of",
    "part_of",
    "depends_on",
    "contradicts",
];
const SYMMETRIC: &[&str] = &["related_to", "contradicts"];
/// Relations written as links in the text of a note.
const LINK: &str = "links_to";

/// Which way a relation goes, seen from the item shown.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum RelationDirection {
    Outgoing,
    Incoming,
}

/// A relation of an item, with the item at its other end.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RelationView {
    pub id: String,
    pub relation_type: String,
    pub origin: RelationOrigin,
    pub status: RelationStatus,
    pub confidence: Option<f64>,
    /// Why the relation exists: the rule and what it found, or who created it.
    #[ts(type = "Record<string, unknown>")]
    pub provenance: Value,
    pub direction: RelationDirection,
    pub other: LinkedResource,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct NewRelationInput {
    pub source: LinkTarget,
    pub target: LinkTarget,
    pub relation_type: String,
}

/// What the user decides on a suggestion.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum RelationDecision {
    Accept,
    Reject,
    /// A rejected suggestion becomes a suggestion again.
    Restore,
}

fn check_type(relation_type: &str) -> AppResult<()> {
    if RELATION_TYPES.contains(&relation_type) {
        Ok(())
    } else {
        Err(AppError::InvalidInput(format!(
            "unknown relation type {relation_type:?}"
        )))
    }
}

fn check_live(connection: &Connection, target: &LinkTarget) -> AppResult<LinkedResource> {
    validate_id(&target.id, "related item id")?;
    match resource(connection, target.kind, &target.id)? {
        Some(found) if found.available => Ok(found),
        Some(_) => Err(AppError::InvalidInput(
            "the item is in the trash".to_owned(),
        )),
        None => Err(AppError::NotFound { entity: "item" }),
    }
}

/// One end of a relation between items.
type End<'a> = (ItemKind, &'a str);

fn ends(relation: &Relation) -> Option<(End<'_>, End<'_>)> {
    Some((
        (
            ItemKind::from_entity(relation.source_type)?,
            relation.source_id.as_str(),
        ),
        (
            ItemKind::from_entity(relation.target_type)?,
            relation.target_id.as_str(),
        ),
    ))
}

/// The relations of a document or a note, except the links of notes: decided relations first, then the
/// suggestions (the most confident first), then the rejected suggestions.
pub fn list(connection: &Connection, kind: ItemKind, id: &str) -> AppResult<Vec<RelationView>> {
    validate_id(id, "item id")?;
    if resource(connection, kind, id)?.is_none() {
        return Err(AppError::NotFound { entity: "item" });
    }
    let mut views = Vec::new();
    for relation in relations::list_for_entity(connection, kind.entity(), id)? {
        if relation.relation_type == LINK {
            continue;
        }
        let Some((source, target)) = ends(&relation) else {
            continue;
        };
        let (direction, (other_kind, other_id)) = if source == (kind, id) {
            (RelationDirection::Outgoing, target)
        } else {
            (RelationDirection::Incoming, source)
        };
        let Some(other) = resource(connection, other_kind, other_id)? else {
            continue;
        };
        // A suggestion towards an item in the trash waits, hidden, until it is restored.
        if !other.available && relation.status != RelationStatus::Accepted {
            continue;
        }
        views.push(RelationView {
            id: relation.id,
            relation_type: relation.relation_type,
            origin: relation.origin,
            status: relation.status,
            confidence: relation.confidence,
            provenance: relation.provenance,
            direction,
            other,
            created_at: relation.created_at,
            updated_at: relation.updated_at,
        });
    }
    let rank = |status: RelationStatus| match status {
        RelationStatus::Accepted => 0,
        RelationStatus::Suggested => 1,
        RelationStatus::Rejected => 2,
    };
    views.sort_by(|a, b| {
        rank(a.status)
            .cmp(&rank(b.status))
            .then_with(|| {
                b.confidence
                    .unwrap_or(1.0)
                    .total_cmp(&a.confidence.unwrap_or(1.0))
            })
            .then_with(|| {
                a.other
                    .title
                    .to_lowercase()
                    .cmp(&b.other.title.to_lowercase())
            })
    });
    Ok(views)
}

fn get_editable(transaction: &Transaction<'_>, id: &str) -> AppResult<Relation> {
    let relation = relations::get(transaction, id)?;
    if relation.relation_type == LINK {
        return Err(AppError::InvalidInput(
            "a link of a note is changed by editing the note".to_owned(),
        ));
    }
    Ok(relation)
}

/// Removes the rule's suggestion between two items: the user just decided on their relation.
fn drop_suggestion(
    transaction: &Transaction<'_>,
    a: (EntityKind, &str),
    b: (EntityKind, &str),
) -> AppResult<()> {
    transaction.execute(
        "DELETE FROM relations WHERE relation_type = ?5 AND origin = 'rule' AND status = 'suggested'
         AND ((source_type = ?1 AND source_id = ?2 AND target_type = ?3 AND target_id = ?4)
           OR (source_type = ?3 AND source_id = ?4 AND target_type = ?1 AND target_id = ?2))",
        params![a.0, a.1, b.0, b.1, RELATED],
    )?;
    Ok(())
}

/// Whether a relation of this type already links the two items (in either direction for a relation without
/// direction), other than `except`.
fn duplicate(
    transaction: &Transaction<'_>,
    source: (EntityKind, &str),
    target: (EntityKind, &str),
    relation_type: &str,
    except: Option<&str>,
) -> AppResult<bool> {
    let both_ways = SYMMETRIC.contains(&relation_type);
    let count: i64 = transaction.query_row(
        "SELECT count(*) FROM relations WHERE relation_type = ?5 AND id IS NOT ?6
         AND ((source_type = ?1 AND source_id = ?2 AND target_type = ?3 AND target_id = ?4)
           OR (?7 AND source_type = ?3 AND source_id = ?4 AND target_type = ?1 AND target_id = ?2))",
        params![source.0, source.1, target.0, target.1, relation_type, except, both_ways],
        |row| row.get(0),
    )?;
    Ok(count > 0)
}

/// Creates a relation chosen by the user: it is accepted at once.
pub fn create(transaction: &Transaction<'_>, input: &NewRelationInput) -> AppResult<Relation> {
    check_type(&input.relation_type)?;
    check_live(transaction, &input.source)?;
    check_live(transaction, &input.target)?;
    if input.source == input.target {
        return Err(AppError::InvalidInput(
            "an item cannot be related to itself".to_owned(),
        ));
    }
    let source = (input.source.kind.entity(), input.source.id.as_str());
    let target = (input.target.kind.entity(), input.target.id.as_str());
    if duplicate(transaction, source, target, &input.relation_type, None)? {
        return Err(AppError::NameTaken { entity: "relation" });
    }
    drop_suggestion(transaction, source, target)?;
    relations::create(
        transaction,
        &NewRelation {
            source: (source.0, source.1.to_owned()),
            target: (target.0, target.1.to_owned()),
            relation_type: input.relation_type.clone(),
            origin: RelationOrigin::User,
            confidence: None,
            provenance: serde_json::json!({ "source": "user" }),
        },
    )
}

/// Changes the type of a relation; a suggestion whose type the user chooses is accepted with it.
pub fn set_type(
    transaction: &Transaction<'_>,
    id: &str,
    relation_type: &str,
) -> AppResult<Relation> {
    check_type(relation_type)?;
    let relation = get_editable(transaction, id)?;
    let source = (relation.source_type, relation.source_id.as_str());
    let target = (relation.target_type, relation.target_id.as_str());
    if duplicate(transaction, source, target, relation_type, Some(id))? {
        return Err(AppError::NameTaken { entity: "relation" });
    }
    let accepted_now = relation.status != RelationStatus::Accepted;
    transaction.execute(
        "UPDATE relations SET relation_type = ?2, status = 'accepted', updated_at = ?3 WHERE id = ?1",
        params![id, relation_type, crate::util::now_ms()],
    )?;
    if accepted_now {
        record_accepted(transaction, &relation)?;
    }
    relations::get(transaction, id)
}

fn record_accepted(transaction: &Transaction<'_>, relation: &Relation) -> AppResult<()> {
    let Some((source, target)) = ends(relation) else {
        return Ok(());
    };
    let title = |(kind, id): (ItemKind, &str)| -> AppResult<String> {
        Ok(resource(transaction, kind, id)?
            .map(|found| found.title)
            .unwrap_or_default())
    };
    let description = format!("{} — {}", title(source)?, title(target)?);
    timeline::record(
        transaction,
        &NewTimelineEvent {
            event_type: TimelineEventType::RelationAccepted,
            entity: (EntityKind::Relation, &relation.id),
            workspace_id: None,
            description: description.trim_matches([' ', '—']),
            metadata: serde_json::json!({
                "origin": relation.origin.as_str(),
                "rule": relation.provenance.get("rule").and_then(Value::as_str).unwrap_or(RULE),
            }),
        },
    )?;
    Ok(())
}

/// Accepts or rejects a suggestion, or makes a rejected suggestion a suggestion again.
pub fn decide(
    transaction: &Transaction<'_>,
    id: &str,
    decision: RelationDecision,
) -> AppResult<Relation> {
    let relation = get_editable(transaction, id)?;
    if relation.origin == RelationOrigin::User {
        return Err(AppError::InvalidInput(
            "a relation created by the user is removed, not decided on".to_owned(),
        ));
    }
    let status = match decision {
        RelationDecision::Accept => RelationStatus::Accepted,
        RelationDecision::Reject => RelationStatus::Rejected,
        RelationDecision::Restore => RelationStatus::Suggested,
    };
    let updated = relations::set_status(transaction, id, status)?;
    if status == RelationStatus::Accepted && relation.status != RelationStatus::Accepted {
        record_accepted(transaction, &relation)?;
    }
    Ok(updated)
}

/// Removes a relation. A relation found by the engine is rejected instead of deleted, so that it is never
/// suggested again.
pub fn remove(transaction: &Transaction<'_>, id: &str) -> AppResult<()> {
    let relation = get_editable(transaction, id)?;
    if relation.origin == RelationOrigin::User {
        relations::delete(transaction, id)
    } else {
        relations::set_status(transaction, id, RelationStatus::Rejected).map(|_| ())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::testing::open_temporary;
    use crate::memory::worker;
    use crate::repo::notes::{self, NoteContent, NoteFormat};
    use crate::services::notes::LinkKind;

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

    fn target(id: &str) -> LinkTarget {
        LinkTarget {
            kind: LinkKind::Note,
            id: id.to_owned(),
        }
    }

    #[test]
    fn the_user_creates_edits_and_removes_relations() {
        let (_dir, database) = open_temporary();
        let (a, b) = database
            .write(|transaction| {
                Ok((
                    note(transaction, "Loi d'Ohm", "U = R × I")?,
                    note(transaction, "Puissance", "P = U × I")?,
                ))
            })
            .expect("written");
        let input = NewRelationInput {
            source: target(&a),
            target: target(&b),
            relation_type: "explains".to_owned(),
        };
        let created = database
            .write(|transaction| create(transaction, &input))
            .expect("created");
        assert_eq!(
            (created.origin, created.status),
            (RelationOrigin::User, RelationStatus::Accepted)
        );
        assert!(matches!(
            database.write(|transaction| create(transaction, &input)),
            Err(AppError::NameTaken { .. })
        ));
        for refused in ["links_to", "DROP TABLE", ""] {
            let input = NewRelationInput {
                relation_type: refused.to_owned(),
                ..input.clone()
            };
            assert!(
                matches!(
                    database.write(|transaction| create(transaction, &input)),
                    Err(AppError::InvalidInput(_))
                ),
                "{refused}"
            );
        }
        let itself = NewRelationInput {
            target: target(&a),
            ..input.clone()
        };
        assert!(
            database
                .write(|transaction| create(transaction, &itself))
                .is_err()
        );

        // Seen from each end, with its direction.
        let from_a = database
            .read(|connection| list(connection, ItemKind::Note, &a))
            .expect("list");
        assert_eq!(
            (
                from_a.len(),
                from_a[0].direction,
                from_a[0].other.title.as_str()
            ),
            (1, RelationDirection::Outgoing, "Puissance")
        );
        let from_b = database
            .read(|connection| list(connection, ItemKind::Note, &b))
            .expect("list");
        assert_eq!(from_b[0].direction, RelationDirection::Incoming);

        let edited = database
            .write(|transaction| set_type(transaction, &created.id, "depends_on"))
            .expect("edited");
        assert_eq!(edited.relation_type, "depends_on");
        // Removed for good: it was the user's.
        database
            .write(|transaction| remove(transaction, &created.id))
            .expect("removed");
        assert!(
            database
                .read(|connection| list(connection, ItemKind::Note, &a))
                .expect("list")
                .is_empty()
        );
    }

    #[test]
    fn suggestions_are_accepted_rejected_restored_and_never_lost() {
        let (_dir, database) = open_temporary();
        let text =
            "Le NE555 en astable : la fréquence dépend du condensateur. Le NE555 astable oscille.";
        let (a, b) = database
            .write(|transaction| {
                Ok((
                    note(transaction, "NE555 astable", text)?,
                    note(transaction, "Astable à NE555", text)?,
                ))
            })
            .expect("written");
        worker::process_all(&database, crate::util::now_ms() + 86_400_000).expect("processed");
        let suggestion = database
            .read(|connection| list(connection, ItemKind::Note, &a))
            .expect("list")
            .remove(0);
        assert_eq!(
            (suggestion.origin, suggestion.status),
            (RelationOrigin::Rule, RelationStatus::Suggested)
        );
        assert!(matches!(
            database.write(|transaction| decide(
                transaction,
                &suggestion.id,
                RelationDecision::Accept
            )),
            Ok(Relation {
                status: RelationStatus::Accepted,
                ..
            })
        ));
        let events: i64 = database
            .read(|connection| {
                Ok(connection.query_row(
                    "SELECT count(*) FROM timeline_events WHERE event_type = 'relation_accepted'",
                    [],
                    |row| row.get(0),
                )?)
            })
            .expect("events");
        assert_eq!(events, 1);
        // Removing a relation found by the engine rejects it: it is not suggested again.
        database
            .write(|transaction| remove(transaction, &suggestion.id))
            .expect("removed");
        let rejected = database
            .read(|connection| list(connection, ItemKind::Note, &b))
            .expect("list")
            .remove(0);
        assert_eq!(rejected.status, RelationStatus::Rejected);
        // The note changes and is processed again: the rejection stands.
        database
            .write(|transaction| {
                let revision = notes::get(transaction, &a)?.revision;
                let content = NoteContent {
                    title: "NE555 astable".to_owned(),
                    content: format!("{text} Encore le NE555."),
                    content_format: NoteFormat::Plain,
                    content_text: format!("{text} Encore le NE555."),
                };
                notes::save(transaction, &a, revision, &content).map(|_| ())
            })
            .expect("saved");
        assert!(
            worker::process_all(&database, crate::util::now_ms() + 86_400_000).expect("processed")
                >= 3
        );
        let again = database
            .read(|connection| list(connection, ItemKind::Note, &a))
            .expect("list");
        assert_eq!(again.len(), 1);
        let restored = database
            .write(|transaction| decide(transaction, &again[0].id, RelationDecision::Restore))
            .expect("restored");
        assert_eq!(restored.status, RelationStatus::Suggested);
        // A relation the user creates replaces the engine's suggestion for the pair.
        let input = NewRelationInput {
            source: target(&b),
            target: target(&a),
            relation_type: "example_of".to_owned(),
        };
        database
            .write(|transaction| create(transaction, &input))
            .expect("created");
        let now = database
            .read(|connection| list(connection, ItemKind::Note, &a))
            .expect("list");
        assert_eq!(now.len(), 1);
        assert_eq!(
            (now[0].relation_type.as_str(), now[0].origin),
            ("example_of", RelationOrigin::User)
        );
        assert!(
            database
                .write(|transaction| decide(transaction, &now[0].id, RelationDecision::Reject))
                .is_err()
        );
    }
}

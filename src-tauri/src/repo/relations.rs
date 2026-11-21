//! Relations between resources (specification §10.4–10.5). Each relation records its origin (user, rule or
//! AI), its status and its confidence, so that a suggestion is never presented as a verified fact.

use rusqlite::{Connection, OptionalExtension, Row, Transaction, params};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::{EntityKind, expect_one, json_object_text, json_value, map_write_error, text_enum};
use crate::error::{AppError, AppResult};
use crate::util::{new_id, now_ms, validate_id};

const ENTITY: &str = "relation";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum RelationOrigin {
    User,
    Rule,
    Ai,
}
text_enum!(RelationOrigin { User => "user", Rule => "rule", Ai => "ai" });

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum RelationStatus {
    Suggested,
    Accepted,
    Rejected,
}
text_enum!(RelationStatus { Suggested => "suggested", Accepted => "accepted", Rejected => "rejected" });

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Relation {
    pub id: String,
    pub source_type: EntityKind,
    pub source_id: String,
    pub target_type: EntityKind,
    pub target_id: String,
    pub relation_type: String,
    pub origin: RelationOrigin,
    pub status: RelationStatus,
    pub confidence: Option<f64>,
    #[ts(type = "Record<string, unknown>")]
    pub provenance: serde_json::Value,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone)]
pub struct NewRelation {
    pub source: (EntityKind, String),
    pub target: (EntityKind, String),
    pub relation_type: String,
    pub origin: RelationOrigin,
    pub confidence: Option<f64>,
    pub provenance: serde_json::Value,
}

const COLUMNS: &str = "id, source_type, source_id, target_type, target_id, relation_type, origin, status, \
                       confidence, provenance_json, created_at, updated_at";

fn from_row(row: &Row<'_>) -> rusqlite::Result<Relation> {
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
        provenance: json_value(&row.get::<_, String>(9)?),
        created_at: row.get(10)?,
        updated_at: row.get(11)?,
    })
}

fn check_endpoint(kind: EntityKind) -> AppResult<()> {
    if kind == EntityKind::Relation {
        return Err(AppError::InvalidInput(
            "a relation cannot point to another relation".to_owned(),
        ));
    }
    Ok(())
}

pub fn get(connection: &Connection, id: &str) -> AppResult<Relation> {
    validate_id(id, "relation id")?;
    connection
        .query_row(
            &format!("SELECT {COLUMNS} FROM relations WHERE id = ?1"),
            [id],
            from_row,
        )
        .optional()?
        .ok_or(AppError::NotFound { entity: ENTITY })
}

/// Creates a relation. Relations created by the user are accepted immediately; rule-based and AI relations
/// start as suggestions that the user accepts or rejects.
pub fn create(transaction: &Transaction<'_>, input: &NewRelation) -> AppResult<Relation> {
    check_endpoint(input.source.0)?;
    check_endpoint(input.target.0)?;
    validate_id(&input.source.1, "relation source id")?;
    validate_id(&input.target.1, "relation target id")?;
    if input.source == input.target {
        return Err(AppError::InvalidInput(
            "a resource cannot be related to itself".to_owned(),
        ));
    }
    let relation_type = input.relation_type.trim();
    if relation_type.is_empty()
        || relation_type.len() > 64
        || !relation_type
            .chars()
            .all(|character| character.is_ascii_lowercase() || character == '_')
    {
        return Err(AppError::InvalidInput(
            "relation type must be a snake_case identifier".to_owned(),
        ));
    }
    if let Some(confidence) = input.confidence
        && !(0.0..=1.0).contains(&confidence)
    {
        return Err(AppError::InvalidInput(
            "confidence must be between 0 and 1".to_owned(),
        ));
    }
    let status = if input.origin == RelationOrigin::User {
        RelationStatus::Accepted
    } else {
        RelationStatus::Suggested
    };
    let id = new_id();
    let now = now_ms();
    transaction
        .execute(
            "INSERT INTO relations (id, source_type, source_id, target_type, target_id, relation_type, origin, status,
                                    confidence, provenance_json, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)",
            params![
                id,
                input.source.0,
                input.source.1,
                input.target.0,
                input.target.1,
                relation_type,
                input.origin,
                status,
                input.confidence,
                json_object_text(&input.provenance, "relation provenance")?,
                now
            ],
        )
        .map_err(|error| map_write_error(error, ENTITY))?;
    get(transaction, &id)
}

/// Relations in which a resource takes part, in either direction.
pub fn list_for_entity(
    connection: &Connection,
    kind: EntityKind,
    id: &str,
) -> AppResult<Vec<Relation>> {
    validate_id(id, "resource id")?;
    let mut statement = connection.prepare(&format!(
        "SELECT {COLUMNS} FROM relations
         WHERE (source_type = ?1 AND source_id = ?2) OR (target_type = ?1 AND target_id = ?2)
         ORDER BY created_at"
    ))?;
    let rows = statement.query_map(params![kind, id], from_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn set_status(
    transaction: &Transaction<'_>,
    id: &str,
    status: RelationStatus,
) -> AppResult<Relation> {
    validate_id(id, "relation id")?;
    let affected = transaction.execute(
        "UPDATE relations SET status = ?2, updated_at = ?3 WHERE id = ?1",
        params![id, status, now_ms()],
    )?;
    expect_one(affected, ENTITY)?;
    get(transaction, id)
}

pub fn delete(transaction: &Transaction<'_>, id: &str) -> AppResult<()> {
    validate_id(id, "relation id")?;
    let affected = transaction.execute("DELETE FROM relations WHERE id = ?1", [id])?;
    expect_one(affected, ENTITY)
}

/// Removes every relation of a resource that is being deleted permanently. Returns the number removed.
pub fn delete_for_entity(
    transaction: &Transaction<'_>,
    kind: EntityKind,
    id: &str,
) -> AppResult<usize> {
    Ok(transaction.execute(
        "DELETE FROM relations WHERE (source_type = ?1 AND source_id = ?2) OR (target_type = ?1 AND target_id = ?2)",
        params![kind, id],
    )?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::testing::open_temporary;

    fn relation(origin: RelationOrigin, source: &str, target: &str) -> NewRelation {
        NewRelation {
            source: (EntityKind::Note, source.to_owned()),
            target: (EntityKind::Document, target.to_owned()),
            relation_type: "references".to_owned(),
            origin,
            confidence: None,
            provenance: serde_json::json!({}),
        }
    }

    #[test]
    fn user_relations_are_accepted_and_suggestions_wait_for_the_user() {
        let (_dir, database) = open_temporary();
        let (a, b, c) = (new_id(), new_id(), new_id());
        let manual = database
            .write(|tx| create(tx, &relation(RelationOrigin::User, &a, &b)))
            .expect("manual");
        assert_eq!(manual.status, RelationStatus::Accepted);
        let suggested = NewRelation {
            confidence: Some(0.72),
            provenance: serde_json::json!({ "rule": "shared_terms", "terms": ["ne555"] }),
            ..relation(RelationOrigin::Rule, &a, &c)
        };
        let suggestion = database
            .write(|tx| create(tx, &suggested))
            .expect("suggestion");
        assert_eq!(suggestion.status, RelationStatus::Suggested);
        assert_eq!(suggestion.provenance["rule"], "shared_terms");
        let accepted = database
            .write(|tx| set_status(tx, &suggestion.id, RelationStatus::Accepted))
            .expect("accept");
        assert_eq!(accepted.status, RelationStatus::Accepted);
        assert_eq!(
            database
                .read(|conn| list_for_entity(conn, EntityKind::Note, &a))
                .expect("list")
                .len(),
            2
        );
    }

    #[test]
    fn invalid_relations_are_refused() {
        let (_dir, database) = open_temporary();
        let a = new_id();
        let self_relation = NewRelation {
            target: (EntityKind::Note, a.clone()),
            ..relation(RelationOrigin::User, &a, &a)
        };
        assert!(matches!(
            database.write(|tx| create(tx, &self_relation)),
            Err(AppError::InvalidInput(_))
        ));
        let bad_confidence = NewRelation {
            confidence: Some(1.5),
            ..relation(RelationOrigin::Ai, &a, &new_id())
        };
        assert!(matches!(
            database.write(|tx| create(tx, &bad_confidence)),
            Err(AppError::InvalidInput(_))
        ));
        let bad_type = NewRelation {
            relation_type: "DROP TABLE".to_owned(),
            ..relation(RelationOrigin::User, &a, &new_id())
        };
        assert!(matches!(
            database.write(|tx| create(tx, &bad_type)),
            Err(AppError::InvalidInput(_))
        ));
    }

    #[test]
    fn duplicates_are_refused_and_entity_cleanup_removes_everything() {
        let (_dir, database) = open_temporary();
        let (a, b) = (new_id(), new_id());
        database
            .write(|tx| create(tx, &relation(RelationOrigin::User, &a, &b)))
            .expect("first");
        assert!(matches!(
            database.write(|tx| create(tx, &relation(RelationOrigin::User, &a, &b))),
            Err(AppError::NameTaken { .. })
        ));
        let removed = database
            .write(|tx| delete_for_entity(tx, EntityKind::Document, &b))
            .expect("cleanup");
        assert_eq!(removed, 1);
    }
}

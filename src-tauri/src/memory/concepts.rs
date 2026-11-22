//! Concept extraction (specification §10.3), through an interface that does not depend on the provider. An
//! extractor is only available once an AI provider is configured (Phase 9): until then, nothing is extracted
//! and the interface says why. Concepts are stored apart from the content, and each mention keeps its source
//! (item, page, excerpt) and its provenance (provider, model), so that it can always be checked.

use rusqlite::{Connection, OptionalExtension, Transaction, params};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::ItemKind;
use crate::error::{AppError, AppResult};
use crate::repo::text_enum;
use crate::util::{name_key, new_id, now_ms};

const NAME_MAX: usize = 200;
const EXCERPT_MAX: usize = 1_000;
/// Concepts kept for one item.
pub const CONCEPTS_MAX: usize = 200;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum ConceptKind {
    TechnicalTerm,
    Person,
    Organization,
    Technology,
    Subject,
    Method,
    Product,
    Project,
}
text_enum!(ConceptKind {
    TechnicalTerm => "technical_term",
    Person => "person",
    Organization => "organization",
    Technology => "technology",
    Subject => "subject",
    Method => "method",
    Product => "product",
    Project => "project",
});

/// Where a concept was found in the item.
#[derive(Debug, Clone, PartialEq)]
pub struct Mention {
    pub page: Option<u32>,
    pub excerpt: Option<String>,
}

/// A concept returned by an extractor.
#[derive(Debug, Clone, PartialEq)]
pub struct ExtractedConcept {
    pub name: String,
    pub kind: ConceptKind,
    pub confidence: Option<f64>,
    pub mentions: Vec<Mention>,
}

/// An extractor of concepts, whatever its provider.
pub trait ConceptExtractor {
    /// Provider and model, kept with every concept as its provenance.
    fn provenance(&self) -> serde_json::Value;
    fn extract(&self, title: &str, text: &str) -> AppResult<Vec<ExtractedConcept>>;
}

/// Whether concepts can be extracted, and why not.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum ConceptAvailability {
    /// No AI provider is configured: no concept is extracted.
    NoProvider,
}

/// Concept extraction needs an AI provider with its credential; none can be configured before Phase 9.
pub fn availability(_connection: &Connection) -> AppResult<ConceptAvailability> {
    Ok(ConceptAvailability::NoProvider)
}

/// A concept found in an item, with its source.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ConceptMention {
    pub concept_id: String,
    pub name: String,
    pub kind: ConceptKind,
    pub page: Option<i64>,
    pub excerpt: Option<String>,
    pub confidence: Option<f64>,
    #[ts(type = "Record<string, unknown>")]
    pub provenance: serde_json::Value,
}

fn clean(value: &str, max: usize) -> String {
    value
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(max)
        .collect()
}

/// Stores what an extractor found in an item, replacing what it found before. Returns the number of mentions.
pub fn store(
    transaction: &Transaction<'_>,
    kind: ItemKind,
    id: &str,
    concepts: &[ExtractedConcept],
    provenance: &serde_json::Value,
) -> AppResult<usize> {
    if !provenance.is_object() {
        return Err(AppError::InvalidInput(
            "provenance must be an object".to_owned(),
        ));
    }
    transaction.execute(
        "DELETE FROM concept_mentions WHERE entity_type = ?1 AND entity_id = ?2",
        params![kind.entity(), id],
    )?;
    let now = now_ms();
    let mut stored = 0;
    for concept in concepts.iter().take(CONCEPTS_MAX) {
        let name = clean(&concept.name, NAME_MAX);
        if name.is_empty() {
            continue;
        }
        if let Some(confidence) = concept.confidence
            && !(0.0..=1.0).contains(&confidence)
        {
            return Err(AppError::InvalidInput(
                "confidence must be between 0 and 1".to_owned(),
            ));
        }
        let key = name_key(&name);
        let existing: Option<String> = transaction
            .query_row(
                "SELECT id FROM concepts WHERE name_key = ?1 AND kind = ?2",
                params![key, concept.kind],
                |row| row.get(0),
            )
            .optional()?;
        let concept_id = match existing {
            Some(concept_id) => concept_id,
            None => {
                let concept_id = new_id();
                transaction.execute(
                    "INSERT INTO concepts (id, name, name_key, kind, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![concept_id, name, key, concept.kind, now],
                )?;
                concept_id
            }
        };
        let mentions = if concept.mentions.is_empty() {
            vec![Mention {
                page: None,
                excerpt: None,
            }]
        } else {
            concept.mentions.clone()
        };
        for mention in mentions {
            transaction.execute(
                "INSERT INTO concept_mentions (id, concept_id, entity_type, entity_id, page, excerpt, confidence,
                                               provenance_json, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![
                    new_id(),
                    concept_id,
                    kind.entity(),
                    id,
                    mention.page.filter(|page| *page >= 1),
                    mention.excerpt.as_deref().map(|excerpt| clean(excerpt, EXCERPT_MAX)),
                    concept.confidence,
                    provenance.to_string(),
                    now
                ],
            )?;
            stored += 1;
        }
    }
    // Concepts no longer mentioned anywhere are removed.
    transaction.execute(
        "DELETE FROM concepts WHERE NOT EXISTS (SELECT 1 FROM concept_mentions m WHERE m.concept_id = concepts.id)",
        [],
    )?;
    Ok(stored)
}

/// Runs an extractor on an item and stores what it found.
pub fn extract_into(
    transaction: &Transaction<'_>,
    extractor: &dyn ConceptExtractor,
    kind: ItemKind,
    id: &str,
) -> AppResult<usize> {
    let item = super::load(transaction, kind, id)?.ok_or(AppError::NotFound { entity: "item" })?;
    let concepts = extractor.extract(&item.title, &item.text)?;
    store(transaction, kind, id, &concepts, &extractor.provenance())
}

/// The concepts mentioned in an item.
pub fn mentions(
    connection: &Connection,
    kind: ItemKind,
    id: &str,
) -> AppResult<Vec<ConceptMention>> {
    let mut statement = connection.prepare(
        "SELECT c.id, c.name, c.kind, m.page, m.excerpt, m.confidence, m.provenance_json
         FROM concept_mentions m JOIN concepts c ON c.id = m.concept_id
         WHERE m.entity_type = ?1 AND m.entity_id = ?2 ORDER BY c.name, m.page",
    )?;
    let rows = statement.query_map(params![kind.entity(), id], |row| {
        Ok(ConceptMention {
            concept_id: row.get(0)?,
            name: row.get(1)?,
            kind: row.get(2)?,
            page: row.get(3)?,
            excerpt: row.get(4)?,
            confidence: row.get(5)?,
            provenance: crate::repo::json_value(&row.get::<_, String>(6)?),
        })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

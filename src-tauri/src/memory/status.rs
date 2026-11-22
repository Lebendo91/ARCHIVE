//! What the engine knows of an item, as the interface shows it: the status of each stage of the pipeline
//! (specification §10.1), the description of its content, its distinctive terms and its concepts.

use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::ItemKind;
use super::analysis::{self, Term};
use super::concepts::{self, ConceptAvailability, ConceptMention};
use super::normalize::{self, ContentProfile};
use super::queue::{self, JobStage, QueueCounts};
use crate::error::{AppError, AppResult};
use crate::repo::documents::ProcessingStatus;
use crate::repo::text_enum;

/// Stages of the pipeline (specification §10.1).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum PipelineStage {
    Import,
    Extraction,
    Normalization,
    Indexing,
    Analysis,
    Relations,
}
text_enum!(PipelineStage {
    Import => "import",
    Extraction => "extraction",
    Normalization => "normalization",
    Indexing => "indexing",
    Analysis => "analysis",
    Relations => "relations",
});

impl From<JobStage> for PipelineStage {
    fn from(stage: JobStage) -> Self {
        match stage {
            JobStage::Normalization => PipelineStage::Normalization,
            JobStage::Analysis => PipelineStage::Analysis,
            JobStage::Relations => PipelineStage::Relations,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct StageState {
    pub stage: PipelineStage,
    pub status: ProcessingStatus,
    /// Failures of the stage so far (background stages).
    pub attempts: i64,
    /// Stable code of the last failure, or of the problem found by the extraction.
    pub issue: Option<String>,
    /// When a failed stage is tried again.
    pub retry_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct MemoryItem {
    pub stages: Vec<StageState>,
    pub profile: Option<ContentProfile>,
    pub terms: Vec<Term>,
    pub concepts: Vec<ConceptMention>,
    pub concept_extraction: ConceptAvailability,
}

fn background(jobs: &[queue::JobState], stage: JobStage) -> StageState {
    match jobs.iter().find(|job| job.stage == stage) {
        Some(job) => StageState {
            stage: stage.into(),
            status: job.status,
            attempts: job.attempts,
            issue: job.last_error.clone(),
            retry_at: (job.status == ProcessingStatus::Failed).then_some(job.run_after),
        },
        // Not queued yet (the engine starts on it): waiting.
        None => StageState {
            stage: stage.into(),
            status: ProcessingStatus::Pending,
            attempts: 0,
            issue: None,
            retry_at: None,
        },
    }
}

fn indexed(connection: &Connection, kind: ItemKind, id: &str) -> AppResult<bool> {
    Ok(connection
        .query_row(
            "SELECT 1 FROM search_entries WHERE entity_type = ?1 AND entity_id = ?2 LIMIT 1",
            params![kind.entity(), id],
            |_| Ok(()),
        )
        .optional()?
        .is_some())
}

fn done(stage: PipelineStage, done: bool) -> StageState {
    StageState {
        stage,
        status: if done {
            ProcessingStatus::Completed
        } else {
            ProcessingStatus::Pending
        },
        attempts: 0,
        issue: None,
        retry_at: None,
    }
}

/// The status of every stage of an item, in the order of the pipeline. A note is written, not imported: it
/// has no import or extraction stage.
pub fn stages(connection: &Connection, kind: ItemKind, id: &str) -> AppResult<Vec<StageState>> {
    let jobs = queue::states(connection, kind, id)?;
    let mut stages = Vec::with_capacity(6);
    if kind == ItemKind::Document {
        let (status, metadata): (ProcessingStatus, String) = connection
            .query_row(
                "SELECT indexing_status, metadata_json FROM documents WHERE id = ?1",
                [id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?
            .ok_or(AppError::NotFound { entity: "document" })?;
        let metadata = crate::repo::json_value(&metadata);
        stages.push(done(PipelineStage::Import, true));
        stages.push(StageState {
            stage: PipelineStage::Extraction,
            status,
            attempts: 0,
            issue: metadata
                .get("extractionIssue")
                .and_then(serde_json::Value::as_str)
                .map(str::to_owned),
            retry_at: None,
        });
    } else if !super::exists(connection, kind, id)? {
        return Err(AppError::NotFound { entity: "note" });
    }
    stages.push(background(&jobs, JobStage::Normalization));
    stages.push(done(
        PipelineStage::Indexing,
        indexed(connection, kind, id)?,
    ));
    stages.push(background(&jobs, JobStage::Analysis));
    stages.push(background(&jobs, JobStage::Relations));
    Ok(stages)
}

pub fn item(connection: &Connection, kind: ItemKind, id: &str) -> AppResult<MemoryItem> {
    Ok(MemoryItem {
        stages: stages(connection, kind, id)?,
        profile: normalize::get(connection, kind, id)?,
        terms: analysis::get(connection, kind, id)?,
        concepts: concepts::mentions(connection, kind, id)?,
        concept_extraction: concepts::availability(connection)?,
    })
}

/// The processing of the whole knowledge base, at a glance.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct MemoryOverview {
    pub jobs: QueueCounts,
    /// Relations suggested by the engine and waiting for the user.
    pub suggestions: i64,
}

pub fn overview(connection: &Connection) -> AppResult<MemoryOverview> {
    Ok(MemoryOverview {
        jobs: queue::counts(connection)?,
        suggestions: connection.query_row(
            "SELECT count(*) FROM relations WHERE status = 'suggested'",
            [],
            |row| row.get(0),
        )?,
    })
}

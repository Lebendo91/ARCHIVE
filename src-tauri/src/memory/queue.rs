//! Persistent queue of the background stages (normalization, analysis, relationships): one job per item and
//! stage, which survives restarts (specification §10.1, ARCHITECTURE.md §8).
//!
//! A change of an item queues its normalization, which queues its analysis once done, which queues its
//! relationships. Asking again for a stage already queued only raises its generation and moves its time: a
//! note saved at every pause of the typing is processed once the typing stops. A failed job is tried again
//! later, up to [`MAX_ATTEMPTS`] times; then it needs the user's attention, and a new try on request.

use std::cell::Cell;

use rusqlite::{Connection, OptionalExtension, Row, Transaction, params};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::ItemKind;
use crate::error::{AppError, AppResult};
use crate::repo::EntityKind;
use crate::repo::documents::ProcessingStatus;
use crate::repo::text_enum;
use crate::util::now_ms;

/// Failures after which a job waits for the user instead of being tried again.
pub const MAX_ATTEMPTS: i64 = 5;
/// Delay before a first new try; it is multiplied by four at each failure (30 s, 2 min, 8 min, 32 min).
const RETRY_DELAY_MS: i64 = 30_000;
/// A note is saved while it is typed: it is processed once the typing has paused this long.
pub const NOTE_DELAY_MS: i64 = 15_000;

/// Stages run in the background.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum JobStage {
    Normalization,
    Analysis,
    Relations,
}
text_enum!(JobStage {
    Normalization => "normalization",
    Analysis => "analysis",
    Relations => "relations",
});

impl JobStage {
    /// The stage queued once this one is done.
    pub fn next(self) -> Option<Self> {
        match self {
            JobStage::Normalization => Some(JobStage::Analysis),
            JobStage::Analysis => Some(JobStage::Relations),
            JobStage::Relations => None,
        }
    }
}

/// A job taken by the worker.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClaimedJob {
    pub kind: ItemKind,
    pub id: String,
    pub stage: JobStage,
    pub generation: i64,
    pub attempts: i64,
}

/// State of a job, as the interface shows it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct JobState {
    pub stage: JobStage,
    pub status: ProcessingStatus,
    pub attempts: i64,
    /// Stable code of the last failure.
    pub last_error: Option<String>,
    /// Time of the next try of a failed job.
    pub run_after: i64,
    pub updated_at: i64,
}

thread_local! {
    /// Whether the write transaction running on this thread queued a job (the worker is woken after commit).
    static QUEUED: Cell<bool> = const { Cell::new(false) };
}

/// Whether the transaction that just committed on this thread queued work; clears the flag.
pub fn take_queued() -> bool {
    QUEUED.with(|queued| queued.replace(false))
}

/// Forgets the flag of a transaction that does not commit.
pub fn discard_queued() {
    QUEUED.with(|queued| queued.set(false));
}

fn entity_of(kind: ItemKind) -> EntityKind {
    kind.entity()
}

/// Queues a stage of an item, to run from `run_after` on (or moves a job already queued).
pub fn enqueue(
    transaction: &Transaction<'_>,
    kind: ItemKind,
    id: &str,
    stage: JobStage,
    run_after: i64,
) -> AppResult<()> {
    transaction.execute(
        "INSERT INTO processing_jobs (entity_type, entity_id, stage, status, generation, attempts, last_error,
                                      run_after, updated_at)
         VALUES (?1, ?2, ?3, 'pending', 1, 0, NULL, ?4, ?5)
         ON CONFLICT (entity_type, entity_id, stage) DO UPDATE SET
           status = 'pending', generation = generation + 1, attempts = 0, last_error = NULL,
           run_after = excluded.run_after, updated_at = excluded.updated_at",
        params![entity_of(kind), id, stage, run_after, now_ms()],
    )?;
    QUEUED.with(|queued| queued.set(true));
    Ok(())
}

/// Queues the processing of the documents and notes changed by a write transaction (marked for the search
/// index), and forgets what was derived from those deleted permanently.
pub fn on_changed(
    transaction: &Transaction<'_>,
    changed: &[(EntityKind, String)],
) -> AppResult<()> {
    let now = now_ms();
    for (entity, id) in changed {
        let Some(kind) = ItemKind::from_entity(*entity) else {
            continue;
        };
        if super::exists(transaction, kind, id)? {
            let delay = if kind == ItemKind::Note {
                NOTE_DELAY_MS
            } else {
                0
            };
            enqueue(transaction, kind, id, JobStage::Normalization, now + delay)?;
        } else {
            super::forget(transaction, kind, id)?;
        }
    }
    Ok(())
}

fn claimed(row: &Row<'_>) -> rusqlite::Result<(EntityKind, String, JobStage, i64, i64)> {
    Ok((
        row.get(0)?,
        row.get(1)?,
        row.get(2)?,
        row.get(3)?,
        row.get(4)?,
    ))
}

/// Takes the job due first, if any, and marks it as being processed.
pub fn claim_next(transaction: &Transaction<'_>, now: i64) -> AppResult<Option<ClaimedJob>> {
    let found = transaction
        .query_row(
            "SELECT entity_type, entity_id, stage, generation, attempts FROM processing_jobs
             WHERE status IN ('pending', 'failed') AND run_after <= ?1
             ORDER BY run_after, entity_type, entity_id, stage LIMIT 1",
            [now],
            claimed,
        )
        .optional()?;
    let Some((entity, id, stage, generation, attempts)) = found else {
        return Ok(None);
    };
    let kind = ItemKind::from_entity(entity)
        .ok_or_else(|| AppError::Internal(format!("job for a {} entity", entity.as_str())))?;
    transaction.execute(
        "UPDATE processing_jobs SET status = 'processing', updated_at = ?4
         WHERE entity_type = ?1 AND entity_id = ?2 AND stage = ?3",
        params![entity, id, stage, now],
    )?;
    Ok(Some(ClaimedJob {
        kind,
        id,
        stage,
        generation,
        attempts,
    }))
}

/// Records a job as done and queues the next stage. A job asked for again while it ran (newer generation)
/// stays queued: it runs again on the newer data. Returns whether the job was recorded as done.
pub fn complete(transaction: &Transaction<'_>, job: &ClaimedJob, now: i64) -> AppResult<bool> {
    let affected = transaction.execute(
        "UPDATE processing_jobs SET status = 'completed', attempts = 0, last_error = NULL, updated_at = ?5
         WHERE entity_type = ?1 AND entity_id = ?2 AND stage = ?3 AND generation = ?4 AND status = 'processing'",
        params![entity_of(job.kind), job.id, job.stage, job.generation, now],
    )?;
    if affected == 0 {
        return Ok(false);
    }
    if let Some(next) = job.stage.next() {
        enqueue(transaction, job.kind, &job.id, next, now)?;
    }
    Ok(true)
}

/// Records a failure: the job is tried again later, or waits for the user after [`MAX_ATTEMPTS`] failures.
pub fn fail(
    transaction: &Transaction<'_>,
    job: &ClaimedJob,
    code: &str,
    now: i64,
) -> AppResult<()> {
    let attempts = job.attempts + 1;
    let (status, run_after) = if attempts >= MAX_ATTEMPTS {
        (ProcessingStatus::NeedsAttention, now)
    } else {
        let factor = 4_i64.pow(u32::try_from(attempts - 1).unwrap_or(0));
        (ProcessingStatus::Failed, now + RETRY_DELAY_MS * factor)
    };
    let code: String = code.chars().take(200).collect();
    transaction.execute(
        "UPDATE processing_jobs SET status = ?5, attempts = ?6, last_error = ?7, run_after = ?8, updated_at = ?9
         WHERE entity_type = ?1 AND entity_id = ?2 AND stage = ?3 AND generation = ?4 AND status = 'processing'",
        params![
            entity_of(job.kind),
            job.id,
            job.stage,
            job.generation,
            status,
            attempts,
            if code.is_empty() { "internal".to_owned() } else { code },
            run_after,
            now
        ],
    )?;
    Ok(())
}

/// Jobs left « processing » by a stop of the application are queued again.
pub fn reset_interrupted(transaction: &Transaction<'_>) -> AppResult<usize> {
    Ok(transaction.execute(
        "UPDATE processing_jobs SET status = 'pending' WHERE status = 'processing'",
        [],
    )?)
}

/// When the next job is due, if any job waits.
pub fn next_due(connection: &Connection) -> AppResult<Option<i64>> {
    Ok(connection.query_row(
        "SELECT min(run_after) FROM processing_jobs WHERE status IN ('pending', 'failed')",
        [],
        |row| row.get(0),
    )?)
}

/// The jobs of an item.
pub fn states(connection: &Connection, kind: ItemKind, id: &str) -> AppResult<Vec<JobState>> {
    let mut statement = connection.prepare(
        "SELECT stage, status, attempts, last_error, run_after, updated_at FROM processing_jobs
         WHERE entity_type = ?1 AND entity_id = ?2",
    )?;
    let rows = statement.query_map(params![entity_of(kind), id], |row| {
        Ok(JobState {
            stage: row.get(0)?,
            status: row.get(1)?,
            attempts: row.get(2)?,
            last_error: row.get(3)?,
            run_after: row.get(4)?,
            updated_at: row.get(5)?,
        })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// Queues again the failed stages of an item (or all of them when `everything`). Returns the number queued.
pub fn retry(
    transaction: &Transaction<'_>,
    kind: ItemKind,
    id: &str,
    everything: bool,
) -> AppResult<usize> {
    let now = now_ms();
    if everything {
        enqueue(transaction, kind, id, JobStage::Normalization, now)?;
        return Ok(1);
    }
    let failed: Vec<JobStage> = states(transaction, kind, id)?
        .into_iter()
        .filter(|job| {
            matches!(
                job.status,
                ProcessingStatus::Failed | ProcessingStatus::NeedsAttention
            )
        })
        .map(|job| job.stage)
        .collect();
    for stage in &failed {
        enqueue(transaction, kind, id, *stage, now)?;
    }
    Ok(failed.len())
}

/// Queues again every job that needs attention or failed. Returns the number queued.
pub fn retry_all(transaction: &Transaction<'_>) -> AppResult<usize> {
    let now = now_ms();
    let affected = transaction.execute(
        "UPDATE processing_jobs SET status = 'pending', generation = generation + 1, attempts = 0,
                                    last_error = NULL, run_after = ?1, updated_at = ?1
         WHERE status IN ('failed', 'needs_attention')",
        [now],
    )?;
    if affected > 0 {
        QUEUED.with(|queued| queued.set(true));
    }
    Ok(affected)
}

/// Number of jobs in each state, for the overview of the processing.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct QueueCounts {
    pub pending: i64,
    pub processing: i64,
    pub completed: i64,
    pub failed: i64,
    pub needs_attention: i64,
}

pub fn counts(connection: &Connection) -> AppResult<QueueCounts> {
    let mut counts = QueueCounts::default();
    let mut statement =
        connection.prepare("SELECT status, count(*) FROM processing_jobs GROUP BY status")?;
    let rows = statement.query_map([], |row| {
        Ok((row.get::<_, ProcessingStatus>(0)?, row.get::<_, i64>(1)?))
    })?;
    for row in rows {
        let (status, count) = row?;
        match status {
            ProcessingStatus::Pending => counts.pending = count,
            ProcessingStatus::Processing => counts.processing = count,
            ProcessingStatus::Completed => counts.completed = count,
            ProcessingStatus::Failed => counts.failed = count,
            ProcessingStatus::NeedsAttention => counts.needs_attention = count,
        }
    }
    Ok(counts)
}

//! The worker of the memory engine: a background thread that runs the queued jobs one at a time, never on the
//! interface's thread. Each job reads what it needs, computes, then writes its result and its completion in one
//! short transaction, so that the commands of the interface never wait long for the database. The thread
//! sleeps until the next job is due, or until a write transaction queues one ([`wake`]).

use std::sync::OnceLock;
use std::sync::mpsc::{Receiver, RecvTimeoutError, SyncSender, sync_channel};
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use ts_rs::TS;

use super::queue::{self, ClaimedJob, JobStage};
use super::{ItemKind, analysis, normalize, relate};
use crate::db::Database;
use crate::error::AppResult;
use crate::state::AppState;
use crate::util::now_ms;

/// Event sent to the interface when the engine changed what it knows of an item.
pub const EVENT: &str = "memory:changed";
/// Longest sleep without anything due (also the wait in safe mode).
const IDLE: Duration = Duration::from_secs(60);
/// Pause between two jobs of a long queue, so that the processing stays in the background.
const BETWEEN_JOBS: Duration = Duration::from_millis(2);

static WAKE: OnceLock<SyncSender<()>> = OnceLock::new();

/// Payload of [`EVENT`].
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct MemoryChanged {
    pub kind: ItemKind,
    pub id: String,
    pub stage: JobStage,
}

/// Wakes the worker: a job was queued.
pub fn wake() {
    if let Some(sender) = WAKE.get() {
        // A wake already waiting is enough.
        let _ = sender.try_send(());
    }
}

fn error_code(error: &crate::error::AppError) -> String {
    serde_json::to_value(error.code())
        .ok()
        .and_then(|value| value.as_str().map(str::to_owned))
        .unwrap_or_else(|| "internal".to_owned())
}

/// Runs a job: reads, computes, then records the result with the completion of the job.
fn run(database: &Database, job: &ClaimedJob) -> AppResult<()> {
    let (kind, id) = (job.kind, job.id.as_str());
    match job.stage {
        JobStage::Normalization => {
            let profile = database
                .read(|connection| super::load(connection, kind, id))?
                .map(|item| normalize::profile(kind, &item));
            database.write(|transaction| {
                if let Some(profile) = &profile
                    && super::exists(transaction, kind, id)?
                {
                    normalize::store(transaction, kind, id, profile)?;
                }
                queue::complete(transaction, job, now_ms())?;
                Ok(())
            })
        }
        JobStage::Analysis => {
            let terms = database.read(|connection| match super::load(connection, kind, id)? {
                Some(item) => analysis::distinctive_terms(connection, &item).map(Some),
                None => Ok(None),
            })?;
            database.write(|transaction| {
                if let Some(terms) = &terms
                    && super::exists(transaction, kind, id)?
                {
                    analysis::store(transaction, kind, id, terms)?;
                }
                queue::complete(transaction, job, now_ms())?;
                Ok(())
            })
        }
        JobStage::Relations => database.write(|transaction| {
            relate::suggest(transaction, kind, id)?;
            queue::complete(transaction, job, now_ms())?;
            Ok(())
        }),
    }
}

/// Runs the job due first, if any. A failure is recorded on the job (to be tried again, or to wait for the
/// user), never propagated: only a failure to reach the database is.
pub fn process_next(database: &Database, now: i64) -> AppResult<Option<MemoryChanged>> {
    let Some(job) = database.write(|transaction| queue::claim_next(transaction, now))? else {
        return Ok(None);
    };
    if let Err(error) = run(database, &job) {
        // The kind of failure only: never the content of the item.
        log::warn!(
            "memory engine: {} of a {} failed ({}), attempt {}",
            job.stage.as_str(),
            job.kind.entity().as_str(),
            error_code(&error),
            job.attempts + 1
        );
        database
            .write(|transaction| queue::fail(transaction, &job, &error_code(&error), now_ms()))?;
    }
    Ok(Some(MemoryChanged {
        kind: job.kind,
        id: job.id,
        stage: job.stage,
    }))
}

/// Runs every job due at `now`, one after the other (tests, and the native validation of the queue).
pub fn process_all(database: &Database, now: i64) -> AppResult<usize> {
    let mut processed = 0;
    while process_next(database, now)?.is_some() {
        processed += 1;
    }
    Ok(processed)
}

fn wait_for_next(database: &Database) -> Duration {
    match database.read(queue::next_due) {
        Ok(Some(due)) => {
            let delay = u64::try_from(due.saturating_sub(now_ms())).unwrap_or(0);
            Duration::from_millis(delay).min(IDLE)
        }
        Ok(None) | Err(_) => IDLE,
    }
}

fn work(app: &AppHandle, wake: &Receiver<()>) {
    loop {
        let state = app.state::<AppState>();
        let wait = match state.database() {
            Ok(database) => match process_next(&database, now_ms()) {
                Ok(Some(changed)) => {
                    if let Err(error) = app.emit(EVENT, &changed) {
                        log::warn!("memory engine: event not sent: {error}");
                    }
                    std::thread::sleep(BETWEEN_JOBS);
                    continue;
                }
                Ok(None) => wait_for_next(&database),
                Err(error) => {
                    log::error!("memory engine: queue unavailable: {error}");
                    Duration::from_secs(10)
                }
            },
            // Safe mode: the database may come back after a retry.
            Err(_) => IDLE,
        };
        match wake.recv_timeout(wait) {
            Ok(()) | Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => return,
        }
    }
}

/// Starts the worker (once).
pub fn start(app: AppHandle) {
    let (sender, receiver) = sync_channel(1);
    if WAKE.set(sender).is_err() {
        return;
    }
    let spawned = std::thread::Builder::new()
        .name("memory-worker".to_owned())
        .spawn(move || work(&app, &receiver));
    if let Err(error) = spawned {
        log::error!("memory engine: worker not started: {error}");
    }
}

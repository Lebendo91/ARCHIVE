//! Library import (specification §7.2): file identification, text extraction and the import pipeline.

pub mod detect;
pub mod extract;
pub mod pipeline;

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, PoisonError};
use std::time::{Duration, Instant};

use crate::error::{AppError, AppResult};

/// How long the files of a drag and drop wait for the interface to import them.
const DROP_VALIDITY: Duration = Duration::from_secs(120);

/// State of imports, shared by the commands and the window events.
///
/// Dropped files are recorded here by the core itself, from the native drag-and-drop event: the import
/// command never receives a path from the interface (ARCHITECTURE, Phase 4 decisions).
#[derive(Default)]
pub struct ImportState {
    running: AtomicBool,
    cancel: Arc<AtomicBool>,
    last_drop: Mutex<Option<(Vec<PathBuf>, Instant)>>,
}

/// Marks an import as running for its lifetime; a second import is refused meanwhile.
pub struct RunningImport<'a> {
    state: &'a ImportState,
}

impl Drop for RunningImport<'_> {
    fn drop(&mut self) {
        self.state.running.store(false, Ordering::SeqCst);
    }
}

impl ImportState {
    pub fn record_drop(&self, paths: Vec<PathBuf>) {
        *self
            .last_drop
            .lock()
            .unwrap_or_else(PoisonError::into_inner) = Some((paths, Instant::now()));
    }

    /// The files of the latest drag and drop, if recent. They can be imported only once.
    pub fn take_drop(&self) -> Option<Vec<PathBuf>> {
        let mut last = self
            .last_drop
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        match last.take() {
            Some((paths, at)) if at.elapsed() <= DROP_VALIDITY => Some(paths),
            _ => None,
        }
    }

    pub fn start(&self) -> AppResult<RunningImport<'_>> {
        if self.running.swap(true, Ordering::SeqCst) {
            return Err(AppError::InUse {
                entity: "import",
                reason: "another import is running".to_owned(),
            });
        }
        self.cancel.store(false, Ordering::SeqCst);
        Ok(RunningImport { state: self })
    }

    pub fn cancel_flag(&self) -> Arc<AtomicBool> {
        Arc::clone(&self.cancel)
    }

    pub fn request_cancel(&self) {
        self.cancel.store(true, Ordering::SeqCst);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dropped_files_can_be_taken_once() {
        let state = ImportState::default();
        assert_eq!(state.take_drop(), None);
        state.record_drop(vec![PathBuf::from("a.pdf")]);
        assert_eq!(state.take_drop(), Some(vec![PathBuf::from("a.pdf")]));
        assert_eq!(state.take_drop(), None);
    }

    #[test]
    fn only_one_import_runs_at_a_time() {
        let state = ImportState::default();
        state.request_cancel();
        let running = state.start().expect("first import");
        assert!(
            !state.cancel_flag().load(Ordering::SeqCst),
            "a new import resets cancellation"
        );
        assert!(state.start().is_err());
        drop(running);
        assert!(state.start().is_ok());
    }
}

//! Location of the application data (ARCHITECTURE.md §7).
//!
//! Everything lives in the local application data directory (`%LOCALAPPDATA%\<identifier>` on Windows):
//! large document collections must not roam with the user profile. The `ARCHIVE_DATA_DIR` environment
//! variable overrides the location for tests and development.

use std::fs;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager, Runtime};

use crate::error::{AppError, AppResult};

pub const DATA_DIR_OVERRIDE: &str = "ARCHIVE_DATA_DIR";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AppPaths {
    pub data_dir: PathBuf,
    pub database_file: PathBuf,
    pub files_dir: PathBuf,
    pub backups_dir: PathBuf,
    pub tmp_dir: PathBuf,
    pub logs_dir: PathBuf,
    /// A restoration prepared by the user, applied at the next start before the database opens.
    pub restore_dir: PathBuf,
}

impl AppPaths {
    pub fn from_data_dir(data_dir: impl Into<PathBuf>) -> Self {
        let data_dir = data_dir.into();
        Self {
            database_file: data_dir.join("archive.db"),
            files_dir: data_dir.join("files"),
            backups_dir: data_dir.join("backups"),
            tmp_dir: data_dir.join("tmp"),
            logs_dir: data_dir.join("logs"),
            restore_dir: data_dir.join("restore"),
            data_dir,
        }
    }

    pub fn resolve<R: Runtime>(app: &AppHandle<R>) -> AppResult<Self> {
        if let Some(dir) = std::env::var_os(DATA_DIR_OVERRIDE).filter(|value| !value.is_empty()) {
            return Ok(Self::from_data_dir(PathBuf::from(dir)));
        }
        let dir = app.path().app_local_data_dir().map_err(|error| {
            AppError::Internal(format!("cannot resolve the data directory: {error}"))
        })?;
        Ok(Self::from_data_dir(dir))
    }

    /// Creates the data directories that do not exist yet.
    pub fn ensure_directories(&self) -> AppResult<()> {
        for dir in [
            &self.data_dir,
            &self.files_dir,
            &self.backups_dir,
            &self.tmp_dir,
            &self.logs_dir,
        ] {
            fs::create_dir_all(dir)?;
        }
        Ok(())
    }

    pub fn display(path: &Path) -> String {
        path.to_string_lossy().into_owned()
    }
}

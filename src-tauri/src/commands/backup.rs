//! Backup commands (specification §16): the backup is written where the user chooses in a dialog opened by
//! the core, verified on request, and restored after a confirmation, at the next start.

use serde::Serialize;
use tauri::ipc::Channel;
use tauri::{AppHandle, State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;
use ts_rs::TS;

use super::blocking;
use crate::backup::{self, BackupCheck, BackupProgress, BackupRecord};
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::util::now_ms;

/// The history of the backups, and where and when the last one was made (specification §15.3).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct BackupOverview {
    pub backups: Vec<BackupRecord>,
    #[ts(type = "number | null")]
    pub last_backup_at: Option<i64>,
    /// Folder of the last backup.
    pub location: Option<String>,
}

/// The date (UTC) of a timestamp, for the name of a backup: `2026-11-23-1830`.
fn stamp(millis: i64) -> String {
    let days = millis.div_euclid(86_400_000);
    let seconds = millis.rem_euclid(86_400_000) / 1000;
    // Days to civil date (H. Hinnant's algorithm).
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!(
        "{year:04}-{month:02}-{day:02}-{:02}{:02}",
        seconds / 3600,
        (seconds % 3600) / 60
    )
}

#[tauri::command]
pub async fn backup_overview(state: State<'_, AppState>) -> AppResult<BackupOverview> {
    let database = state.database()?;
    blocking("backup_overview", move || {
        let backups = database.read(backup::list)?;
        let last = backups.iter().max_by_key(|record| record.created_at);
        Ok(BackupOverview {
            last_backup_at: last.map(|record| record.created_at),
            location: last.and_then(|record| {
                std::path::Path::new(&record.path)
                    .parent()
                    .map(|folder| folder.display().to_string())
            }),
            backups,
        })
    })
    .await
}

/// Creates a backup where the user chooses. `None` when the dialog is cancelled.
#[tauri::command]
pub async fn backup_create(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, AppState>,
    on_progress: Channel<BackupProgress>,
) -> AppResult<Option<BackupRecord>> {
    let database = state.database()?;
    let paths = state.paths.clone();
    let file_name = format!("ARCHIVE-sauvegarde-{}.zip", stamp(now_ms()));
    let destination = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_parent(&window)
            .set_file_name(&file_name)
            .add_filter("ZIP", &["zip"])
            .blocking_save_file()
    })
    .await
    .map_err(|error| AppError::Internal(format!("save dialog failed: {error}")))?;
    let Some(mut destination) = destination.and_then(|file| file.into_path().ok()) else {
        return Ok(None);
    };
    if destination
        .extension()
        .is_none_or(|extension| !extension.eq_ignore_ascii_case("zip"))
    {
        destination.set_extension("zip");
    }
    blocking("backup_create", move || {
        let started = std::time::Instant::now();
        let summary = backup::create(&database, &paths, &destination, |progress| {
            let _ = on_progress.send(progress);
        })?;
        log::info!(
            "backup created: {} files, {} bytes, in {} ms",
            summary.contents.files,
            summary.size_bytes,
            started.elapsed().as_millis()
        );
        let record = database
            .write(|transaction| backup::remember(transaction, &destination, &summary, None))?;
        Ok(Some(record))
    })
    .await
}

/// Verifies a backup of the history: entries, fingerprints, database.
#[tauri::command]
pub async fn backup_verify(state: State<'_, AppState>, id: String) -> AppResult<BackupCheck> {
    let database = state.database()?;
    let scratch = state.paths.tmp_dir.clone();
    blocking("backup_verify", move || {
        let record = database.read(|connection| backup::get(connection, &id))?;
        let path = std::path::PathBuf::from(&record.path);
        if !path.is_file() {
            return Err(AppError::NotFound {
                entity: "backup file",
            });
        }
        let check = backup::verify(&path, &scratch, None)?;
        log::info!(
            "backup {} verified: {}",
            record.id,
            if check.valid() { "valid" } else { "invalid" }
        );
        database
            .write(|transaction| backup::mark_verified(transaction, &record.id, check.valid()))?;
        Ok(check)
    })
    .await
}

/// Opens a backup file chosen by the user (made elsewhere, or moved), verifies it and adds it to the history.
#[tauri::command]
pub async fn backup_open_file(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, AppState>,
) -> AppResult<Option<(Option<BackupRecord>, BackupCheck)>> {
    let database = state.database()?;
    let scratch = state.paths.tmp_dir.clone();
    let picked = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_parent(&window)
            .add_filter("ZIP", &["zip"])
            .blocking_pick_file()
    })
    .await
    .map_err(|error| AppError::Internal(format!("file dialog failed: {error}")))?;
    let Some(path) = picked.and_then(|file| file.into_path().ok()) else {
        return Ok(None);
    };
    blocking("backup_open_file", move || {
        let check = backup::verify(&path, &scratch, None)?;
        let record = match &check.summary {
            Some(summary) => Some(database.write(|transaction| {
                backup::remember(transaction, &path, summary, Some(check.valid()))
            })?),
            None => None,
        };
        Ok(Some((record, check)))
    })
    .await
}

/// Prepares the restoration of a backup, then restarts ARCHIVE, which applies it before opening the database.
/// The interface asks for confirmation first. Returns the problems when the backup cannot be restored.
#[tauri::command]
pub async fn backup_restore(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> AppResult<BackupCheck> {
    let database = state.database()?;
    let paths = state.paths.clone();
    let check = blocking("backup_restore", move || {
        let record = database.read(|connection| backup::get(connection, &id))?;
        let path = std::path::PathBuf::from(&record.path);
        if !path.is_file() {
            return Err(AppError::NotFound {
                entity: "backup file",
            });
        }
        let history = database.read(backup::list)?;
        let check = backup::stage_restore(&paths, &path, &history)?;
        if check.valid() {
            log::info!(
                "restoration of backup {} prepared: ARCHIVE restarts to apply it",
                record.id
            );
        }
        Ok(check)
    })
    .await?;
    if check.valid() {
        app.restart();
    }
    Ok(check)
}

/// Removes a backup from the history; the file itself is not touched.
#[tauri::command]
pub async fn backup_forget(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let database = state.database()?;
    blocking("backup_forget", move || {
        database.write(|transaction| {
            let record = backup::get(transaction, &id)?;
            transaction.execute("DELETE FROM backups WHERE id = ?1", [&record.id])?;
            Ok(())
        })
    })
    .await
}

/// Shows a backup in the file manager.
#[tauri::command]
pub async fn backup_reveal(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let database = state.database()?;
    blocking("backup_reveal", move || {
        let record = database.read(|connection| backup::get(connection, &id))?;
        let path = std::path::PathBuf::from(&record.path);
        if !path.is_file() {
            return Err(AppError::NotFound {
                entity: "backup file",
            });
        }
        tauri_plugin_opener::reveal_item_in_dir(&path)
            .map_err(|error| AppError::Internal(format!("cannot show the backup: {error}")))
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::stamp;

    #[test]
    fn backup_names_carry_the_date() {
        assert_eq!(stamp(0), "1970-01-01-0000");
        assert_eq!(stamp(1_795_458_600_000), "2026-11-23-1830");
        assert_eq!(stamp(951_782_400_000), "2000-02-29-0000");
    }
}

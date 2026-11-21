//! Log file in the data directory (`logs/archive.log`, rotated). Logs never contain document content or
//! secrets (specification §18.4).

use tauri::Runtime;
use tauri::plugin::TauriPlugin;
use tauri_plugin_log::{RotationStrategy, Target, TargetKind};

use crate::paths::AppPaths;

const MAX_LOG_FILE_BYTES: u128 = 5 * 1024 * 1024;
const KEPT_LOG_FILES: usize = 5;

pub fn plugin<R: Runtime>(paths: &AppPaths) -> TauriPlugin<R> {
    let mut builder = tauri_plugin_log::Builder::new()
        .clear_targets()
        .target(Target::new(TargetKind::Folder {
            path: paths.logs_dir.clone(),
            file_name: Some("archive".to_owned()),
        }))
        .level(log::LevelFilter::Info)
        .max_file_size(MAX_LOG_FILE_BYTES)
        .rotation_strategy(RotationStrategy::KeepSome(KEPT_LOG_FILES));
    if cfg!(debug_assertions) {
        builder = builder.target(Target::new(TargetKind::Stdout));
    }
    builder.build()
}

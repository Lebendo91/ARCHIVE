//! Application identity, build information and startup status.

use serde::Serialize;
use tauri::State;
use ts_rs::TS;

use crate::state::{AppState, AppStatus};

/// Product name, as displayed in the interface.
pub const PRODUCT_NAME: &str = "ARCHIVE";

/// Version and build information displayed in Settings › About.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AppInfo {
    pub name: &'static str,
    pub version: &'static str,
    pub tauri_version: &'static str,
    pub commit: &'static str,
    pub build_profile: &'static str,
    pub target_os: &'static str,
    pub target_arch: &'static str,
}

/// Collects the information of the running build. All values are fixed at compile time.
pub fn current_app_info() -> AppInfo {
    AppInfo {
        name: PRODUCT_NAME,
        version: env!("CARGO_PKG_VERSION"),
        tauri_version: tauri::VERSION,
        commit: env!("ARCHIVE_GIT_COMMIT"),
        build_profile: if cfg!(debug_assertions) {
            "debug"
        } else {
            "release"
        },
        target_os: std::env::consts::OS,
        target_arch: std::env::consts::ARCH,
    }
}

/// Returns the version and build information of the running application.
#[tauri::command]
pub fn app_info() -> AppInfo {
    current_app_info()
}

/// Startup status: database ready, or safe mode with the reason (ARCHITECTURE.md §6.4).
#[tauri::command]
pub fn app_status(state: State<'_, AppState>) -> AppStatus {
    state.status()
}

/// Tries again to open the database after a startup failure.
#[tauri::command]
pub async fn database_retry(state: State<'_, AppState>) -> Result<AppStatus, ()> {
    Ok(state.retry_database())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_info_reports_the_crate_version_and_product_name() {
        let info = current_app_info();
        assert_eq!(info.name, "ARCHIVE");
        assert_eq!(info.version, env!("CARGO_PKG_VERSION"));
        assert!(!info.tauri_version.is_empty());
        assert!(!info.commit.is_empty());
        assert!(matches!(info.build_profile, "debug" | "release"));
        assert!(!info.target_os.is_empty());
        assert!(!info.target_arch.is_empty());
    }

    #[test]
    fn app_info_serializes_with_camel_case_keys() {
        let json = serde_json::to_value(current_app_info()).expect("AppInfo must serialize");
        for key in [
            "name",
            "version",
            "tauriVersion",
            "commit",
            "buildProfile",
            "targetOs",
            "targetArch",
        ] {
            assert!(json.get(key).is_some(), "missing key {key}");
        }
    }

    #[test]
    fn package_json_and_cargo_versions_stay_in_sync() {
        let package_json: serde_json::Value =
            serde_json::from_str(include_str!("../../../package.json"))
                .expect("package.json must be valid JSON");
        assert_eq!(
            package_json["version"].as_str(),
            Some(env!("CARGO_PKG_VERSION")),
            "package.json and src-tauri/Cargo.toml must declare the same version"
        );
    }
}

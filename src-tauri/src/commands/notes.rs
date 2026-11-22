//! Notes commands (specification §8). Markdown files are chosen in native dialogs opened by the core: the
//! interface receives the text of the files the user picked, and gives the text of an export, never a path.

use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, State, Window};
use tauri_plugin_dialog::DialogExt;
use ts_rs::TS;

use super::blocking;
use crate::error::{AppError, AppResult};
use crate::import::detect::{FileKind, HEADER_LEN};
use crate::import::extract::{TEXT_READ_MAX, decode_text};
use crate::import::pipeline::ImportFailure;
use crate::repo::notes::{Note, NoteContent};
use crate::repo::tags::Tag;
use crate::services::notes::{
    self as service, LinkTarget, NewNote, NoteDetail, NoteLocation, NotePage, NoteQuery,
};
use crate::state::AppState;
use crate::util::{safe_file_name, validate_id};

/// Most Markdown files imported at once.
pub const MARKDOWN_FILES_MAX: usize = 200;

#[tauri::command]
pub async fn notes_list(state: State<'_, AppState>, query: NoteQuery) -> AppResult<NotePage> {
    let database = state.database()?;
    blocking("notes_list", move || {
        database.read(|connection| service::list(connection, &query))
    })
    .await
}

#[tauri::command]
pub async fn notes_get(state: State<'_, AppState>, id: String) -> AppResult<NoteDetail> {
    let database = state.database()?;
    blocking("notes_get", move || {
        database.read(|connection| service::detail(connection, &id))
    })
    .await
}

#[tauri::command]
pub async fn notes_create(state: State<'_, AppState>, input: NewNote) -> AppResult<Note> {
    let database = state.database()?;
    blocking("notes_create", move || {
        database.write(|transaction| service::create(transaction, &input))
    })
    .await
}

/// Saves a note edited from `revision`; refused with `stale_revision` if it changed meanwhile.
#[tauri::command]
pub async fn notes_save(
    state: State<'_, AppState>,
    id: String,
    revision: i64,
    content: NoteContent,
    links: Vec<LinkTarget>,
) -> AppResult<Note> {
    let database = state.database()?;
    blocking("notes_save", move || {
        database.write(|transaction| service::save(transaction, &id, revision, &content, &links))
    })
    .await
}

#[tauri::command]
pub async fn notes_rename(
    state: State<'_, AppState>,
    id: String,
    title: String,
) -> AppResult<Note> {
    let database = state.database()?;
    blocking("notes_rename", move || {
        database.write(|transaction| service::rename(transaction, &id, &title))
    })
    .await
}

#[tauri::command]
pub async fn notes_duplicate(
    state: State<'_, AppState>,
    id: String,
    title: String,
) -> AppResult<Note> {
    let database = state.database()?;
    blocking("notes_duplicate", move || {
        database.write(|transaction| service::duplicate(transaction, &id, &title))
    })
    .await
}

#[tauri::command]
pub async fn notes_move(
    state: State<'_, AppState>,
    id: String,
    location: NoteLocation,
) -> AppResult<Note> {
    let database = state.database()?;
    blocking("notes_move", move || {
        database.write(|transaction| service::move_to(transaction, &id, &location))
    })
    .await
}

#[tauri::command]
pub async fn notes_set_favorite(
    state: State<'_, AppState>,
    id: String,
    favorite: bool,
) -> AppResult<Note> {
    let database = state.database()?;
    blocking("notes_set_favorite", move || {
        database.write(|transaction| service::set_favorite(transaction, &id, favorite))
    })
    .await
}

#[tauri::command]
pub async fn notes_set_archived(
    state: State<'_, AppState>,
    id: String,
    archived: bool,
) -> AppResult<Note> {
    let database = state.database()?;
    blocking("notes_set_archived", move || {
        database.write(|transaction| service::set_archived(transaction, &id, archived))
    })
    .await
}

#[tauri::command]
pub async fn notes_set_tags(
    state: State<'_, AppState>,
    id: String,
    tag_ids: Vec<String>,
) -> AppResult<Vec<Tag>> {
    let database = state.database()?;
    blocking("notes_set_tags", move || {
        database.write(|transaction| service::set_tags(transaction, &id, &tag_ids))
    })
    .await
}

#[tauri::command]
pub async fn notes_trash(state: State<'_, AppState>, id: String) -> AppResult<Note> {
    let database = state.database()?;
    blocking("notes_trash", move || {
        database.write(|transaction| crate::repo::notes::trash(transaction, &id))
    })
    .await
}

#[tauri::command]
pub async fn notes_restore(state: State<'_, AppState>, id: String) -> AppResult<Note> {
    let database = state.database()?;
    blocking("notes_restore", move || {
        database.write(|transaction| crate::repo::notes::restore(transaction, &id))
    })
    .await
}

/// Permanently deletes a note that is in the trash, with its tags and links.
#[tauri::command]
pub async fn notes_purge(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let database = state.database()?;
    blocking("notes_purge", move || {
        database.write(|transaction| crate::repo::notes::purge(transaction, &id))
    })
    .await
}

#[tauri::command]
pub async fn notes_mark_opened(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let database = state.database()?;
    blocking("notes_mark_opened", move || {
        database.write(|transaction| service::mark_opened(transaction, &id))
    })
    .await
}

/// A Markdown file chosen for import: its text, or why it cannot be imported.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct MarkdownFile {
    /// File name without its extension: the title of the note.
    pub name: String,
    pub markdown: Option<String>,
    pub failure: Option<ImportFailure>,
}

fn read_markdown(path: &Path) -> MarkdownFile {
    let name = path
        .file_stem()
        .map(|stem| stem.to_string_lossy().trim().to_owned())
        .filter(|stem| !stem.is_empty())
        .unwrap_or_default();
    let failed = |failure| MarkdownFile {
        name: name.clone(),
        markdown: None,
        failure: Some(failure),
    };
    let Ok(metadata) = std::fs::metadata(path) else {
        return failed(ImportFailure::Unreadable);
    };
    if !metadata.is_file() {
        return failed(ImportFailure::NotAFile);
    }
    if metadata.len() > TEXT_READ_MAX {
        return failed(ImportFailure::TooLarge);
    }
    let extension = path
        .extension()
        .map(|extension| extension.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default();
    if FileKind::from_extension(&extension) != Some(FileKind::Markdown) {
        return failed(ImportFailure::Unsupported);
    }
    let mut bytes = Vec::new();
    // The source is only read, and never more than the limit even if it grew meanwhile.
    let read = File::open(path).and_then(|file| file.take(TEXT_READ_MAX).read_to_end(&mut bytes));
    if read.is_err() {
        return failed(ImportFailure::Unreadable);
    }
    if !FileKind::Markdown.matches_signature(&bytes[..bytes.len().min(HEADER_LEN)]) {
        return failed(ImportFailure::ContentMismatch);
    }
    let (text, _) = decode_text(&bytes, false);
    MarkdownFile {
        name,
        markdown: Some(text.replace("\r\n", "\n").replace('\r', "\n")),
        failure: None,
    }
}

/// Opens the file picker for Markdown files and returns their text; `None` if the user cancels.
#[tauri::command]
pub async fn notes_import_markdown_pick(
    app: AppHandle,
    window: Window,
) -> AppResult<Option<Vec<MarkdownFile>>> {
    let picked = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_parent(&window)
            .add_filter("Markdown", &["md", "markdown"])
            .blocking_pick_files()
    })
    .await
    .map_err(|error| AppError::Internal(format!("file picker failed: {error}")))?;
    let Some(files) = picked else {
        return Ok(None);
    };
    let paths: Vec<PathBuf> = files
        .into_iter()
        .filter_map(|file| file.into_path().ok())
        .collect();
    if paths.is_empty() {
        return Ok(None);
    }
    if paths.len() > MARKDOWN_FILES_MAX {
        return Err(AppError::InvalidInput(format!(
            "at most {MARKDOWN_FILES_MAX} Markdown files can be imported at once"
        )));
    }
    blocking("notes_import_markdown_pick", move || {
        Ok(Some(paths.iter().map(|path| read_markdown(path)).collect()))
    })
    .await
}

/// Writes the Markdown text of a note where the user chooses; `false` if the user cancels.
#[tauri::command]
pub async fn notes_export_markdown(
    app: AppHandle,
    window: Window,
    state: State<'_, AppState>,
    id: String,
    markdown: String,
) -> AppResult<bool> {
    validate_id(&id, "note id")?;
    service::check_markdown(&markdown)?;
    let database = state.database()?;
    let note = blocking("notes_export_markdown", move || {
        database.read(|connection| crate::repo::notes::get(connection, &id))
    })
    .await?;
    let stem = if note.title.trim().is_empty() {
        "note".to_owned()
    } else {
        note.title.clone()
    };
    let file_name = safe_file_name(&format!("{stem}.md"));
    let destination = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_parent(&window)
            .set_file_name(&file_name)
            .add_filter("Markdown", &["md"])
            .blocking_save_file()
    })
    .await
    .map_err(|error| AppError::Internal(format!("save dialog failed: {error}")))?;
    let Some(destination) = destination.and_then(|file| file.into_path().ok()) else {
        return Ok(false);
    };
    blocking("notes_export_markdown", move || {
        std::fs::write(&destination, markdown.as_bytes())?;
        Ok(true)
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(dir: &tempfile::TempDir, name: &str, bytes: &[u8]) -> PathBuf {
        let path = dir.path().join(name);
        std::fs::write(&path, bytes).expect("write");
        path
    }

    #[test]
    fn markdown_files_are_read_decoded_and_checked() {
        let dir = tempfile::tempdir().expect("dir");
        let note = read_markdown(&write(
            &dir,
            "Lois de Kirchhoff.md",
            b"# Titre\r\n\r\nTexte",
        ));
        assert_eq!(note.name, "Lois de Kirchhoff");
        assert_eq!(note.markdown.as_deref(), Some("# Titre\n\nTexte"));
        assert_eq!(note.failure, None);

        let latin1 = read_markdown(&write(&dir, "ancien.markdown", b"\xc9lectricit\xe9"));
        assert_eq!(latin1.markdown.as_deref(), Some("Électricité"));

        let binary = read_markdown(&write(&dir, "faux.md", b"MZ\x90\x00\x03"));
        assert_eq!(binary.failure, Some(ImportFailure::ContentMismatch));
        let other = read_markdown(&write(&dir, "notes.txt", b"texte"));
        assert_eq!(other.failure, Some(ImportFailure::Unsupported));
        let missing = read_markdown(&dir.path().join("absent.md"));
        assert_eq!(missing.failure, Some(ImportFailure::Unreadable));
        std::fs::create_dir(dir.path().join("dossier.md")).expect("dir");
        let folder = read_markdown(&dir.path().join("dossier.md"));
        assert_eq!(folder.failure, Some(ImportFailure::NotAFile));
    }
}

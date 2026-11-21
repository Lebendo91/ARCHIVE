//! Managed file storage (specification §5.3, ARCHITECTURE.md §7).
//!
//! Imported files are copied — never moved — to `files/<shard>/<id>.<extension>`, where the shard is the
//! last two hexadecimal characters of the identifier (the random part of a UUID v7). Paths are derived
//! from validated identifiers only, so user-provided names can never escape the storage directory.

use std::fs::{self, File, OpenOptions};
use std::io::{BufReader, Read, Write};
use std::path::{Path, PathBuf};

use serde::Serialize;
use sha2::{Digest, Sha256};
use ts_rs::TS;

use crate::error::{AppError, AppResult};
use crate::paths::AppPaths;
use crate::util::validate_id;

const COPY_BUFFER: usize = 64 * 1024;
const MAX_EXTENSION_LEN: usize = 10;

#[derive(Debug, Clone)]
pub struct FileStore {
    files_dir: PathBuf,
    tmp_dir: PathBuf,
}

/// Result of a copy into managed storage.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StoredFile {
    pub stored_filename: String,
    pub size: u64,
    pub sha256: String,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct DirectoryUsage {
    pub files: u64,
    pub bytes: u64,
}

/// Removes a temporary file unless the operation completed.
struct TemporaryFile {
    path: PathBuf,
    keep: bool,
}

impl Drop for TemporaryFile {
    fn drop(&mut self) {
        if !self.keep {
            let _ = fs::remove_file(&self.path);
        }
    }
}

fn check_extension(extension: &str) -> AppResult<()> {
    let valid = !extension.is_empty()
        && extension.len() <= MAX_EXTENSION_LEN
        && extension
            .chars()
            .all(|character| character.is_ascii_lowercase() || character.is_ascii_digit());
    if valid {
        Ok(())
    } else {
        Err(AppError::InvalidInput(
            "file extension is not supported".to_owned(),
        ))
    }
}

impl FileStore {
    pub fn new(paths: &AppPaths) -> Self {
        Self {
            files_dir: paths.files_dir.clone(),
            tmp_dir: paths.tmp_dir.clone(),
        }
    }

    /// Name of the managed copy of a document: `<id>.<extension>`.
    pub fn stored_filename(id: &str, extension: &str) -> AppResult<String> {
        validate_id(id, "document id")?;
        check_extension(extension)?;
        Ok(format!("{id}.{extension}"))
    }

    /// Absolute path of a managed file, after checking that the name has the expected form.
    pub fn path_for(&self, stored_filename: &str) -> AppResult<PathBuf> {
        let (id, extension) = stored_filename
            .split_once('.')
            .ok_or_else(|| AppError::InvalidInput("invalid stored file name".to_owned()))?;
        validate_id(id, "document id")?;
        check_extension(extension)?;
        let shard = &id[id.len() - 2..];
        Ok(self.files_dir.join(shard).join(stored_filename))
    }

    /// Copies `source` into managed storage under `id`, computing its size and SHA-256 while copying.
    /// The source is opened read-only and never modified; the managed copy appears atomically, complete
    /// or not at all.
    pub fn import_copy(&self, source: &Path, id: &str, extension: &str) -> AppResult<StoredFile> {
        let metadata = fs::metadata(source)?;
        if !metadata.is_file() {
            return Err(AppError::InvalidInput(
                "the selected item is not a file".to_owned(),
            ));
        }
        let stored_filename = Self::stored_filename(id, extension)?;
        let target = self.path_for(&stored_filename)?;
        if target.exists() {
            return Err(AppError::Storage(format!(
                "managed file {stored_filename} already exists"
            )));
        }
        fs::create_dir_all(&self.tmp_dir)?;
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)?;
        }

        let mut temporary = TemporaryFile {
            path: self.tmp_dir.join(format!("{id}.part")),
            keep: false,
        };
        let mut reader = BufReader::with_capacity(COPY_BUFFER, File::open(source)?);
        let mut writer = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary.path)?;
        let mut hasher = Sha256::new();
        let mut buffer = vec![0_u8; COPY_BUFFER];
        let mut size: u64 = 0;
        loop {
            let read = reader.read(&mut buffer)?;
            if read == 0 {
                break;
            }
            let chunk = buffer.get(..read).unwrap_or_default();
            hasher.update(chunk);
            writer.write_all(chunk)?;
            size += read as u64;
        }
        writer.sync_all()?;
        drop(writer);
        fs::rename(&temporary.path, &target)?;
        temporary.keep = true;

        Ok(StoredFile {
            stored_filename,
            size,
            sha256: hex::encode(hasher.finalize()),
        })
    }

    /// Deletes a managed copy. Returns false if it did not exist. Never touches files outside storage.
    pub fn remove(&self, stored_filename: &str) -> AppResult<bool> {
        let path = self.path_for(stored_filename)?;
        match fs::remove_file(&path) {
            Ok(()) => Ok(true),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
            Err(error) => Err(error.into()),
        }
    }

    pub fn usage(&self) -> AppResult<DirectoryUsage> {
        directory_usage(&self.files_dir)
    }

    /// Removes leftovers of interrupted copies (called at startup). Returns the number of files removed.
    pub fn cleanup_tmp(&self) -> AppResult<usize> {
        let entries = match fs::read_dir(&self.tmp_dir) {
            Ok(entries) => entries,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(0),
            Err(error) => return Err(error.into()),
        };
        let mut removed = 0;
        for entry in entries {
            let entry = entry?;
            if entry.file_type()?.is_file() {
                fs::remove_file(entry.path())?;
                removed += 1;
            }
        }
        Ok(removed)
    }
}

/// SHA-256 and size of a file, read in chunks so that large files never sit in memory.
pub fn hash_file(path: &Path) -> AppResult<(u64, String)> {
    let mut reader = BufReader::with_capacity(COPY_BUFFER, File::open(path)?);
    let mut hasher = Sha256::new();
    let mut buffer = vec![0_u8; COPY_BUFFER];
    let mut size: u64 = 0;
    loop {
        let read = reader.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(buffer.get(..read).unwrap_or_default());
        size += read as u64;
    }
    Ok((size, hex::encode(hasher.finalize())))
}

/// Number of files and total size of a directory tree. Symbolic links are not followed.
pub fn directory_usage(path: &Path) -> AppResult<DirectoryUsage> {
    let mut usage = DirectoryUsage::default();
    let mut pending = vec![path.to_path_buf()];
    while let Some(directory) = pending.pop() {
        let entries = match fs::read_dir(&directory) {
            Ok(entries) => entries,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(error) => return Err(error.into()),
        };
        for entry in entries {
            let entry = entry?;
            let file_type = entry.file_type()?;
            if file_type.is_dir() {
                pending.push(entry.path());
            } else if file_type.is_file() {
                usage.files += 1;
                usage.bytes += entry.metadata()?.len();
            }
        }
    }
    Ok(usage)
}

/// Size of a file, or 0 if it does not exist.
pub fn file_size(path: &Path) -> u64 {
    fs::metadata(path)
        .map(|metadata| metadata.len())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::util::new_id;

    fn store() -> (tempfile::TempDir, FileStore) {
        let dir = tempfile::tempdir().expect("temporary directory");
        let paths = AppPaths::from_data_dir(dir.path());
        paths.ensure_directories().expect("directories");
        let store = FileStore::new(&paths);
        (dir, store)
    }

    #[test]
    fn copies_are_complete_hashed_and_leave_the_source_untouched() {
        let (dir, store) = store();
        let source = dir.path().join("cours NE555 (v2).pdf");
        let content = b"%PDF-1.7 contenu du cours".repeat(10_000);
        fs::write(&source, &content).expect("source");
        let modified_before = fs::metadata(&source)
            .and_then(|m| m.modified())
            .expect("mtime");

        let id = new_id();
        let stored = store.import_copy(&source, &id, "pdf").expect("copy");
        assert_eq!(stored.stored_filename, format!("{id}.pdf"));
        assert_eq!(stored.size, content.len() as u64);
        assert_eq!(stored.sha256, hex::encode(Sha256::digest(&content)));

        let managed = store.path_for(&stored.stored_filename).expect("path");
        assert!(managed.starts_with(dir.path().join("files").join(&id[id.len() - 2..])));
        assert_eq!(fs::read(&managed).expect("managed copy"), content);
        assert_eq!(fs::read(&source).expect("source still there"), content);
        assert_eq!(
            fs::metadata(&source)
                .and_then(|m| m.modified())
                .expect("mtime"),
            modified_before
        );
        assert_eq!(
            store.cleanup_tmp().expect("tmp"),
            0,
            "no temporary file left behind"
        );
    }

    #[test]
    fn hashes_match_between_copy_and_direct_hashing() {
        let (dir, store) = store();
        let source = dir.path().join("notes.txt");
        fs::write(&source, "Lois de Kirchhoff — nœuds et mailles").expect("source");
        let stored = store.import_copy(&source, &new_id(), "txt").expect("copy");
        assert_eq!(hash_file(&source).expect("hash").1, stored.sha256);
    }

    #[test]
    fn unsafe_names_are_rejected() {
        let (_dir, store) = store();
        for name in ["../../etc/passwd", "x.pdf", "..\\windows.pdf", ""] {
            assert!(store.path_for(name).is_err(), "{name} must be rejected");
        }
        let id = new_id();
        for extension in ["", "PDF", "p/df", "exe.lnk", "abcdefghijkl"] {
            assert!(
                FileStore::stored_filename(&id, extension).is_err(),
                "{extension} must be rejected"
            );
        }
    }

    #[test]
    fn directories_and_missing_sources_cannot_be_imported() {
        let (dir, store) = store();
        assert!(matches!(
            store.import_copy(dir.path(), &new_id(), "pdf"),
            Err(AppError::InvalidInput(_))
        ));
        assert!(
            store
                .import_copy(&dir.path().join("absent.pdf"), &new_id(), "pdf")
                .is_err()
        );
    }

    #[test]
    fn removal_and_usage() {
        let (dir, store) = store();
        let source = dir.path().join("a.md");
        fs::write(&source, "# Titre").expect("source");
        let first = store.import_copy(&source, &new_id(), "md").expect("first");
        store.import_copy(&source, &new_id(), "md").expect("second");
        assert_eq!(
            store.usage().expect("usage"),
            DirectoryUsage {
                files: 2,
                bytes: 14
            }
        );
        assert!(store.remove(&first.stored_filename).expect("remove"));
        assert!(
            !store
                .remove(&first.stored_filename)
                .expect("already removed")
        );
        assert_eq!(store.usage().expect("usage").files, 1);
        assert!(source.exists(), "the original is never removed");
    }

    #[test]
    fn interrupted_copies_are_cleaned_at_startup() {
        let (dir, store) = store();
        fs::write(dir.path().join("tmp").join("orphan.part"), "partial").expect("leftover");
        assert_eq!(store.cleanup_tmp().expect("cleanup"), 1);
    }
}

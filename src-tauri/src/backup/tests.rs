//! Backups end to end on a real data folder: what is saved comes back, a damaged or foreign file is refused,
//! and a restoration either replaces everything (keeping the replaced data) or changes nothing.

use std::io::{Read, Write};

use super::*;
use crate::repo::documents::{self, NewDocument};
use crate::repo::notes::{self, NoteContent, NoteFormat};

struct Folder {
    _dir: tempfile::TempDir,
    paths: AppPaths,
    source: PathBuf,
}

fn folder() -> Folder {
    let dir = tempfile::tempdir().expect("temporary directory");
    let paths = AppPaths::from_data_dir(dir.path().join("data"));
    paths.ensure_directories().expect("directories");
    let source = dir.path().join("cours.pdf");
    fs::write(&source, b"%PDF-1.4 le montage astable du NE555").expect("source");
    Folder {
        _dir: dir,
        paths,
        source,
    }
}

fn open(paths: &AppPaths) -> Database {
    Database::open(&paths.database_file, &paths.backups_dir)
        .expect("database")
        .0
}

fn seed(folder: &Folder, database: &Database) -> String {
    let store = FileStore::new(&folder.paths);
    let id = new_id();
    let copied = store.import_copy(&folder.source, &id, "pdf").expect("copy");
    database
        .write(|transaction| {
            documents::insert(
                transaction,
                &NewDocument {
                    stored_filename: copied.stored_filename.clone(),
                    id: id.clone(),
                    title: "Cours NE555".to_owned(),
                    original_filename: "cours.pdf".to_owned(),
                    file_extension: "pdf".to_owned(),
                    mime_type: "application/pdf".to_owned(),
                    file_size: i64::try_from(copied.size).unwrap_or(i64::MAX),
                    content_hash: copied.sha256.clone(),
                    workspace_id: None,
                    folder_id: None,
                    metadata: serde_json::json!({}),
                },
            )?;
            notes::create(
                transaction,
                &NoteContent {
                    title: "Montage astable".to_owned(),
                    content: "Le NE555 oscille.".to_owned(),
                    content_format: NoteFormat::Plain,
                    content_text: "Le NE555 oscille.".to_owned(),
                },
                None,
                None,
            )?;
            Ok(())
        })
        .expect("seeded");
    id
}

fn note_titles(database: &Database) -> Vec<String> {
    database
        .read(|connection| {
            let mut statement = connection.prepare("SELECT title FROM notes ORDER BY title")?;
            let titles = statement
                .query_map([], |row| row.get(0))?
                .collect::<Result<_, _>>()?;
            Ok(titles)
        })
        .expect("titles")
}

#[test]
fn a_backup_holds_the_database_and_the_files_and_verifies() {
    let folder = folder();
    let database = open(&folder.paths);
    seed(&folder, &database);
    let destination = folder
        .paths
        .data_dir
        .parent()
        .expect("parent")
        .join("sauvegarde.zip");
    let mut steps = Vec::new();
    let summary = create(&database, &folder.paths, &destination, |progress| {
        steps.push(progress)
    })
    .expect("backup");
    assert!(destination.is_file());
    assert!(!destination.with_extension("zip.partial").exists());
    assert_eq!(summary.contents.documents, 1);
    assert_eq!(summary.contents.notes, 1);
    assert_eq!(summary.contents.files, 1);
    assert_eq!(steps.last(), Some(&BackupProgress { done: 2, total: 2 }));
    assert!(
        fs::read_dir(&folder.paths.tmp_dir)
            .expect("tmp")
            .next()
            .is_none(),
        "snapshot removed"
    );

    let check = verify(&destination, &folder.paths.tmp_dir, None).expect("verify");
    assert!(check.valid(), "{check:?}");
    assert_eq!(check.summary.map(|summary| summary.contents.notes), Some(1));

    // The manifest says the keys are not there, and the database names no secret.
    let mut archive = ZipArchive::new(File::open(&destination).expect("zip")).expect("archive");
    let mut manifest = String::new();
    archive
        .by_name(MANIFEST)
        .expect("manifest")
        .read_to_string(&mut manifest)
        .expect("text");
    assert!(
        manifest.contains("\"secretsIncluded\": false"),
        "{manifest}"
    );

    let recorded = database
        .write(|transaction| remember(transaction, &destination, &summary, Some(true)))
        .expect("remembered");
    assert!(recorded.available);
    assert_eq!(recorded.valid, Some(true));
    assert_eq!(database.read(list).expect("history").len(), 1);
}

#[test]
fn damaged_foreign_or_newer_files_are_refused() {
    let folder = folder();
    let database = open(&folder.paths);
    seed(&folder, &database);
    let root = folder
        .paths
        .data_dir
        .parent()
        .expect("parent")
        .to_path_buf();
    let original = root.join("sauvegarde.zip");
    create(&database, &folder.paths, &original, |_| {}).expect("backup");

    // Rewritten with one byte of the document changed: the fingerprint no longer matches.
    let altered = root.join("modifiee.zip");
    let mut source = ZipArchive::new(File::open(&original).expect("zip")).expect("archive");
    let mut writer = ZipWriter::new(File::create(&altered).expect("create"));
    for index in 0..source.len() {
        let mut entry = source.by_index(index).expect("entry");
        let name = entry.name().expect("name").into_owned();
        let mut bytes = Vec::new();
        entry.read_to_end(&mut bytes).expect("read");
        if name.starts_with("files/") {
            bytes[0] ^= 0xff;
        }
        writer
            .start_file(name, SimpleFileOptions::default())
            .expect("start");
        writer.write_all(&bytes).expect("write");
    }
    writer.finish().expect("finish");
    let check = verify(&altered, &folder.paths.tmp_dir, None).expect("verify");
    assert!(!check.valid());
    assert!(
        matches!(check.problems.as_slice(), [BackupProblem::Altered { name }] if name.starts_with("files/"))
    );

    // A ZIP with a path that would leave the restore folder.
    let foreign = root.join("etrangere.zip");
    let mut writer = ZipWriter::new(File::create(&foreign).expect("create"));
    writer
        .start_file("../evil.txt", SimpleFileOptions::default())
        .expect("start");
    writer.write_all(b"x").expect("write");
    writer.finish().expect("finish");
    assert_eq!(
        verify(&foreign, &folder.paths.tmp_dir, None)
            .expect("verify")
            .problems,
        vec![BackupProblem::NotABackup]
    );
    fs::write(root.join("texte.zip"), b"not a zip").expect("write");
    assert_eq!(
        verify(&root.join("texte.zip"), &folder.paths.tmp_dir, None)
            .expect("verify")
            .problems,
        vec![BackupProblem::NotABackup]
    );

    // A manifest from a newer version, and an entry the manifest does not list.
    let newer = root.join("recente.zip");
    let mut source = ZipArchive::new(File::open(&original).expect("zip")).expect("archive");
    let mut writer = ZipWriter::new(File::create(&newer).expect("create"));
    for index in 0..source.len() {
        let mut entry = source.by_index(index).expect("entry");
        let name = entry.name().expect("name").into_owned();
        let mut bytes = Vec::new();
        entry.read_to_end(&mut bytes).expect("read");
        if name == MANIFEST {
            let mut manifest: Manifest = serde_json::from_slice(&bytes).expect("manifest");
            manifest.schema_version += 1;
            bytes = serde_json::to_vec(&manifest).expect("json");
        }
        writer
            .start_file(name, SimpleFileOptions::default())
            .expect("start");
        writer.write_all(&bytes).expect("write");
    }
    writer
        .start_file("files/../../notes.txt", SimpleFileOptions::default())
        .expect("start");
    writer.write_all(b"x").expect("write");
    writer.finish().expect("finish");
    let problems = verify(&newer, &folder.paths.tmp_dir, None)
        .expect("verify")
        .problems;
    assert!(
        problems
            .iter()
            .any(|problem| matches!(problem, BackupProblem::TooNew { .. })),
        "{problems:?}"
    );
    assert!(
        problems
            .iter()
            .any(|problem| matches!(problem, BackupProblem::UnexpectedEntry { .. })),
        "{problems:?}"
    );
}

#[test]
fn a_restoration_replaces_the_data_at_start_and_keeps_what_it_replaced() {
    let folder = folder();
    let database = open(&folder.paths);
    let document = seed(&folder, &database);
    let backup = folder
        .paths
        .data_dir
        .parent()
        .expect("parent")
        .join("sauvegarde.zip");
    let summary = create(&database, &folder.paths, &backup, |_| {}).expect("backup");
    database
        .write(|transaction| remember(transaction, &backup, &summary, None))
        .expect("remembered");
    // After the backup: a note written, another backup made, the document's file gone.
    database
        .write(|transaction| {
            notes::create(
                transaction,
                &NoteContent {
                    title: "Écrite après".to_owned(),
                    content: String::new(),
                    content_format: NoteFormat::Plain,
                    content_text: String::new(),
                },
                None,
                None,
            )
            .map(|_| ())
        })
        .expect("note");
    let later = backup.with_file_name("plus-tard.zip");
    let later_summary = create(&database, &folder.paths, &later, |_| {}).expect("later backup");
    database
        .write(|transaction| remember(transaction, &later, &later_summary, Some(true)))
        .expect("remembered");
    let stored = FileStore::new(&folder.paths)
        .path_for(&format!("{document}.pdf"))
        .expect("path");
    fs::remove_file(&stored).expect("file removed");
    assert_eq!(note_titles(&database), ["Montage astable", "Écrite après"]);

    let history = database.read(list).expect("history");
    let check = stage_restore(&folder.paths, &backup, &history).expect("staged");
    assert!(check.valid(), "{check:?}");
    // Nothing changes until the next start.
    assert_eq!(note_titles(&database), ["Montage astable", "Écrite après"]);
    drop(database);

    let restore = apply_pending_restore(&folder.paths).expect("applied");
    let outcome = restore.outcome.clone();
    assert!(outcome.applied, "{outcome:?}");
    let database = open(&folder.paths);
    assert_eq!(note_titles(&database), ["Montage astable"]);

    // The restored database was saved before any backup was remembered: the history is carried over, with the
    // backup restored marked as verified (it was, before being extracted).
    assert!(database.read(list).expect("history").is_empty());
    let written = database
        .write(|transaction| restore.carry_history(transaction))
        .expect("carried");
    assert_eq!(written, 2);
    let carried = database.read(list).expect("history");
    let find = |path: &Path| {
        carried
            .iter()
            .find(|record| Path::new(&record.path) == path)
            .cloned()
            .expect("in the history")
    };
    let restored = find(&backup);
    assert_eq!(restored.valid, Some(true));
    assert!(restored.verified_at.is_some());
    assert_eq!(restored.contents.notes, 1);
    assert_eq!(find(&later).contents.notes, 2);
    assert!(stored.is_file(), "the file of the backup is back");
    assert!(!folder.paths.restore_dir.exists());
    // The replaced data is kept, with the note written after the backup.
    let kept = PathBuf::from(outcome.kept_in.expect("kept"));
    assert!(kept.starts_with(&folder.paths.backups_dir), "{kept:?}");
    let previous = Database::open(&kept.join("archive.db"), &folder.paths.tmp_dir)
        .expect("kept database")
        .0;
    assert_eq!(note_titles(&previous), ["Montage astable", "Écrite après"]);
    // Applied once: nothing is pending any more.
    assert!(apply_pending_restore(&folder.paths).is_none());
}

#[test]
fn a_restoration_that_cannot_be_applied_changes_nothing() {
    let folder = folder();
    let database = open(&folder.paths);
    seed(&folder, &database);
    let backup = folder
        .paths
        .data_dir
        .parent()
        .expect("parent")
        .join("sauvegarde.zip");
    create(&database, &folder.paths, &backup, |_| {}).expect("backup");
    stage_restore(&folder.paths, &backup, &[]).expect("staged");
    drop(database);
    // The extracted database disappeared before the start.
    fs::remove_file(folder.paths.restore_dir.join(STAGING).join(DATABASE)).expect("removed");
    let restore = apply_pending_restore(&folder.paths).expect("tried");
    let outcome = &restore.outcome;
    assert!(!outcome.applied);
    assert_eq!(outcome.kept_in, None, "everything is where it was");
    assert!(
        !folder.paths.restore_dir.exists(),
        "the extracted copy is removed"
    );
    let database = open(&folder.paths);
    assert_eq!(note_titles(&database), ["Montage astable"]);
    // Not applied: the database kept its own history.
    assert_eq!(
        database
            .write(|transaction| restore.carry_history(transaction))
            .expect("nothing"),
        0
    );
    assert!(
        apply_pending_restore(&folder.paths).is_none(),
        "tried once only"
    );

    // An invalid backup is never staged.
    let fake = folder
        .paths
        .data_dir
        .parent()
        .expect("parent")
        .join("faux.zip");
    fs::write(&fake, b"PK not really").expect("write");
    let check = stage_restore(&folder.paths, &fake, &[]).expect("checked");
    assert!(!check.valid());
    assert!(!folder.paths.restore_dir.exists());
}

#[test]
fn a_restoration_failing_half_way_puts_the_data_back() {
    let folder = folder();
    let database = open(&folder.paths);
    seed(&folder, &database);
    let backup = folder
        .paths
        .data_dir
        .parent()
        .expect("parent")
        .join("sauvegarde.zip");
    create(&database, &folder.paths, &backup, |_| {}).expect("backup");
    database
        .write(|transaction| {
            notes::create(
                transaction,
                &NoteContent {
                    title: "Écrite après".to_owned(),
                    content: String::new(),
                    content_format: NoteFormat::Plain,
                    content_text: String::new(),
                },
                None,
                None,
            )
            .map(|_| ())
        })
        .expect("note");
    assert!(
        stage_restore(&folder.paths, &backup, &[])
            .expect("staged")
            .valid()
    );
    drop(database);

    // The database is set aside and the restored one put in its place, then the files cannot be: their
    // folder is somewhere that does not exist.
    let broken = AppPaths {
        files_dir: folder.paths.data_dir.join("absent").join("files"),
        ..folder.paths.clone()
    };
    let outcome = apply_pending_restore(&broken).expect("tried").outcome;
    assert!(!outcome.applied);
    assert_eq!(outcome.kept_in, None, "everything was put back");
    let database = open(&folder.paths);
    assert_eq!(note_titles(&database), ["Montage astable", "Écrite après"]);
    let aside: Vec<_> = fs::read_dir(&folder.paths.backups_dir)
        .expect("backups")
        .filter_map(Result::ok)
        .filter(|entry| {
            entry
                .file_name()
                .to_string_lossy()
                .starts_with("before-restore-")
        })
        .collect();
    assert!(aside.is_empty(), "no folder left aside: {aside:?}");
    assert!(!folder.paths.restore_dir.exists());
}

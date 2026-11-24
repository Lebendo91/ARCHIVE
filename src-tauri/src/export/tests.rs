//! Exports end to end on a real data folder: what is written, where, under which names, and what is never
//! touched.

use std::io::Read;

use super::*;
use crate::repo::documents::{self, NewDocument};
use crate::repo::notes::{self, NoteContent, NoteFormat};
use crate::repo::relations::{self, NewRelation, RelationOrigin};
use crate::repo::tags::{self, Tagged};
use crate::repo::workspaces::{self, NewWorkspace};
use crate::repo::{EntityKind, TokenColor, folders};
use crate::util::new_id;

struct Setup {
    dir: tempfile::TempDir,
    paths: AppPaths,
    database: Database,
}

impl Setup {
    fn new() -> Self {
        let dir = tempfile::tempdir().expect("temporary directory");
        let paths = AppPaths::from_data_dir(dir.path().join("data"));
        paths.ensure_directories().expect("directories");
        let database = Database::open(&paths.database_file, &paths.backups_dir)
            .expect("database")
            .0;
        Self {
            dir,
            paths,
            database,
        }
    }

    /// Where the user exports: outside the data folder.
    fn destination(&self) -> PathBuf {
        let destination = self.dir.path().join("Exports");
        fs::create_dir_all(&destination).expect("destination");
        destination
    }

    fn document(
        &self,
        file_name: &str,
        bytes: &[u8],
        workspace: Option<&str>,
        folder: Option<&str>,
    ) -> String {
        let source = self.dir.path().join(format!("source-{}", new_id()));
        fs::write(&source, bytes).expect("source");
        let id = new_id();
        let extension = file_name
            .rsplit_once('.')
            .map_or("txt", |(_, extension)| extension);
        let copied = FileStore::new(&self.paths)
            .import_copy(&source, &id, extension)
            .expect("copy");
        self.database
            .write(|transaction| {
                documents::insert(
                    transaction,
                    &NewDocument {
                        stored_filename: copied.stored_filename.clone(),
                        id: id.clone(),
                        title: file_name
                            .rsplit_once('.')
                            .map_or(file_name, |(stem, _)| stem)
                            .to_owned(),
                        original_filename: file_name.to_owned(),
                        file_extension: extension.to_owned(),
                        mime_type: "application/octet-stream".to_owned(),
                        file_size: i64::try_from(copied.size).unwrap_or(i64::MAX),
                        content_hash: copied.sha256.clone(),
                        workspace_id: workspace.map(str::to_owned),
                        folder_id: folder.map(str::to_owned),
                        metadata: serde_json::json!({}),
                    },
                )
            })
            .expect("document");
        id
    }

    fn note(
        &self,
        title: &str,
        content: &str,
        format: NoteFormat,
        text: &str,
        workspace: Option<&str>,
        folder: Option<&str>,
    ) -> String {
        self.database
            .write(|transaction| {
                notes::create(
                    transaction,
                    &NoteContent {
                        title: title.to_owned(),
                        content: content.to_owned(),
                        content_format: format,
                        content_text: text.to_owned(),
                    },
                    workspace,
                    folder,
                )
            })
            .expect("note")
            .id
    }

    fn workspace(&self, name: &str) -> String {
        self.database
            .write(|transaction| {
                workspaces::create(
                    transaction,
                    &NewWorkspace {
                        name: name.to_owned(),
                        description: None,
                        color: None,
                        icon: None,
                    },
                )
            })
            .expect("workspace")
            .id
    }

    fn folder(&self, workspace: &str, parent: Option<&str>, name: &str) -> String {
        self.database
            .write(|transaction| folders::create(transaction, workspace, parent, name))
            .expect("folder")
            .id
    }

    fn export(
        &self,
        scope: &ExportScope,
        markdown: &HashMap<String, String>,
    ) -> AppResult<ExportSummary> {
        export(
            &self.database,
            &self.paths,
            &self.destination(),
            scope,
            markdown,
            "Sans titre",
            |_| {},
        )
    }
}

fn read(path: &Path) -> String {
    let mut text = String::new();
    File::open(path)
        .unwrap_or_else(|error| panic!("{}: {error}", path.display()))
        .read_to_string(&mut text)
        .expect("text");
    text
}

fn csv_rows(path: &Path) -> Vec<String> {
    let text = read(path);
    assert!(text.starts_with('\u{feff}'), "byte order mark");
    text.trim_start_matches('\u{feff}')
        .split("\r\n")
        .filter(|line| !line.is_empty())
        .map(str::to_owned)
        .collect()
}

#[test]
fn an_export_holds_the_files_the_notes_and_the_tables() {
    let folder = Setup::new();
    let electronics = folder.workspace("Électronique");
    let course = folder.folder(&electronics, None, "Cours");
    let analog = folder.folder(&electronics, Some(&course), "Analogique");
    let datasheet = folder.document(
        "fiche ne555.pdf",
        b"%PDF-1.4 NE555",
        Some(&electronics),
        Some(&analog),
    );
    // Two files of the same name in the same folder, and one outside any workspace.
    folder.document("schema.png", b"png one", Some(&electronics), Some(&analog));
    folder.document("SCHEMA.png", b"png two", Some(&electronics), Some(&analog));
    let loose = folder.document("=SUM(1).txt", b"formula", None, None);
    // In the trash: never exported.
    let trashed = folder.document("corbeille.txt", b"gone", None, None);
    folder
        .database
        .write(|transaction| documents::trash(transaction, &trashed).map(|_| ()))
        .expect("trash");

    let tiptap = folder.note(
        "Montage astable",
        r#"{"type":"doc","content":[]}"#,
        NoteFormat::TiptapJson,
        "Le NE555 oscille.",
        Some(&electronics),
        Some(&course),
    );
    let markdown_note = folder.note(
        "Liste",
        "# Liste\n\n- un\n- deux",
        NoteFormat::Markdown,
        "Liste un deux",
        None,
        None,
    );
    let untitled = folder.note(
        "",
        "texte libre",
        NoteFormat::Plain,
        "texte libre",
        None,
        None,
    );
    let unconverted = folder.note(
        "Sans conversion",
        r#"{"type":"doc"}"#,
        NoteFormat::TiptapJson,
        "Texte brut.",
        None,
        None,
    );

    let tag = folder
        .database
        .write(|transaction| tags::create(transaction, "ne555", TokenColor::Amber))
        .expect("tag");
    folder
        .database
        .write(|transaction| {
            tags::attach(transaction, &tag.id, Tagged::Note(&tiptap))?;
            tags::attach(transaction, &tag.id, Tagged::Document(&datasheet))
        })
        .expect("tagged");
    folder
        .database
        .write(|transaction| {
            relations::create(
                transaction,
                &NewRelation {
                    source: (EntityKind::Note, tiptap.clone()),
                    target: (EntityKind::Document, datasheet.clone()),
                    relation_type: "related_to".to_owned(),
                    origin: RelationOrigin::User,
                    confidence: None,
                    provenance: serde_json::json!({}),
                },
            )
            .map(|_| ())
        })
        .expect("relation");

    let markdown = HashMap::from([(tiptap.clone(), "Le **NE555** oscille.\n".to_owned())]);
    let mut steps = Vec::new();
    let summary = export(
        &folder.database,
        &folder.paths,
        &folder.destination(),
        &ExportScope::All,
        &markdown,
        "Sans titre",
        |progress| steps.push(progress),
    )
    .expect("export");
    let root = PathBuf::from(&summary.folder);
    assert!(root.is_dir());
    assert!(
        root.file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.starts_with("ARCHIVE-export-"))
    );
    assert!(
        !fs::read_dir(folder.destination())
            .expect("exports")
            .filter_map(Result::ok)
            .any(|entry| entry.file_name().to_string_lossy().ends_with(".partial")),
        "no partial folder left"
    );
    assert_eq!(
        (
            summary.documents,
            summary.notes,
            summary.workspaces,
            summary.relations
        ),
        (4, 4, 1, 1)
    );
    assert!(summary.missing_files.is_empty());
    assert_eq!(steps.last(), Some(&ExportProgress { done: 9, total: 9 }));

    // The original files, under their names, in their workspace and folders.
    let analog_dir = root
        .join("documents")
        .join("Électronique")
        .join("Cours")
        .join("Analogique");
    assert_eq!(
        fs::read(analog_dir.join("fiche ne555.pdf")).expect("pdf"),
        b"%PDF-1.4 NE555"
    );
    assert_eq!(
        fs::read(analog_dir.join("schema.png")).expect("first"),
        b"png one"
    );
    assert_eq!(
        fs::read(analog_dir.join("SCHEMA (2).png")).expect("second"),
        b"png two"
    );
    assert_eq!(
        fs::read(root.join("documents").join("=SUM(1).txt")).expect("loose"),
        b"formula"
    );
    assert!(!root.join("documents").join("corbeille.txt").exists());

    // The notes: Markdown from the interface, Markdown and plain text as written, plain text when no Markdown
    // came; the details in a YAML header.
    let astable = read(
        &root
            .join("notes")
            .join("Électronique")
            .join("Cours")
            .join("Montage astable.md"),
    );
    assert!(
        astable.starts_with("---\ntitle: \"Montage astable\"\n"),
        "{astable}"
    );
    assert!(astable.contains("workspace: \"Électronique\"\nfolder: \"Cours\"\ntags: [\"ne555\"]\n---\n\nLe **NE555** oscille.\n"), "{astable}");
    assert!(
        read(&root.join("notes").join("Liste.md")).ends_with("---\n\n# Liste\n\n- un\n- deux\n")
    );
    assert!(read(&root.join("notes").join("Sans titre.md")).ends_with("---\n\ntexte libre\n"));
    assert!(read(&root.join("notes").join("Sans conversion.md")).ends_with("---\n\nTexte brut.\n"));

    // The tables: a formula-like title stays text, a quoted value keeps its comma.
    let documents_csv = csv_rows(&root.join("metadata").join("documents.csv"));
    assert_eq!(documents_csv.len(), 5);
    assert!(documents_csv[0].starts_with("id,title,file,original_filename,"));
    let formula_row = documents_csv
        .iter()
        .find(|row| row.starts_with(&loose))
        .expect("row");
    assert!(
        formula_row.contains(",'=SUM(1),documents/=SUM(1).txt,'=SUM(1).txt,"),
        "{formula_row}"
    );
    let datasheet_row = documents_csv
        .iter()
        .find(|row| row.starts_with(&datasheet))
        .expect("row");
    assert!(
        datasheet_row.contains(",Électronique,Cours/Analogique,ne555,false,false,"),
        "{datasheet_row}"
    );
    assert_eq!(csv_rows(&root.join("metadata").join("notes.csv")).len(), 5);
    assert_eq!(
        csv_rows(&root.join("metadata").join("workspaces.csv")).len(),
        2
    );
    let relations_csv = csv_rows(&root.join("metadata").join("relations.csv"));
    assert_eq!(relations_csv.len(), 2);
    assert!(
        relations_csv[1].contains(",Montage astable,document,"),
        "{}",
        relations_csv[1]
    );

    // Everything in archive.json.
    let archive: Value = serde_json::from_str(&read(&root.join("archive.json"))).expect("json");
    assert_eq!(archive["format"], "archive-export");
    assert_eq!(archive["scope"]["kind"], "all");
    assert_eq!(archive["documents"].as_array().map(Vec::len), Some(4));
    assert_eq!(archive["notes"].as_array().map(Vec::len), Some(4));
    let exported_datasheet = archive["documents"]
        .as_array()
        .and_then(|items| items.iter().find(|item| item["id"] == datasheet.as_str()))
        .expect("datasheet");
    assert_eq!(
        exported_datasheet["file"],
        "documents/Électronique/Cours/Analogique/fiche ne555.pdf"
    );
    assert_eq!(exported_datasheet["tags"], serde_json::json!(["ne555"]));
    let exported_note = archive["notes"]
        .as_array()
        .and_then(|items| {
            items
                .iter()
                .find(|item| item["id"] == markdown_note.as_str())
        })
        .expect("note");
    assert_eq!(exported_note["markdown"], "# Liste\n\n- un\n- deux");
    assert_eq!(archive["relations"][0]["sourceId"], tiptap.as_str());
    assert_eq!(archive["folders"].as_array().map(Vec::len), Some(2));
    assert!(archive["conversations"].is_array());
    assert!(!read(&root.join("archive.json")).contains(&trashed));
    let _ = (untitled, unconverted);
}

#[test]
fn a_workspace_export_holds_that_workspace_only() {
    let folder = Setup::new();
    let electronics = folder.workspace("Électronique");
    let cooking = folder.workspace("Cuisine");
    let datasheet = folder.document("fiche.pdf", b"%PDF NE555", Some(&electronics), None);
    let recipe = folder.document("recette.txt", b"crepes", Some(&cooking), None);
    let note = folder.note(
        "Crêpes",
        "Farine",
        NoteFormat::Plain,
        "Farine",
        Some(&cooking),
        None,
    );
    folder
        .database
        .write(|transaction| {
            relations::create(
                transaction,
                &NewRelation {
                    source: (EntityKind::Note, note.clone()),
                    target: (EntityKind::Document, datasheet.clone()),
                    relation_type: "related_to".to_owned(),
                    origin: RelationOrigin::User,
                    confidence: None,
                    provenance: serde_json::json!({}),
                },
            )
            .map(|_| ())
        })
        .expect("relation");
    let summary = folder
        .export(
            &ExportScope::Workspace {
                id: cooking.clone(),
            },
            &HashMap::new(),
        )
        .expect("export");
    let root = PathBuf::from(&summary.folder);
    assert!(
        summary.folder.contains("ARCHIVE-export-Cuisine-"),
        "{}",
        summary.folder
    );
    assert_eq!(
        (summary.documents, summary.notes, summary.workspaces),
        (1, 1, 1)
    );
    // The relation leads outside the workspace: not exported.
    assert_eq!(summary.relations, 0);
    assert!(
        root.join("documents")
            .join("Cuisine")
            .join("recette.txt")
            .is_file()
    );
    assert!(!root.join("documents").join("Électronique").exists());
    let archive: Value = serde_json::from_str(&read(&root.join("archive.json"))).expect("json");
    assert_eq!(archive["scope"]["name"], "Cuisine");
    assert_eq!(archive["conversations"], serde_json::json!([]));
    assert!(!read(&root.join("archive.json")).contains(&datasheet));
    let _ = recipe;

    // A workspace that does not exist is refused.
    assert!(matches!(
        folder.export(&ExportScope::Workspace { id: new_id() }, &HashMap::new()),
        Err(AppError::NotFound { .. })
    ));
}

#[test]
fn an_export_never_writes_into_the_data_folder_nor_over_another_folder() {
    let folder = Setup::new();
    let document = folder.document("cours.pdf", b"%PDF cours", None, None);
    assert!(matches!(
        export(
            &folder.database,
            &folder.paths,
            &folder.paths.files_dir,
            &ExportScope::All,
            &HashMap::new(),
            "Sans titre",
            |_| {}
        ),
        Err(AppError::InvalidInput(_))
    ));

    // Twice in the same minute: a second folder, the first untouched.
    let first = folder
        .export(&ExportScope::All, &HashMap::new())
        .expect("first");
    fs::write(PathBuf::from(&first.folder).join("mine.txt"), b"mine").expect("write");
    let second = folder
        .export(&ExportScope::All, &HashMap::new())
        .expect("second");
    assert_ne!(first.folder, second.folder);
    assert!(second.folder.ends_with(" (2)"), "{}", second.folder);
    assert_eq!(
        fs::read(PathBuf::from(&first.folder).join("mine.txt")).expect("kept"),
        b"mine"
    );

    // A managed copy that disappeared: named in the summary and in the tables, the rest is exported.
    let stored = FileStore::new(&folder.paths)
        .path_for(&format!("{document}.pdf"))
        .expect("path");
    fs::remove_file(stored).expect("removed");
    folder.note(
        "Toujours là",
        "texte",
        NoteFormat::Plain,
        "texte",
        None,
        None,
    );
    let third = folder
        .export(&ExportScope::All, &HashMap::new())
        .expect("third");
    assert_eq!(third.missing_files, vec!["cours".to_owned()]);
    assert_eq!((third.documents, third.notes), (0, 1));
    let archive: Value =
        serde_json::from_str(&read(&PathBuf::from(&third.folder).join("archive.json")))
            .expect("json");
    assert_eq!(archive["documents"][0]["file"], Value::Null);
}

#[test]
fn names_are_safe_on_windows_and_unique() {
    assert_eq!(segment("CON", "x"), "document_CON");
    assert_eq!(segment("a<b>:c?.txt", "x"), "a_b__c_.txt");
    assert_eq!(segment("   ", "Sans titre"), "Sans titre");
    let long = format!("{}.pdf", "é".repeat(300));
    let short = segment(&long, "x");
    assert_eq!(short.chars().count(), NAME_MAX);
    assert!(short.ends_with(".pdf"));

    let mut names = Names::default();
    let folder = vec!["Cours".to_owned()];
    assert_eq!(names.claim(&folder, "Schéma.png", true), "Schéma.png");
    assert_eq!(names.claim(&folder, "SCHÉMA.png", true), "SCHÉMA (2).png");
    assert_eq!(names.claim(&folder, "schéma.png", true), "schéma (3).png");
    assert_eq!(
        names.claim(&[], "Schéma.png", true),
        "Schéma.png",
        "another folder"
    );
    assert_eq!(names.claim(&folder, "v1.2", false), "v1.2");
    assert_eq!(
        names.claim(&folder, "V1.2", false),
        "V1.2 (2)",
        "a folder keeps its dots"
    );
}

#[test]
fn table_cells_follow_rfc_4180_and_never_start_a_formula() {
    assert_eq!(cell("simple"), "simple");
    assert_eq!(cell("a,b"), "\"a,b\"");
    assert_eq!(cell("dit \"oui\""), "\"dit \"\"oui\"\"\"");
    assert_eq!(cell("deux\nlignes"), "\"deux\nlignes\"");
    assert_eq!(cell("=1+1"), "'=1+1");
    assert_eq!(cell("-5 °C"), "'-5 °C");
    assert_eq!(cell("@cmd"), "'@cmd");
    assert_eq!(cell("+33"), "'+33");
}

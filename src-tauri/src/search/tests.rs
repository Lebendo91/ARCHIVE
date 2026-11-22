//! Search, end to end on a real database: what is written is found, changes reach the index in the same
//! transaction, and nothing the user types is read as FTS5 syntax.

use rusqlite::Transaction;

use super::history;
use super::index::{self, PAGE_BREAK};
use super::query::{
    DateField, SearchHit, SearchKind, SearchRequest, SearchResults, SearchSort, search,
};
use crate::db::Database;
use crate::db::testing::open_temporary;
use crate::error::AppResult;
use crate::repo::TokenColor;
use crate::repo::documents::{self, NewDocument};
use crate::repo::notes::{self, NoteContent, NoteFormat};
use crate::repo::tags::{self, Tagged};
use crate::repo::workspaces::{self, NewWorkspace};
use crate::util::new_id;

fn request(text: &str) -> SearchRequest {
    SearchRequest {
        text: text.to_owned(),
        kinds: None,
        workspace_id: None,
        tag_id: None,
        date_field: None,
        date_from: None,
        date_to: None,
        favorites_only: false,
        sort: SearchSort::Relevance,
        limit: 20,
        offset: 0,
    }
}

fn run(database: &Database, request: &SearchRequest) -> SearchResults {
    database
        .read(|connection| search(connection, request))
        .expect("search runs")
}

fn titles(results: &SearchResults) -> Vec<String> {
    results.hits.iter().map(title_of).collect()
}

fn title_of(hit: &SearchHit) -> String {
    hit.title
        .iter()
        .map(|segment| segment.text.as_str())
        .collect()
}

fn matched(segments: &[super::query::TextSegment]) -> Vec<String> {
    segments
        .iter()
        .filter(|segment| segment.matched)
        .map(|segment| segment.text.clone())
        .collect()
}

fn document(transaction: &Transaction<'_>, title: &str, text: &str) -> AppResult<String> {
    let id = new_id();
    documents::insert(
        transaction,
        &NewDocument {
            stored_filename: format!("{id}.pdf"),
            id: id.clone(),
            title: title.to_owned(),
            original_filename: format!("{}.pdf", title.to_lowercase().replace(' ', "-")),
            file_extension: "pdf".to_owned(),
            mime_type: "application/pdf".to_owned(),
            file_size: 2_048,
            content_hash: format!("{:0>64}", id.replace('-', "")),
            workspace_id: None,
            folder_id: None,
            metadata: serde_json::json!({ "author": "Alice Martin" }),
        },
    )?;
    documents::set_content(transaction, &id, text, "test")?;
    Ok(id)
}

fn note(transaction: &Transaction<'_>, title: &str, text: &str) -> AppResult<String> {
    Ok(notes::create(
        transaction,
        &NoteContent {
            title: title.to_owned(),
            content: text.to_owned(),
            content_format: NoteFormat::Plain,
            content_text: text.to_owned(),
        },
        None,
        None,
    )?
    .id)
}

fn workspace(transaction: &Transaction<'_>, name: &str, description: &str) -> AppResult<String> {
    Ok(workspaces::create(
        transaction,
        &NewWorkspace {
            name: name.to_owned(),
            description: Some(description.to_owned()),
            color: None,
            icon: None,
        },
    )?
    .id)
}

#[test]
fn documents_notes_workspaces_and_tags_are_found_whatever_the_case_and_accents() {
    let (_dir, database) = open_temporary();
    let (document_id, note_id) = database
        .write(|transaction| {
            workspace(transaction, "Électronique", "Cours de l'IUT")?;
            let revision = tags::create(transaction, "Révisions", TokenColor::Amber)?;
            let document_id = document(
                transaction,
                "Fiche technique NE555",
                &format!(
                    "Timer NE555{PAGE_BREAK}Brochage : la broche 8 est l’alimentation VCC.{PAGE_BREAK}Montage astable"
                ),
            )?;
            let note_id = note(
                transaction,
                "Loi des nœuds",
                "La somme des courants entrants est égale à la somme des courants sortants.",
            )?;
            tags::attach(transaction, &revision.id, Tagged::Note(&note_id))?;
            Ok((document_id, note_id))
        })
        .expect("written");

    // The page of the passage found, with the word highlighted.
    let results = run(&database, &request("ALIMENTATION "));
    assert_eq!(titles(&results), vec!["Fiche technique NE555"]);
    let hit = &results.hits[0];
    assert_eq!(
        (hit.kind, hit.id.as_str(), hit.page),
        (SearchKind::Document, document_id.as_str(), Some(2))
    );
    assert_eq!(matched(&hit.excerpt), vec!["alimentation"]);

    // Accents and case aside, and a ligature written either way.
    assert_eq!(
        titles(&run(&database, &request("electronique"))),
        vec!["Électronique"]
    );
    let results = run(&database, &request("noeuds "));
    assert_eq!(titles(&results), vec!["Loi des nœuds"]);
    assert_eq!(matched(&results.hits[0].title), vec!["nœuds"]);
    assert_eq!(results.hits[0].id, note_id);

    // A tag, and the items carrying it.
    let results = run(&database, &request("revisions"));
    assert_eq!(results.counts.tags, 1);
    assert_eq!(results.counts.notes, 1);
    let tagged = results
        .hits
        .iter()
        .find(|hit| hit.kind == SearchKind::Note)
        .expect("note");
    assert_eq!(tagged.matched_tags, vec!["Révisions"]);

    // While typing, the last word is the beginning of a word.
    assert_eq!(
        titles(&run(&database, &request("broch"))),
        vec!["Fiche technique NE555"]
    );
    // Metadata: the author of a document, its original file name.
    assert_eq!(run(&database, &request("martin ")).counts.documents, 1);
    assert_eq!(
        run(&database, &request("fiche-technique-ne555.pdf "))
            .counts
            .documents,
        1
    );

    // Part of a word, in a title only, after the whole-word results.
    let results = run(&database, &request("555"));
    assert_eq!(titles(&results), vec!["Fiche technique NE555"]);
    assert!(results.hits[0].partial);
    assert_eq!(matched(&results.hits[0].title), vec!["555"]);
    assert!(run(&database, &request("ristor")).hits.is_empty());
}

#[test]
fn the_index_follows_every_change_in_the_same_transaction() {
    let (_dir, database) = open_temporary();
    let count = |text: &str| run(&database, &request(text)).total;
    let (document_id, note_id, tag_id, workspace_id) = database
        .write(|transaction| {
            let document_id =
                document(transaction, "Datasheet LM741", "Amplificateur opérationnel")?;
            let note_id = note(transaction, "Brouillon", "Premières mesures")?;
            let tag = tags::create(transaction, "Labo", TokenColor::Blue)?;
            tags::attach(transaction, &tag.id, Tagged::Document(&document_id))?;
            let workspace_id = workspace(transaction, "Projets", "")?;
            Ok((document_id, note_id, tag.id, workspace_id))
        })
        .expect("written");
    assert_eq!(count("lm741 "), 1);
    assert_eq!(count("labo "), 2, "the tag and the document carrying it");

    database
        .write(|transaction| {
            documents::rename(transaction, &document_id, "Fiche ampli")?;
            documents::set_content(transaction, &document_id, "Gain en boucle ouverte", "test")?;
            let current = notes::get(transaction, &note_id)?;
            notes::save(
                transaction,
                &note_id,
                current.revision,
                &NoteContent {
                    title: "Mesures du TP".to_owned(),
                    content: "Fréquence de coupure".to_owned(),
                    content_format: NoteFormat::Plain,
                    content_text: "Fréquence de coupure".to_owned(),
                },
            )?;
            tags::rename(transaction, &tag_id, "Atelier")?;
            workspaces::update(
                transaction,
                &workspace_id,
                &workspaces::WorkspacePatch {
                    name: Some("Projets perso".to_owned()),
                    ..Default::default()
                },
            )?;
            Ok(())
        })
        .expect("changed");
    // The original file name keeps the old words searchable; the title shown is the new one.
    assert_eq!(
        titles(&run(&database, &request("lm741 "))),
        vec!["Fiche ampli"]
    );
    assert_eq!(count("operationnel "), 0);
    assert_eq!(count("boucle "), 1);
    assert_eq!(count("premieres "), 0);
    assert_eq!(count("coupure "), 1);
    assert_eq!(count("labo "), 0);
    assert_eq!(count("atelier "), 2);
    assert_eq!(count("perso "), 1);

    // A rolled back transaction leaves the index as it was.
    let failed: AppResult<()> = database.write(|transaction| {
        documents::rename(transaction, &document_id, "Titre jamais enregistré")?;
        Err(crate::error::AppError::Internal(
            "simulated failure".to_owned(),
        ))
    });
    assert!(failed.is_err());
    assert_eq!(count("jamais "), 0);
    assert_eq!(count("ampli "), 1);

    // The trash hides, a purge removes the rows themselves.
    database
        .write(|transaction| documents::trash(transaction, &document_id).map(|_| ()))
        .expect("trashed");
    assert_eq!(count("boucle "), 0);
    database
        .write(|transaction| documents::restore(transaction, &document_id).map(|_| ()))
        .expect("restored");
    assert_eq!(count("boucle "), 1);
    database
        .write(|transaction| {
            tags::delete(transaction, &tag_id)?;
            documents::trash(transaction, &document_id)?;
            documents::purge(transaction, &document_id)?;
            workspaces::delete(transaction, &workspace_id)?;
            Ok(())
        })
        .expect("deleted");
    assert_eq!(count("atelier "), 0);
    assert_eq!(count("perso "), 0);
    let rows: i64 = database
        .read(|connection| {
            Ok(connection.query_row(
                "SELECT count(*) FROM search_entries WHERE entity_id IN (?1, ?2, ?3)",
                [&document_id, &tag_id, &workspace_id],
                |row| row.get(0),
            )?)
        })
        .expect("count");
    assert_eq!(rows, 0, "no row left for purged or deleted entities");
}

#[test]
fn filters_ranking_and_pages() {
    let (_dir, database) = open_temporary();
    let (in_title, favorite, tagged, workspace_id, tag_id) = database
        .write(|transaction| {
            let workspace_id = workspace(transaction, "Automatisme", "")?;
            let tag = tags::create(transaction, "Sécurité", TokenColor::Danger)?;
            let in_body = note(
                transaction,
                "Compte rendu",
                "Le relais thermique protège le moteur.",
            )?;
            let in_title = note(
                transaction,
                "Relais thermique",
                "Réglage du courant nominal.",
            )?;
            let favorite = note(transaction, "Câblage", "Un relais thermique par moteur.")?;
            notes::set_favorite(transaction, &favorite, true)?;
            let tagged = document(
                transaction,
                "Norme NF C 15-100",
                "Relais thermique et disjoncteur",
            )?;
            tags::attach(transaction, &tag.id, Tagged::Document(&tagged))?;
            documents::set_favorite(transaction, &tagged, false)?;
            transaction.execute(
                "UPDATE notes SET workspace_id = ?1 WHERE id = ?2",
                [&workspace_id, &in_body],
            )?;
            Ok((in_title, favorite, tagged, workspace_id, tag.id))
        })
        .expect("written");

    // The title weighs most; between two text matches, the favorite comes first.
    let results = run(&database, &request("relais thermique "));
    assert_eq!(results.total, 4);
    assert_eq!(results.hits[0].id, in_title);
    let order: Vec<&str> = results.hits.iter().map(|hit| hit.id.as_str()).collect();
    let favorite_at = order
        .iter()
        .position(|id| *id == favorite)
        .expect("favorite");
    assert!(favorite_at <= 2, "the favorite is not last: {order:?}");

    // Kinds, with the counts of every kind.
    let mut only_documents = request("relais thermique ");
    only_documents.kinds = Some(vec![SearchKind::Document]);
    let results = run(&database, &only_documents);
    assert_eq!(results.total, 1);
    assert_eq!(results.hits[0].id, tagged);
    assert_eq!((results.counts.documents, results.counts.notes), (1, 3));

    // Workspace, tag, favorites.
    let mut in_workspace = request("relais ");
    in_workspace.workspace_id = Some(workspace_id.clone());
    assert_eq!(titles(&run(&database, &in_workspace)), vec!["Compte rendu"]);
    let mut with_tag = request("relais ");
    with_tag.tag_id = Some(tag_id.clone());
    assert_eq!(
        titles(&run(&database, &with_tag)),
        vec!["Norme NF C 15-100"]
    );
    let mut favorites = request("relais ");
    favorites.favorites_only = true;
    assert_eq!(titles(&run(&database, &favorites)), vec!["Câblage"]);

    // Filters alone list the items, most recent first.
    let mut tag_only = request("");
    tag_only.tag_id = Some(tag_id);
    let results = run(&database, &tag_only);
    assert_eq!(titles(&results), vec!["Norme NF C 15-100"]);
    assert_eq!(
        results.hits[0].excerpt[0].text,
        "Relais thermique et disjoncteur"
    );

    // Dates: nothing was added in the future.
    let mut future = request("relais ");
    future.date_field = Some(DateField::Added);
    future.date_from = Some(crate::util::now_ms() + 60_000);
    assert_eq!(run(&database, &future).total, 0);

    // Pages.
    let mut second = request("relais thermique ");
    second.limit = 2;
    second.offset = 2;
    let page = run(&database, &second);
    assert_eq!((page.total, page.hits.len()), (4, 2));
    second.sort = SearchSort::Date;
    second.offset = 0;
    let by_date = run(&database, &second);
    assert!(by_date.hits[0].date >= by_date.hits[1].date);

    // Nothing typed and no filter: nothing listed.
    assert_eq!(run(&database, &request("   ")).total, 0);
    let _ = favorite;
}

#[test]
fn fts5_syntax_typed_by_the_user_is_never_interpreted() {
    let (_dir, database) = open_temporary();
    database
        .write(|transaction| note(transaction, "Secret", "Contenu banal").map(|_| ()))
        .expect("written");
    for typed in [
        "\"",
        "\"\"\"",
        "*",
        "secret*",
        "NEAR(secret banal)",
        "title:secret",
        "body:banal OR 1=1",
        "secret) OR (banal",
        "^secret",
        "-",
        "secret AND",
        "'; DROP TABLE notes; --",
        "{title body}: secret",
        "\u{E000}secret\u{E001}",
    ] {
        let results = database.read(|connection| search(connection, &request(typed)));
        assert!(results.is_ok(), "{typed:?} fails: {results:?}");
    }
    // The words themselves are searched: « title:secret » is the word « title » and the word « secret ».
    assert_eq!(run(&database, &request("title:secret ")).total, 0);
    assert_eq!(run(&database, &request("NEAR(secret banal)")).total, 0);
    assert_eq!(run(&database, &request("secret ")).total, 1);
    let tables: i64 = database
        .read(|connection| {
            Ok(connection.query_row(
                "SELECT count(*) FROM sqlite_master WHERE name = 'notes'",
                [],
                |row| row.get(0),
            )?)
        })
        .expect("schema");
    assert_eq!(tables, 1);
}

#[test]
fn the_index_is_rebuilt_from_the_data_when_its_version_changes() {
    let (_dir, database) = open_temporary();
    database
        .write(|transaction| note(transaction, "Oscilloscope", "Sonde atténuatrice").map(|_| ()))
        .expect("written");
    let current = database.write(index::ensure_current).expect("checked");
    assert_eq!(
        current,
        Some(1),
        "a new database is built at the first check"
    );
    assert_eq!(
        database.write(index::ensure_current).expect("checked"),
        None
    );
    database
        .write(|transaction| {
            transaction.execute_batch(
                "DELETE FROM search_index; DELETE FROM search_titles; DELETE FROM search_entries;
                 UPDATE search_index_state SET version = 0;",
            )?;
            Ok(())
        })
        .expect("emptied");
    assert_eq!(run(&database, &request("sonde ")).total, 0);
    let rebuilt = database.write(index::ensure_current).expect("rebuilt");
    assert_eq!(rebuilt, Some(1));
    assert_eq!(run(&database, &request("sonde ")).total, 1);
}

#[test]
fn the_history_keeps_each_search_once_most_recent_first() {
    let (_dir, database) = open_temporary();
    database
        .write(|transaction| {
            history::record(transaction, "NE555  brochage")?;
            history::record(transaction, "loi d'Ohm")?;
            history::record(transaction, "ne555 Brochage")?;
            Ok(())
        })
        .expect("recorded");
    let entries = database
        .read(|connection| history::list(connection, 10))
        .expect("listed");
    let queries: Vec<&str> = entries.iter().map(|entry| entry.query.as_str()).collect();
    assert_eq!(queries, vec!["ne555 Brochage", "loi d'Ohm"]);
    database
        .write(|transaction| {
            for index in 0..60 {
                history::record(transaction, &format!("recherche {index}"))?;
            }
            Ok(())
        })
        .expect("recorded");
    let entries = database
        .read(|connection| history::list(connection, 50))
        .expect("listed");
    assert_eq!(entries.len(), 50);
    assert_eq!(entries[0].query, "recherche 59");
    let first = entries[0].id.clone();
    database
        .write(|transaction| history::delete(transaction, &first))
        .expect("deleted");
    assert_eq!(
        database
            .read(|connection| history::list(connection, 50))
            .expect("listed")[0]
            .query,
        "recherche 58"
    );
    database.write(history::clear).expect("cleared");
    assert!(
        database
            .read(|connection| history::list(connection, 50))
            .expect("listed")
            .is_empty()
    );
    assert!(
        database
            .write(|transaction| history::record(transaction, "  "))
            .is_err()
    );
}

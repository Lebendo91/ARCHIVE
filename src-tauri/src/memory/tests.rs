//! The memory engine on a real database: what is written gets processed, stage after stage; suggestions are
//! made from shared terms, with their provenance, and the user's decisions are never undone.

use rusqlite::{Transaction, params};

use super::concepts::{
    self, ConceptAvailability, ConceptExtractor, ConceptKind, ExtractedConcept, Mention,
};
use super::normalize::LanguageSource;
use super::queue::{self, JobStage, MAX_ATTEMPTS, NOTE_DELAY_MS};
use super::status::{self, PipelineStage};
use super::{ItemKind, MEMORY_VERSION, analysis, normalize, relate, worker};
use crate::db::Database;
use crate::db::testing::open_temporary;
use crate::error::AppResult;
use crate::repo::TokenColor;
use crate::repo::documents::{self, NewDocument, ProcessingStatus};
use crate::repo::notes::{self, NoteContent, NoteFormat};
use crate::repo::relations::{self, Relation, RelationOrigin, RelationStatus};
use crate::repo::tags::{self, Tagged};
use crate::util::{new_id, now_ms};

/// Far enough in the future for every delayed job to be due.
fn later() -> i64 {
    now_ms() + 24 * 60 * 60 * 1000
}

fn document(
    transaction: &Transaction<'_>,
    title: &str,
    text: &str,
    metadata: serde_json::Value,
) -> AppResult<String> {
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
            metadata,
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

fn save(database: &Database, id: &str, title: &str, text: &str) {
    database
        .write(|transaction| {
            let revision = notes::get(transaction, id)?.revision;
            notes::save(
                transaction,
                id,
                revision,
                &NoteContent {
                    title: title.to_owned(),
                    content: text.to_owned(),
                    content_format: NoteFormat::Plain,
                    content_text: text.to_owned(),
                },
            )
            .map(|_| ())
        })
        .expect("saved");
}

fn stage_status(
    database: &Database,
    kind: ItemKind,
    id: &str,
    stage: PipelineStage,
) -> ProcessingStatus {
    database
        .read(|connection| status::stages(connection, kind, id))
        .expect("stages")
        .into_iter()
        .find(|state| state.stage == stage)
        .expect("stage")
        .status
}

fn relations_of(database: &Database, kind: ItemKind, id: &str) -> Vec<Relation> {
    database
        .read(|connection| relations::list_for_entity(connection, kind.entity(), id))
        .expect("relations")
}

fn suggestion_between(
    database: &Database,
    a: (ItemKind, &str),
    b: (ItemKind, &str),
) -> Option<Relation> {
    relations_of(database, a.0, a.1)
        .into_iter()
        .find(|relation| {
            relation.relation_type == relate::RELATED
                && [
                    (relation.source_type, relation.source_id.as_str()),
                    (relation.target_type, relation.target_id.as_str()),
                ]
                .contains(&(b.0.entity(), b.1))
        })
}

const TIMER_A: &str = "Le timer NE555 en montage astable produit un signal carré. La fréquence du NE555 dépend \
                       des résistances R1 et R2 et du condensateur C. En astable, le NE555 oscille sans arrêt.";
const TIMER_B: &str = "Montage astable à NE555 : la broche 3 donne le signal de sortie. Pour changer la fréquence \
                       de l'astable, on modifie le condensateur du NE555.";
/// Long enough for its language to be recognized.
const COURSE: &str = "Dans ce cours, nous verrons comment les composants sont reliés entre eux pour que le \
                      montage fonctionne. Les valeurs des résistances et du condensateur sont choisies avec soin, \
                      et les mesures sont notées dans un tableau pour que la loi soit vérifiée sur chaque montage.";
const SAFETY: &str = "Avant toute intervention, couper le disjoncteur différentiel et vérifier l'absence de \
                      tension avec un vérificateur d'absence de tension homologué. Le disjoncteur protège.";

#[test]
fn a_change_queues_the_processing_and_each_stage_follows_the_previous_one() {
    let (_dir, database) = open_temporary();
    let id = database
        .write(|transaction| {
            document(
                transaction,
                "Fiche NE555",
                &format!("{TIMER_A} {COURSE}"),
                serde_json::json!({ "format": "pdf" }),
            )
        })
        .expect("written");
    let jobs = database
        .read(|connection| queue::states(connection, ItemKind::Document, &id))
        .expect("jobs");
    assert_eq!(jobs.len(), 1);
    assert_eq!(
        (jobs[0].stage, jobs[0].status),
        (JobStage::Normalization, ProcessingStatus::Pending)
    );
    assert_eq!(
        stage_status(&database, ItemKind::Document, &id, PipelineStage::Import),
        ProcessingStatus::Completed
    );
    assert_eq!(
        stage_status(&database, ItemKind::Document, &id, PipelineStage::Indexing),
        ProcessingStatus::Completed
    );
    assert_eq!(
        stage_status(&database, ItemKind::Document, &id, PipelineStage::Analysis),
        ProcessingStatus::Pending
    );

    // Normalization, then analysis, then relationships: three jobs, one after the other.
    assert_eq!(
        worker::process_all(&database, later()).expect("processed"),
        3
    );
    for stage in [
        PipelineStage::Normalization,
        PipelineStage::Analysis,
        PipelineStage::Relations,
    ] {
        assert_eq!(
            stage_status(&database, ItemKind::Document, &id, stage),
            ProcessingStatus::Completed,
            "{stage:?}"
        );
    }
    let item = database
        .read(|connection| status::item(connection, ItemKind::Document, &id))
        .expect("item");
    let profile = item.profile.expect("profile");
    assert!(profile.words > 20 && profile.characters > 100);
    assert_eq!(profile.language.as_deref(), Some("fr"));
    assert_eq!(profile.language_source, Some(LanguageSource::Detected));
    let labels: Vec<&str> = item.terms.iter().map(|term| term.label.as_str()).collect();
    assert!(labels.contains(&"NE555"), "{labels:?}");
    assert_eq!(item.concept_extraction, ConceptAvailability::NoProvider);
    assert!(item.concepts.is_empty());
    // Nothing left to do.
    assert_eq!(
        worker::process_all(&database, later()).expect("processed"),
        0
    );
}

#[test]
fn a_note_is_processed_once_the_typing_pauses() {
    let (_dir, database) = open_temporary();
    let id = database
        .write(|transaction| note(transaction, "Astable", TIMER_A))
        .expect("written");
    assert_eq!(
        worker::process_all(&database, now_ms()).expect("processed"),
        0,
        "the note is still being typed"
    );
    save(&database, &id, "Astable", TIMER_B);
    let jobs = database
        .read(|connection| queue::states(connection, ItemKind::Note, &id))
        .expect("jobs");
    assert_eq!(jobs.len(), 1, "a save moves the job, it does not add one");
    assert!(jobs[0].run_after >= now_ms() + NOTE_DELAY_MS - 1_000);
    assert_eq!(
        worker::process_all(&database, now_ms() + NOTE_DELAY_MS + 1_000).expect("processed"),
        3
    );
}

#[test]
fn distinctive_terms_are_frequent_in_the_item_and_rare_elsewhere() {
    let (_dir, database) = open_temporary();
    let ids = database
        .write(|transaction| {
            Ok([
                document(transaction, "Timer NE555", TIMER_A, serde_json::json!({}))?,
                note(transaction, "Sécurité électrique", SAFETY)?,
                note(
                    transaction,
                    "Mesures de tension",
                    "La tension se mesure en volts. Une tension continue, une tension alternative.",
                )?,
            ])
        })
        .expect("written");
    worker::process_all(&database, later()).expect("processed");
    let terms = database
        .read(|connection| analysis::get(connection, ItemKind::Document, &ids[0]))
        .expect("terms");
    let labels: Vec<&str> = terms.iter().map(|term| term.label.as_str()).collect();
    assert_eq!(labels.first(), Some(&"NE555"), "{labels:?}");
    assert!(labels.contains(&"astable"), "{labels:?}");
    assert!(
        !labels
            .iter()
            .any(|label| ["dépend", "des", "les", "sans"].contains(label)),
        "{labels:?}"
    );
    assert!(terms.len() <= analysis::TERMS_MAX);
    let safety = database
        .read(|connection| analysis::get(connection, ItemKind::Note, &ids[1]))
        .expect("terms");
    let labels: Vec<&str> = safety.iter().map(|term| term.label.as_str()).collect();
    // The spelling kept is the one written; « disjoncteur » is in the title of nothing but frequent here.
    assert!(labels.contains(&"disjoncteur"), "{labels:?}");
}

#[test]
fn items_sharing_terms_are_suggested_with_why_and_how_sure() {
    let (_dir, database) = open_temporary();
    let (timer, astable, safety) = database
        .write(|transaction| {
            let tag = tags::create(transaction, "Projet NE555", TokenColor::Neutral)?;
            let timer = document(
                transaction,
                "Fiche technique NE555",
                TIMER_A,
                serde_json::json!({}),
            )?;
            let astable = note(transaction, "Montage astable", TIMER_B)?;
            tags::attach(transaction, &tag.id, Tagged::Document(&timer))?;
            tags::attach(transaction, &tag.id, Tagged::Note(&astable))?;
            Ok((timer, astable, note(transaction, "Sécurité", SAFETY)?))
        })
        .expect("written");
    worker::process_all(&database, later()).expect("processed");

    let suggestion = suggestion_between(
        &database,
        (ItemKind::Document, &timer),
        (ItemKind::Note, &astable),
    )
    .expect("suggested");
    assert_eq!(suggestion.origin, RelationOrigin::Rule);
    assert_eq!(
        suggestion.status,
        RelationStatus::Suggested,
        "a suggestion is never a fact"
    );
    let confidence = suggestion.confidence.expect("confidence");
    assert!(confidence > 0.0 && confidence < 1.0, "{confidence}");
    assert_eq!(suggestion.provenance["rule"], relate::RULE);
    let terms = suggestion.provenance["terms"].as_array().expect("terms");
    assert!(terms.iter().any(|term| term == "NE555"), "{terms:?}");
    assert_eq!(
        suggestion.provenance["tags"],
        serde_json::json!(["Projet NE555"])
    );
    // Stored once for the pair, whichever item was processed first.
    let between = relations_of(&database, ItemKind::Note, &astable)
        .into_iter()
        .filter(|relation| relation.relation_type == relate::RELATED)
        .count();
    assert_eq!(between, 1);
    assert!(
        suggestion_between(
            &database,
            (ItemKind::Note, &safety),
            (ItemKind::Document, &timer)
        )
        .is_none()
    );
    assert!(
        suggestion_between(
            &database,
            (ItemKind::Note, &safety),
            (ItemKind::Note, &astable)
        )
        .is_none()
    );
}

#[test]
fn the_user_decides_and_the_engine_never_undoes_it() {
    let (_dir, database) = open_temporary();
    let (timer, astable, other) = database
        .write(|transaction| {
            Ok((
                document(
                    transaction,
                    "Fiche technique NE555",
                    TIMER_A,
                    serde_json::json!({}),
                )?,
                note(transaction, "Montage astable", TIMER_B)?,
                note(
                    transaction,
                    "Astable à NE555",
                    "Le NE555 en astable : la fréquence dépend du condensateur du NE555 astable.",
                )?,
            ))
        })
        .expect("written");
    worker::process_all(&database, later()).expect("processed");
    let accepted = suggestion_between(
        &database,
        (ItemKind::Document, &timer),
        (ItemKind::Note, &astable),
    )
    .expect("first");
    let rejected = suggestion_between(
        &database,
        (ItemKind::Document, &timer),
        (ItemKind::Note, &other),
    )
    .expect("second");
    database
        .write(|transaction| {
            relations::set_status(transaction, &accepted.id, RelationStatus::Accepted)?;
            relations::set_status(transaction, &rejected.id, RelationStatus::Rejected)?;
            Ok(())
        })
        .expect("decided");

    // The items change and are processed again: the decisions stand, nothing is suggested twice.
    save(
        &database,
        &astable,
        "Montage astable",
        &format!("{TIMER_B} Le NE555 reste le cœur du montage."),
    );
    save(
        &database,
        &other,
        "Astable à NE555",
        "Le NE555 en astable, encore : condensateur, fréquence, NE555.",
    );
    worker::process_all(&database, later()).expect("processed");
    let again = suggestion_between(
        &database,
        (ItemKind::Document, &timer),
        (ItemKind::Note, &astable),
    )
    .expect("kept");
    assert_eq!(
        (again.id.as_str(), again.status),
        (accepted.id.as_str(), RelationStatus::Accepted)
    );
    let again = suggestion_between(
        &database,
        (ItemKind::Document, &timer),
        (ItemKind::Note, &other),
    )
    .expect("kept");
    assert_eq!(
        (again.id.as_str(), again.status),
        (rejected.id.as_str(), RelationStatus::Rejected)
    );
    let related = relations_of(&database, ItemKind::Document, &timer)
        .into_iter()
        .filter(|relation| relation.relation_type == relate::RELATED)
        .count();
    assert_eq!(
        related, 2,
        "no second suggestion for a pair already decided"
    );
}

#[test]
fn a_suggestion_that_no_longer_holds_is_removed() {
    let (_dir, database) = open_temporary();
    let (timer, astable) = database
        .write(|transaction| {
            Ok((
                document(
                    transaction,
                    "Fiche technique NE555",
                    TIMER_A,
                    serde_json::json!({}),
                )?,
                note(transaction, "Montage astable", TIMER_B)?,
            ))
        })
        .expect("written");
    worker::process_all(&database, later()).expect("processed");
    assert!(
        suggestion_between(
            &database,
            (ItemKind::Document, &timer),
            (ItemKind::Note, &astable)
        )
        .is_some()
    );
    save(&database, &astable, "Disjoncteurs", SAFETY);
    worker::process_all(&database, later()).expect("processed");
    assert!(
        suggestion_between(
            &database,
            (ItemKind::Document, &timer),
            (ItemKind::Note, &astable)
        )
        .is_none()
    );
}

#[test]
fn a_failed_job_is_tried_again_later_then_waits_for_the_user() {
    let (_dir, database) = open_temporary();
    let id = database
        .write(|transaction| note(transaction, "Astable", TIMER_A))
        .expect("written");
    for attempt in 1..=MAX_ATTEMPTS {
        let job = database
            .write(|transaction| queue::claim_next(transaction, later()))
            .expect("claimed")
            .expect("a job is due");
        assert_eq!(
            (job.stage, job.attempts),
            (JobStage::Normalization, attempt - 1)
        );
        database
            .write(|transaction| queue::fail(transaction, &job, "database", now_ms()))
            .expect("failed");
        let state = database
            .read(|connection| queue::states(connection, ItemKind::Note, &id))
            .expect("jobs")
            .remove(0);
        assert_eq!(state.attempts, attempt);
        assert_eq!(state.last_error.as_deref(), Some("database"));
        if attempt < MAX_ATTEMPTS {
            assert_eq!(state.status, ProcessingStatus::Failed);
            assert!(
                state.run_after > now_ms() + 25_000,
                "tried again later, not at once"
            );
        } else {
            assert_eq!(state.status, ProcessingStatus::NeedsAttention);
        }
    }
    assert!(
        database
            .write(|transaction| queue::claim_next(transaction, later()))
            .expect("claim")
            .is_none()
    );
    let retried = database
        .write(|transaction| queue::retry(transaction, ItemKind::Note, &id, false))
        .expect("retried");
    assert_eq!(retried, 1);
    assert_eq!(
        worker::process_all(&database, later()).expect("processed"),
        3
    );
    assert_eq!(
        stage_status(&database, ItemKind::Note, &id, PipelineStage::Relations),
        ProcessingStatus::Completed
    );
}

#[test]
fn a_job_asked_again_while_it_runs_runs_again_and_interrupted_jobs_resume() {
    let (_dir, database) = open_temporary();
    let id = database
        .write(|transaction| note(transaction, "Astable", TIMER_A))
        .expect("written");
    let job = database
        .write(|transaction| queue::claim_next(transaction, later()))
        .expect("claimed")
        .expect("due");
    save(&database, &id, "Astable", TIMER_B);
    let completed = database
        .write(|transaction| queue::complete(transaction, &job, now_ms()))
        .expect("completed");
    assert!(!completed, "the newer request is still to be processed");
    let state = database
        .read(|connection| queue::states(connection, ItemKind::Note, &id))
        .expect("jobs")
        .remove(0);
    assert_eq!(state.status, ProcessingStatus::Pending);

    // A stop while a job runs: it is queued again at the next start.
    database
        .write(|transaction| queue::claim_next(transaction, later()).map(|_| ()))
        .expect("claimed");
    let queued = database.write(super::ensure_current).expect("checked");
    assert_eq!(queued, Some(1), "a new database processes its items once");
    let state = database
        .read(|connection| queue::states(connection, ItemKind::Note, &id))
        .expect("jobs")
        .remove(0);
    assert_eq!(state.status, ProcessingStatus::Pending);
    assert_eq!(
        database.write(super::ensure_current).expect("checked"),
        None
    );
    let version: i64 = database
        .read(|connection| {
            Ok(connection.query_row("SELECT version FROM memory_state", [], |row| row.get(0))?)
        })
        .expect("version");
    assert_eq!(version, MEMORY_VERSION);
}

#[test]
fn deleting_an_item_permanently_forgets_what_was_derived_from_it() {
    let (_dir, database) = open_temporary();
    let (timer, astable) = database
        .write(|transaction| {
            Ok((
                document(
                    transaction,
                    "Fiche technique NE555",
                    TIMER_A,
                    serde_json::json!({}),
                )?,
                note(transaction, "Montage astable", TIMER_B)?,
            ))
        })
        .expect("written");
    worker::process_all(&database, later()).expect("processed");
    database
        .write(|transaction| {
            documents::trash(transaction, &timer)?;
            documents::purge(transaction, &timer).map(|_| ())
        })
        .expect("purged");
    for table in [
        "processing_jobs",
        "content_profiles",
        "entity_terms",
        "concept_mentions",
    ] {
        let left: i64 = database
            .read(|connection| {
                Ok(connection.query_row(
                    &format!("SELECT count(*) FROM {table} WHERE entity_type = 'document' AND entity_id = ?1"),
                    [&timer],
                    |row| row.get(0),
                )?)
            })
            .expect("count");
        assert_eq!(left, 0, "{table}");
    }
    assert!(relations_of(&database, ItemKind::Note, &astable).is_empty());
}

#[test]
fn the_profile_keeps_what_the_file_declares_and_invents_nothing() {
    let (_dir, database) = open_temporary();
    let (declared, bare) = database
        .write(|transaction| {
            Ok((
                document(
                    transaction,
                    "Cours",
                    "Short English text.",
                    serde_json::json!({
                        "documentTitle": "Électricité générale",
                        "author": "Alice",
                        "authoredAt": "2026-09-01T08:00:00Z",
                        "revisedAt": "pas une date",
                        "declaredLanguage": "fr-FR",
                        "pageCount": 12,
                    }),
                )?,
                document(transaction, "Brochage", "VCC 8", serde_json::json!({}))?,
            ))
        })
        .expect("written");
    worker::process_all(&database, later()).expect("processed");
    let profile = database
        .read(|connection| normalize::get(connection, ItemKind::Document, &declared))
        .expect("read")
        .expect("profile");
    assert_eq!(
        profile.title_in_file.as_deref(),
        Some("Électricité générale")
    );
    assert_eq!(profile.author.as_deref(), Some("Alice"));
    assert_eq!(profile.authored_at, Some(1_788_249_600_000));
    assert_eq!(profile.revised_at, None, "an unreadable date stays unknown");
    assert_eq!(profile.page_count, Some(12));
    assert_eq!(
        (profile.language.as_deref(), profile.language_source),
        (Some("fr"), Some(LanguageSource::Declared)),
        "what the file declares wins over a guess"
    );
    let profile = database
        .read(|connection| normalize::get(connection, ItemKind::Document, &bare))
        .expect("read")
        .expect("profile");
    assert_eq!(
        (profile.title_in_file, profile.author, profile.authored_at),
        (None, None, None)
    );
    assert_eq!(
        (profile.language, profile.language_source),
        (None, None),
        "too short to tell"
    );
    assert_eq!((profile.characters, profile.words), (5, 2));
}

struct Extractor;

impl ConceptExtractor for Extractor {
    fn provenance(&self) -> serde_json::Value {
        serde_json::json!({ "provider": "test", "model": "rules" })
    }

    fn extract(&self, _title: &str, text: &str) -> AppResult<Vec<ExtractedConcept>> {
        Ok(if text.contains("NE555") {
            vec![
                ExtractedConcept {
                    name: "  NE555 ".to_owned(),
                    kind: ConceptKind::Product,
                    confidence: Some(0.9),
                    mentions: vec![Mention {
                        page: Some(1),
                        excerpt: Some("Le timer NE555".to_owned()),
                    }],
                },
                ExtractedConcept {
                    name: "Montage astable".to_owned(),
                    kind: ConceptKind::Method,
                    confidence: None,
                    mentions: Vec::new(),
                },
            ]
        } else {
            Vec::new()
        })
    }
}

#[test]
fn concepts_are_stored_apart_from_the_content_with_their_source() {
    let (_dir, database) = open_temporary();
    let (timer, astable) = database
        .write(|transaction| {
            Ok((
                document(transaction, "Fiche NE555", TIMER_A, serde_json::json!({}))?,
                note(transaction, "Montage astable", TIMER_B)?,
            ))
        })
        .expect("written");
    let availability = database.read(concepts::availability).expect("availability");
    assert_eq!(availability, ConceptAvailability::NoProvider);
    let stored = database
        .write(|transaction| {
            Ok(
                concepts::extract_into(transaction, &Extractor, ItemKind::Document, &timer)?
                    + concepts::extract_into(transaction, &Extractor, ItemKind::Note, &astable)?,
            )
        })
        .expect("extracted");
    assert_eq!(stored, 4);
    let mentions = database
        .read(|connection| concepts::mentions(connection, ItemKind::Document, &timer))
        .expect("mentions");
    assert_eq!(mentions.len(), 2);
    let product = mentions
        .iter()
        .find(|mention| mention.kind == ConceptKind::Product)
        .expect("product");
    assert_eq!((product.name.as_str(), product.page), ("NE555", Some(1)));
    assert_eq!(product.excerpt.as_deref(), Some("Le timer NE555"));
    assert_eq!(product.provenance["provider"], "test");
    // One concept for both items, the content untouched.
    let concepts: i64 = database
        .read(|connection| {
            Ok(connection.query_row("SELECT count(*) FROM concepts", [], |row| row.get(0))?)
        })
        .expect("count");
    assert_eq!(concepts, 2);
    let text: String = database
        .read(|connection| {
            Ok(connection.query_row(
                "SELECT content_text FROM document_contents WHERE document_id = ?1",
                params![timer],
                |row| row.get(0),
            )?)
        })
        .expect("content");
    assert_eq!(text, TIMER_A);
    // Extracting again replaces; a concept mentioned nowhere goes.
    database
        .write(|transaction| {
            concepts::store(
                transaction,
                ItemKind::Document,
                &timer,
                &[],
                &serde_json::json!({}),
            )?;
            concepts::store(
                transaction,
                ItemKind::Note,
                &astable,
                &[],
                &serde_json::json!({}),
            )
        })
        .expect("cleared");
    let concepts: i64 = database
        .read(|connection| {
            Ok(connection.query_row("SELECT count(*) FROM concepts", [], |row| row.get(0))?)
        })
        .expect("count");
    assert_eq!(concepts, 0);
}

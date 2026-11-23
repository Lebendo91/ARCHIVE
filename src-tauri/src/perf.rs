//! Indicative performance on a generated corpus: full-text search, and the processing of the memory engine.
//! Not run by default (it takes a while and its figures depend on the machine); run it in release mode and read
//! what it prints:
//!
//! `cargo test --release --lib perf:: -- --ignored --nocapture`

use std::time::{Duration, Instant};

use crate::db::Database;
use crate::db::testing::open_temporary;
use crate::memory::{self, ItemKind, worker};
use crate::repo::documents::{self, NewDocument};
use crate::repo::notes::{self, NoteContent, NoteFormat};
use crate::search::index::{self, PAGE_BREAK};
use crate::search::query::{DateField, SearchKind, SearchRequest, SearchSort, search};
use crate::util::{new_id, now_ms};

const DOCUMENTS: usize = 2_000;
const PAGES: usize = 8;
const WORDS_PER_PAGE: usize = 250;
const NOTES: usize = 3_000;
const WORDS_PER_NOTE: usize = 120;
const BATCH: usize = 200;
const RUNS: usize = 30;

/// Words of the field, frequent in the corpus; the generated ones make up the long tail.
const COMMON: &[&str] = &[
    "tension",
    "courant",
    "résistance",
    "condensateur",
    "montage",
    "fréquence",
    "signal",
    "alimentation",
    "circuit",
    "mesure",
    "broche",
    "transistor",
    "amplificateur",
    "microcontrôleur",
    "interruption",
    "programme",
    "capteur",
    "sortie",
    "entrée",
    "réglage",
];

/// Deterministic generator (xorshift): the same corpus at every run.
struct Generator(u64);

impl Generator {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }

    fn below(&mut self, bound: usize) -> usize {
        (self.next() % bound as u64) as usize
    }

    /// Indexes skewed towards the start, like the frequencies of the words of a language.
    fn skewed(&mut self, bound: usize) -> usize {
        let uniform = (self.next() % 1_000_000) as f64 / 1_000_000.0;
        ((uniform.powi(3)) * bound as f64) as usize
    }
}

fn vocabulary(generator: &mut Generator) -> Vec<String> {
    const SYLLABLES: &[&str] = &[
        "ba", "co", "di", "fe", "ga", "lo", "mi", "nu", "pa", "ri", "sé", "ta", "vo", "zu", "tran",
        "cré", "por", "lin", "ment", "tion",
    ];
    let mut words: Vec<String> = COMMON.iter().map(|word| (*word).to_owned()).collect();
    while words.len() < 6_000 {
        let length = 2 + generator.below(3);
        let word: String = (0..length)
            .map(|_| SYLLABLES[generator.below(SYLLABLES.len())])
            .collect();
        if !words.contains(&word) {
            words.push(word);
        }
    }
    words
}

fn text(generator: &mut Generator, words: &[String], count: usize) -> String {
    let mut text = String::with_capacity(count * 9);
    for index in 0..count {
        if index > 0 {
            text.push(if index % 14 == 0 { '\n' } else { ' ' });
        }
        text.push_str(&words[generator.skewed(words.len())]);
    }
    text
}

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
        limit: 24,
        offset: 0,
    }
}

fn percentile(sorted: &[Duration], share: f64) -> Duration {
    let index = ((sorted.len() as f64 - 1.0) * share).round() as usize;
    sorted[index]
}

fn measure(database: &Database, label: &str, request: &SearchRequest) {
    let mut times = Vec::with_capacity(RUNS);
    let mut total = 0;
    for _ in 0..RUNS {
        let started = Instant::now();
        let results = database
            .read(|connection| search(connection, request))
            .expect("search runs");
        times.push(started.elapsed());
        total = results.total;
    }
    times.sort();
    println!(
        "{label:<44} {total:>6} results   median {:>7.1} ms   p95 {:>7.1} ms   max {:>7.1} ms",
        percentile(&times, 0.5).as_secs_f64() * 1000.0,
        percentile(&times, 0.95).as_secs_f64() * 1000.0,
        times.last().copied().unwrap_or_default().as_secs_f64() * 1000.0,
    );
    assert!(total > 0, "{label}: the corpus holds these words");
}

/// Writes `document_count` documents of [`PAGES`] pages and `note_count` notes; returns the characters written.
fn write_corpus(
    database: &Database,
    generator: &mut Generator,
    words: &[String],
    document_count: usize,
    note_count: usize,
) -> usize {
    let mut characters = 0usize;
    for batch in 0..document_count / BATCH {
        let pages: Vec<(String, String)> = (0..BATCH)
            .map(|index| {
                let title = format!(
                    "{} {} {}",
                    words[generator.skewed(words.len())],
                    words[generator.below(words.len())],
                    batch * BATCH + index
                );
                let body = (0..PAGES)
                    .map(|_| text(generator, words, WORDS_PER_PAGE))
                    .collect::<Vec<_>>()
                    .join(&PAGE_BREAK.to_string());
                (title, body)
            })
            .collect();
        characters += pages.iter().map(|(_, body)| body.len()).sum::<usize>();
        database
            .write(|transaction| {
                for (title, body) in &pages {
                    let id = new_id();
                    documents::insert(
                        transaction,
                        &NewDocument {
                            stored_filename: format!("{id}.pdf"),
                            id: id.clone(),
                            title: title.clone(),
                            original_filename: format!("{}.pdf", title.replace(' ', "-")),
                            file_extension: "pdf".to_owned(),
                            mime_type: "application/pdf".to_owned(),
                            file_size: body.len() as i64,
                            content_hash: format!("{:0>64}", id.replace('-', "")),
                            workspace_id: None,
                            folder_id: None,
                            metadata: serde_json::json!({ "pageCount": PAGES }),
                        },
                    )?;
                    documents::set_content(transaction, &id, body, "perf")?;
                }
                Ok(())
            })
            .expect("documents written");
    }
    for _ in 0..note_count / BATCH {
        let contents: Vec<(String, String)> = (0..BATCH)
            .map(|_| {
                (
                    format!(
                        "{} {}",
                        words[generator.skewed(words.len())],
                        words[generator.below(words.len())]
                    ),
                    text(generator, words, WORDS_PER_NOTE),
                )
            })
            .collect();
        characters += contents.iter().map(|(_, body)| body.len()).sum::<usize>();
        database
            .write(|transaction| {
                for (title, body) in &contents {
                    notes::create(
                        transaction,
                        &NoteContent {
                            title: title.clone(),
                            content: body.clone(),
                            content_format: NoteFormat::Plain,
                            content_text: body.clone(),
                        },
                        None,
                        None,
                    )?;
                }
                Ok(())
            })
            .expect("notes written");
    }
    characters
}

#[test]
#[ignore = "indicative performance: run explicitly, in release mode"]
fn search_on_a_generated_corpus() {
    let (dir, database) = open_temporary();
    let mut generator = Generator(0x5eed_a5c1_1e55_0001);
    let words = vocabulary(&mut generator);

    // Writing: every document and note is indexed in the transaction that writes it.
    let started = Instant::now();
    let characters = write_corpus(&database, &mut generator, &words, DOCUMENTS, NOTES);
    let written = started.elapsed();

    // Rebuilding from scratch, as after an update that changes the rules of the index.
    database
        .write(|transaction| {
            transaction.execute("UPDATE search_index_state SET version = 0 WHERE id = 1", [])?;
            Ok(())
        })
        .expect("marked out of date");
    let started = Instant::now();
    let rebuilt = database
        .write(index::ensure_current)
        .expect("rebuilt")
        .unwrap_or_default();
    let rebuild = started.elapsed();
    let size = std::fs::metadata(dir.path().join("archive.db"))
        .map(|metadata| metadata.len())
        .unwrap_or_default();

    println!();
    println!(
        "corpus: {DOCUMENTS} documents of {PAGES} pages and {NOTES} notes, {:.1} MB of text",
        characters as f64 / 1_000_000.0
    );
    println!(
        "written and indexed in {:.1} s ({:.0} items/s); full rebuild of {rebuilt} items in {:.1} s; database {:.0} MB",
        written.as_secs_f64(),
        (DOCUMENTS + NOTES) as f64 / written.as_secs_f64(),
        rebuild.as_secs_f64(),
        size as f64 / 1_000_000.0
    );
    println!("searches ({RUNS} runs each, palette page of 24 results):");

    let rare = words[words.len() - 1].clone();
    measure(&database, "frequent word", &request("tension"));
    measure(&database, "two frequent words", &request("tension courant"));
    measure(&database, "word being typed (prefix)", &request("condens"));
    measure(&database, "rare word", &request(&rare));
    measure(&database, "phrase", &request("\"tension courant\""));
    measure(
        &database,
        "word and exclusion",
        &request("montage -transistor"),
    );
    measure(
        &database,
        "partial title (trigram)",
        &request(&words[30][1..]),
    );
    let mut filtered = request("signal mesure");
    filtered.kinds = Some(vec![SearchKind::Document]);
    filtered.date_field = Some(DateField::Added);
    filtered.date_from = Some(0);
    filtered.sort = SearchSort::Date;
    measure(&database, "two words, documents, by date", &filtered);
    let mut deep = request("tension");
    deep.limit = 20;
    deep.offset = 400;
    measure(&database, "frequent word, results 401 to 420", &deep);
}

/// Documents and notes for the measure of the memory engine (it processes each one three times).
const MEMORY_DOCUMENTS: usize = 1_000;
const MEMORY_NOTES: usize = 1_000;

#[test]
#[ignore = "indicative performance: run explicitly, in release mode"]
fn memory_engine_on_a_generated_corpus() {
    let (_dir, database) = open_temporary();
    let mut generator = Generator(0x5eed_a5c1_1e55_0002);
    let words = vocabulary(&mut generator);
    let characters = write_corpus(
        &database,
        &mut generator,
        &words,
        MEMORY_DOCUMENTS,
        MEMORY_NOTES,
    );

    // Every write queued its item: the worker processes the whole knowledge base, as after a first import.
    let started = Instant::now();
    let jobs = worker::process_all(&database, now_ms() + 86_400_000).expect("processed");
    let elapsed = started.elapsed();
    let items = MEMORY_DOCUMENTS + MEMORY_NOTES;
    let (suggestions, terms): (i64, i64) = database
        .read(|connection| {
            Ok((
                connection.query_row(
                    "SELECT count(*) FROM relations WHERE status = 'suggested'",
                    [],
                    |row| row.get(0),
                )?,
                connection.query_row("SELECT count(*) FROM entity_terms", [], |row| row.get(0))?,
            ))
        })
        .expect("counted");
    println!();
    println!(
        "corpus: {MEMORY_DOCUMENTS} documents of {PAGES} pages and {MEMORY_NOTES} notes, {:.1} MB of text",
        characters as f64 / 1_000_000.0
    );
    println!(
        "processed {jobs} jobs in {:.1} s: {:.0} items/s ({:.1} ms per item for its three stages)",
        elapsed.as_secs_f64(),
        items as f64 / elapsed.as_secs_f64(),
        elapsed.as_secs_f64() * 1000.0 / items as f64
    );
    println!(
        "{terms} distinctive terms, {suggestions} suggested relations ({:.1} per item)",
        suggestions as f64 * 2.0 / items as f64
    );
    assert_eq!(jobs, items * 3, "three stages for each item");

    // What the interface reads for one item.
    let id: String = database
        .read(|connection| {
            Ok(connection.query_row("SELECT id FROM notes LIMIT 1", [], |row| row.get(0))?)
        })
        .expect("a note");
    let mut times = Vec::with_capacity(30);
    for _ in 0..30 {
        let started = Instant::now();
        database
            .read(|connection| {
                memory::status::item(connection, ItemKind::Note, &id)?;
                crate::services::relations::list(connection, ItemKind::Note, &id)
            })
            .expect("read");
        times.push(started.elapsed());
    }
    times.sort();
    println!(
        "analysis and relations of a note, as the interface reads them: median {:.1} ms, p95 {:.1} ms",
        percentile(&times, 0.5).as_secs_f64() * 1000.0,
        percentile(&times, 0.95).as_secs_f64() * 1000.0
    );
}

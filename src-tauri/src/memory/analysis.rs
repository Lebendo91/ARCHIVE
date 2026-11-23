//! Analysis without AI: the distinctive terms of each item, the words that characterize it in the knowledge
//! base. A word counts more when it is frequent in the item (and more again in its title) and rare elsewhere:
//! how rare is read in the full-text index (`search_vocabulary`), as the share of passages holding it.

use std::collections::HashMap;

use rusqlite::{Connection, OptionalExtension, Transaction, params};
use serde::Serialize;
use ts_rs::TS;

use super::{ItemKind, ItemText};
use crate::error::AppResult;
use crate::util::fold_for_search;

/// Terms kept for each item.
pub const TERMS_MAX: usize = 12;
/// Words looked up in the index, the most frequent of the item first.
const CANDIDATES_MAX: usize = 300;
/// A word of the title counts as this many occurrences.
const TITLE_WEIGHT: usize = 3;
const WORD_MIN_CHARS: usize = 3;
const WORD_MAX_CHARS: usize = 40;

/// Common words that never characterize an item, beyond those the search leaves out.
const COMMON_WORDS: &[&str] = &[
    "ainsi", "alors", "apres", "aussi", "autre", "autres", "avant", "avoir", "bien", "car", "cela",
    "celle", "celui", "ceux", "chaque", "comme", "comment", "dont", "donc", "elles", "encore",
    "entre", "est", "etait", "ete", "etre", "fait", "faire", "faut", "ils", "lorsque", "meme",
    "mais", "nous", "peu", "peut", "peuvent", "plus", "quand", "sont", "sous", "tous", "tout",
    "toute", "toutes", "tres", "vers", "voir", "vous", "about", "after", "all", "also", "any",
    "been", "before", "being", "but", "can", "could", "each", "had", "has", "have", "how", "into",
    "may", "might", "more", "most", "must", "not", "one", "only", "other", "over", "same",
    "should", "some", "such", "than", "then", "there", "them", "they", "two", "use", "used",
    "using", "very", "what", "when", "where", "which", "while", "who", "will", "would", "you",
];

/// A distinctive term of an item.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Term {
    /// Folded form (lowercase, without accents), as the search index holds it.
    pub term: String,
    /// The most frequent spelling in the item.
    pub label: String,
    pub weight: f64,
    pub occurrences: i64,
}

/// The words of a text that may characterize it: folded form and spelling.
pub fn words(text: &str) -> impl Iterator<Item = (String, &str)> {
    text.split(|character: char| !character.is_alphanumeric())
        .filter_map(|word| {
            let length = word.chars().count();
            if !(WORD_MIN_CHARS..=WORD_MAX_CHARS).contains(&length)
                || !word.chars().any(char::is_alphabetic)
            {
                return None;
            }
            let folded = fold_for_search(word);
            let common = crate::search::expression::STOP_WORDS.contains(&folded.as_str())
                || COMMON_WORDS.contains(&folded.as_str());
            (!common).then_some((folded, word))
        })
}

#[derive(Default)]
struct Count<'a> {
    weighted: usize,
    occurrences: usize,
    in_title: bool,
    spellings: HashMap<&'a str, usize>,
}

/// The distinctive terms of an item, the most distinctive first.
pub fn distinctive_terms(connection: &Connection, item: &ItemText) -> AppResult<Vec<Term>> {
    let mut counts: HashMap<String, Count<'_>> = HashMap::new();
    for (folded, spelling) in words(&item.title) {
        let count = counts.entry(folded).or_default();
        count.weighted += TITLE_WEIGHT;
        count.occurrences += 1;
        count.in_title = true;
        *count.spellings.entry(spelling).or_default() += 1;
    }
    for (folded, spelling) in words(&item.text) {
        let count = counts.entry(folded).or_default();
        count.weighted += 1;
        count.occurrences += 1;
        *count.spellings.entry(spelling).or_default() += 1;
    }
    // A word met once in the text, and not in the title, says little about the item.
    let mut candidates: Vec<(String, Count<'_>)> = counts
        .into_iter()
        .filter(|(_, count)| count.in_title || count.occurrences >= 2)
        .collect();
    candidates.sort_by(|(a_term, a), (b_term, b)| {
        b.weighted.cmp(&a.weighted).then_with(|| a_term.cmp(b_term))
    });
    candidates.truncate(CANDIDATES_MAX);
    if candidates.is_empty() {
        return Ok(Vec::new());
    }

    let passages: i64 = connection.query_row(
        "SELECT count(*) FROM search_entries WHERE index_name = 'text'",
        [],
        |row| row.get(0),
    )?;
    let mut frequency = connection
        .prepare_cached("SELECT doc FROM search_vocabulary WHERE term = ?1 AND col = 'body'")?;
    let mut terms = Vec::with_capacity(candidates.len());
    for (term, count) in candidates {
        let holding: i64 = frequency
            .query_row([&term], |row| row.get(0))
            .optional()?
            .unwrap_or(0);
        let rarity = (1.0 + passages.max(1) as f64 / (1.0 + holding as f64)).ln();
        let weight = (1.0 + (count.weighted as f64).ln()) * rarity;
        let label = count
            .spellings
            .iter()
            .max_by(|(a, a_count), (b, b_count)| a_count.cmp(b_count).then_with(|| b.cmp(a)))
            .map_or(term.as_str(), |(spelling, _)| *spelling)
            .to_owned();
        terms.push(Term {
            term,
            label,
            weight: (weight * 1000.0).round() / 1000.0,
            occurrences: i64::try_from(count.occurrences).unwrap_or(i64::MAX),
        });
    }
    terms.sort_by(|a, b| {
        b.weight
            .total_cmp(&a.weight)
            .then_with(|| a.term.cmp(&b.term))
    });
    terms.retain(|term| term.weight > 0.0);
    terms.truncate(TERMS_MAX);
    Ok(terms)
}

/// Replaces the distinctive terms of an item.
pub fn store(
    transaction: &Transaction<'_>,
    kind: ItemKind,
    id: &str,
    terms: &[Term],
) -> AppResult<()> {
    transaction.execute(
        "DELETE FROM entity_terms WHERE entity_type = ?1 AND entity_id = ?2",
        params![kind.entity(), id],
    )?;
    let mut insert = transaction.prepare_cached(
        "INSERT INTO entity_terms (entity_type, entity_id, term, label, weight, occurrences)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
    )?;
    for term in terms {
        insert.execute(params![
            kind.entity(),
            id,
            term.term,
            term.label,
            term.weight,
            term.occurrences
        ])?;
    }
    Ok(())
}

/// The distinctive terms of an item, the most distinctive first.
pub fn get(connection: &Connection, kind: ItemKind, id: &str) -> AppResult<Vec<Term>> {
    let mut statement = connection.prepare(
        "SELECT term, label, weight, occurrences FROM entity_terms WHERE entity_type = ?1 AND entity_id = ?2
         ORDER BY weight DESC, term",
    )?;
    let rows = statement.query_map(params![kind.entity(), id], |row| {
        Ok(Term {
            term: row.get(0)?,
            label: row.get(1)?,
            weight: row.get(2)?,
            occurrences: row.get(3)?,
        })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

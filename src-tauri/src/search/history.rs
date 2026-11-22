//! Search history (specification §9.2): the queries the user ran, each once, most recent first, erasable. It
//! stays in the local database and is never sent anywhere.

use rusqlite::{Connection, Transaction, params};
use serde::Serialize;
use ts_rs::TS;

use crate::error::{AppError, AppResult};
use crate::util::{fold_for_search, new_id, now_ms, validate_id};

/// Entries kept: older searches are forgotten.
pub const HISTORY_MAX: i64 = 50;
/// Longest query kept, in characters.
pub const QUERY_MAX: usize = 300;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SearchHistoryEntry {
    pub id: String,
    pub query: String,
    pub searched_at: i64,
}

/// The same search typed twice, whatever the case, accents and spaces, is one entry.
fn query_key(query: &str) -> String {
    fold_for_search(query)
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// Records a search the user ran (or moves it to the top), and forgets the oldest beyond [`HISTORY_MAX`].
pub fn record(transaction: &Transaction<'_>, query: &str) -> AppResult<SearchHistoryEntry> {
    let query = query.split_whitespace().collect::<Vec<_>>().join(" ");
    if query.is_empty() {
        return Err(AppError::InvalidInput(
            "an empty search is not recorded".to_owned(),
        ));
    }
    if query.chars().count() > QUERY_MAX {
        return Err(AppError::InvalidInput(format!(
            "a recorded search holds {QUERY_MAX} characters at most"
        )));
    }
    // Strictly after the previous search, so that the order stays right within one millisecond.
    let latest: i64 = transaction.query_row(
        "SELECT coalesce(max(searched_at), 0) FROM search_history",
        [],
        |row| row.get(0),
    )?;
    let entry = SearchHistoryEntry {
        id: new_id(),
        query,
        searched_at: now_ms().max(latest + 1),
    };
    transaction.execute(
        "INSERT INTO search_history (id, query, query_key, searched_at) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT (query_key) DO UPDATE SET query = excluded.query, searched_at = excluded.searched_at",
        params![entry.id, entry.query, query_key(&entry.query), entry.searched_at],
    )?;
    transaction.execute(
        "DELETE FROM search_history WHERE id NOT IN (
           SELECT id FROM search_history ORDER BY searched_at DESC, rowid DESC LIMIT ?1
         )",
        [HISTORY_MAX],
    )?;
    let id: String = transaction.query_row(
        "SELECT id FROM search_history WHERE query_key = ?1",
        [query_key(&entry.query)],
        |row| row.get(0),
    )?;
    Ok(SearchHistoryEntry { id, ..entry })
}

/// The most recent searches first.
pub fn list(connection: &Connection, limit: u32) -> AppResult<Vec<SearchHistoryEntry>> {
    let mut statement = connection.prepare_cached(
        "SELECT id, query, searched_at FROM search_history ORDER BY searched_at DESC, rowid DESC LIMIT ?1",
    )?;
    let rows = statement.query_map([i64::from(limit.min(50))], |row| {
        Ok(SearchHistoryEntry {
            id: row.get(0)?,
            query: row.get(1)?,
            searched_at: row.get(2)?,
        })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn delete(transaction: &Transaction<'_>, id: &str) -> AppResult<()> {
    validate_id(id, "search history id")?;
    transaction.execute("DELETE FROM search_history WHERE id = ?1", [id])?;
    Ok(())
}

pub fn clear(transaction: &Transaction<'_>) -> AppResult<()> {
    transaction.execute("DELETE FROM search_history", [])?;
    Ok(())
}

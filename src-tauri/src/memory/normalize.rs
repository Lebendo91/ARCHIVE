//! Normalization (specification §10.2): one description of the content of every item, whatever its format.
//! Only what the file declares, or what can be counted or verified, is recorded; anything else stays unknown.

use rusqlite::{Connection, OptionalExtension, Transaction, params};
use serde::Serialize;
use serde_json::Value;
use ts_rs::TS;

use super::{ItemKind, ItemText};
use crate::error::AppResult;
use crate::repo::text_enum;
use crate::util::{fold_for_search, now_ms};

/// Where the language of an item comes from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum LanguageSource {
    /// Written in the file (Word properties, PDF catalog).
    Declared,
    /// Recognized from the common words of the text.
    Detected,
}
text_enum!(LanguageSource { Declared => "declared", Detected => "detected" });

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ContentProfile {
    pub title_in_file: Option<String>,
    pub author: Option<String>,
    /// When the file says it was written, and last revised.
    pub authored_at: Option<i64>,
    pub revised_at: Option<i64>,
    pub page_count: Option<i64>,
    /// Primary language subtag (« fr », « en »…).
    pub language: Option<String>,
    pub language_source: Option<LanguageSource>,
    pub characters: i64,
    pub words: i64,
    pub updated_at: i64,
}

/// Common words that only French uses among the languages of the interface.
const FRENCH: &[&str] = &[
    "le", "la", "les", "des", "une", "est", "dans", "pour", "que", "qui", "sur", "avec", "pas",
    "du", "au", "sont", "mais", "nous", "vous", "cette", "ces", "elle", "ils", "aux", "etre",
    "par", "plus", "ou", "et",
];
/// Common words that only English uses among them.
const ENGLISH: &[&str] = &[
    "the", "and", "is", "are", "of", "to", "for", "with", "that", "this", "it", "be", "by", "not",
    "from", "at", "was", "were", "have", "has", "which", "these", "their", "or", "you", "we",
    "they",
];
/// The language is recognized only from this many common words of it…
const DETECTION_MIN_HITS: usize = 12;
/// …making at least this share of the words…
const DETECTION_MIN_SHARE: f64 = 0.08;
/// …and this many times as many as those of the other language.
const DETECTION_MIN_RATIO: usize = 4;

fn words(text: &str) -> impl Iterator<Item = &str> {
    text.split(|character: char| !character.is_alphanumeric())
        .filter(|word| !word.is_empty())
}

/// French or English, when the text says so clearly; `None` otherwise (too short, mixed, another language).
pub fn detect_language(text: &str) -> Option<&'static str> {
    let folded = fold_for_search(text);
    let (mut total, mut french, mut english) = (0usize, 0usize, 0usize);
    for word in words(&folded) {
        total += 1;
        if FRENCH.contains(&word) {
            french += 1;
        }
        if ENGLISH.contains(&word) {
            english += 1;
        }
    }
    let share = |hits: usize| total > 0 && hits as f64 / total as f64 >= DETECTION_MIN_SHARE;
    if french >= DETECTION_MIN_HITS && share(french) && french >= english * DETECTION_MIN_RATIO {
        Some("fr")
    } else if english >= DETECTION_MIN_HITS
        && share(english)
        && english >= french * DETECTION_MIN_RATIO
    {
        Some("en")
    } else {
        None
    }
}

/// Primary subtag of a declared language tag (« fr-FR » → « fr »), if it is one.
pub fn primary_language(tag: &str) -> Option<String> {
    let primary = tag.trim().split(['-', '_']).next()?.to_ascii_lowercase();
    ((2..=3).contains(&primary.len())
        && primary
            .chars()
            .all(|character| character.is_ascii_lowercase()))
    .then_some(primary)
}

/// Days since 1970-01-01 of a date of the proleptic Gregorian calendar.
fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let year = if month <= 2 { year - 1 } else { year };
    let era = year.div_euclid(400);
    let year_of_era = year - era * 400;
    let month_index = (month + 9) % 12;
    let day_of_year = (153 * month_index + 2) / 5 + day - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    era * 146_097 + day_of_era - 719_468
}

/// Milliseconds of an ISO 8601 date (« 2026-09-01T08:00:00Z », with or without time, offset or fraction).
pub fn parse_iso_date(value: &str) -> Option<i64> {
    let value = value.trim();
    let number = |range: std::ops::Range<usize>| -> Option<i64> {
        let part = value.get(range)?;
        part.chars()
            .all(|character| character.is_ascii_digit())
            .then(|| part.parse().ok())?
    };
    let (year, month, day) = (number(0..4)?, number(5..7)?, number(8..10)?);
    if value.get(4..5) != Some("-")
        || value.get(7..8) != Some("-")
        || !(1..=12).contains(&month)
        || !(1..=31).contains(&day)
    {
        return None;
    }
    let mut millis = days_from_civil(year, month, day) * 86_400_000;
    let rest = value.get(10..).unwrap_or("");
    if rest.is_empty() {
        return Some(millis);
    }
    if !(rest.starts_with('T') || rest.starts_with(' ')) {
        return None;
    }
    let (hours, minutes) = (number(11..13)?, number(14..16)?);
    let seconds = if value.get(16..17) == Some(":") {
        number(17..19)?
    } else {
        0
    };
    if hours > 23 || minutes > 59 || seconds > 60 {
        return None;
    }
    millis += ((hours * 60 + minutes) * 60 + seconds) * 1000;
    // The offset, after an optional fraction of a second: « Z », « +01:00 », « -0500 ».
    let zone = value[16..].trim_start_matches(|character: char| {
        character.is_ascii_digit() || character == ':' || character == '.'
    });
    let offset = match zone.chars().next() {
        None | Some('Z' | 'z') => 0,
        Some(sign @ ('+' | '-')) => {
            let digits: String = zone[1..].chars().filter(char::is_ascii_digit).collect();
            let hours: i64 = digits.get(0..2)?.parse().ok()?;
            let minutes: i64 = digits.get(2..4).map_or(Some(0), |part| part.parse().ok())?;
            let offset = (hours * 60 + minutes) * 60_000;
            if sign == '+' { offset } else { -offset }
        }
        Some(_) => return None,
    };
    Some(millis - offset)
}

fn text_field(metadata: &Value, key: &str) -> Option<String> {
    let value = metadata.get(key)?.as_str()?.trim();
    (!value.is_empty()).then(|| value.chars().take(500).collect())
}

fn date_field(metadata: &Value, key: &str) -> Option<i64> {
    match metadata.get(key)? {
        Value::String(text) => parse_iso_date(text),
        Value::Number(number) => number.as_i64(),
        _ => None,
    }
}

/// The description of an item's content.
pub fn profile(kind: ItemKind, item: &ItemText) -> ContentProfile {
    let metadata = &item.metadata;
    let text = item.text.replace(crate::search::index::PAGE_BREAK, "\n");
    let declared = text_field(metadata, "declaredLanguage").and_then(|tag| primary_language(&tag));
    let (language, language_source) = match declared {
        Some(language) => (Some(language), Some(LanguageSource::Declared)),
        None => match detect_language(&text) {
            Some(language) => (Some(language.to_owned()), Some(LanguageSource::Detected)),
            None => (None, None),
        },
    };
    let is_document = kind == ItemKind::Document;
    ContentProfile {
        title_in_file: if is_document {
            text_field(metadata, "documentTitle")
        } else {
            None
        },
        author: if is_document {
            text_field(metadata, "author")
        } else {
            None
        },
        authored_at: if is_document {
            date_field(metadata, "authoredAt")
        } else {
            None
        },
        revised_at: if is_document {
            date_field(metadata, "revisedAt")
        } else {
            None
        },
        page_count: metadata
            .get("pageCount")
            .and_then(Value::as_i64)
            .filter(|count| *count >= 0),
        language,
        language_source,
        characters: i64::try_from(text.chars().count()).unwrap_or(i64::MAX),
        words: i64::try_from(
            text.split_whitespace()
                .filter(|word| word.chars().any(char::is_alphanumeric))
                .count(),
        )
        .unwrap_or(i64::MAX),
        updated_at: now_ms(),
    }
}

pub fn store(
    transaction: &Transaction<'_>,
    kind: ItemKind,
    id: &str,
    profile: &ContentProfile,
) -> AppResult<()> {
    transaction.execute(
        "INSERT INTO content_profiles (entity_type, entity_id, title_in_file, author, authored_at, revised_at,
                                       page_count, language, language_source, characters, words, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
         ON CONFLICT (entity_type, entity_id) DO UPDATE SET
           title_in_file = excluded.title_in_file, author = excluded.author, authored_at = excluded.authored_at,
           revised_at = excluded.revised_at, page_count = excluded.page_count, language = excluded.language,
           language_source = excluded.language_source, characters = excluded.characters,
           words = excluded.words, updated_at = excluded.updated_at",
        params![
            kind.entity(),
            id,
            profile.title_in_file,
            profile.author,
            profile.authored_at,
            profile.revised_at,
            profile.page_count,
            profile.language,
            profile.language_source,
            profile.characters,
            profile.words,
            profile.updated_at
        ],
    )?;
    Ok(())
}

pub fn get(connection: &Connection, kind: ItemKind, id: &str) -> AppResult<Option<ContentProfile>> {
    Ok(connection
        .query_row(
            "SELECT title_in_file, author, authored_at, revised_at, page_count, language, language_source,
                    characters, words, updated_at
             FROM content_profiles WHERE entity_type = ?1 AND entity_id = ?2",
            params![kind.entity(), id],
            |row| {
                Ok(ContentProfile {
                    title_in_file: row.get(0)?,
                    author: row.get(1)?,
                    authored_at: row.get(2)?,
                    revised_at: row.get(3)?,
                    page_count: row.get(4)?,
                    language: row.get(5)?,
                    language_source: row.get(6)?,
                    characters: row.get(7)?,
                    words: row.get(8)?,
                    updated_at: row.get(9)?,
                })
            },
        )
        .optional()?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn iso_dates_are_read_with_their_offset() {
        assert_eq!(parse_iso_date("1970-01-01T00:00:00Z"), Some(0));
        assert_eq!(
            parse_iso_date("2026-09-01T08:00:00Z"),
            Some(1_788_249_600_000)
        );
        assert_eq!(
            parse_iso_date("2026-09-01T10:00:00+02:00"),
            Some(1_788_249_600_000)
        );
        assert_eq!(
            parse_iso_date("2026-09-01T03:00:00.250-0500"),
            Some(1_788_249_600_000)
        );
        assert_eq!(parse_iso_date("2026-09-01"), Some(1_788_220_800_000));
        assert_eq!(
            parse_iso_date("2024-02-29T12:00:00Z"),
            Some(1_709_208_000_000)
        );
        for invalid in [
            "",
            "hier",
            "2026-13-01",
            "2026-09-01T25:00:00Z",
            "2026/09/01",
            "2026-09-01Tnoon",
        ] {
            assert_eq!(parse_iso_date(invalid), None, "{invalid}");
        }
    }

    #[test]
    fn the_language_is_recognized_only_when_the_text_says_it_clearly() {
        let french = "La tension aux bornes de la résistance est proportionnelle au courant qui la traverse. \
                      Les mesures sont faites avec un multimètre, et les valeurs sont notées dans le tableau \
                      pour que la loi soit vérifiée sur les trois montages.";
        let english = "The voltage across the resistor is proportional to the current that flows through it. \
                       The measurements were made with a multimeter, and the values are written in the table \
                       so that the law is checked for each of these circuits.";
        assert_eq!(detect_language(french), Some("fr"));
        assert_eq!(detect_language(english), Some("en"));
        assert_eq!(detect_language("Timer NE555, broche 8 : VCC."), None);
        let german = "Die Spannung am Widerstand ist proportional zum Strom, der durch ihn fließt. Die Messungen \
                      wurden mit einem Multimeter gemacht und die Werte in der Tabelle notiert, damit das Gesetz \
                      in allen drei Schaltungen geprüft wird.";
        assert_eq!(detect_language(german), None);
        assert_eq!(primary_language("fr-FR"), Some("fr".to_owned()));
        assert_eq!(primary_language(" EN_us "), Some("en".to_owned()));
        assert_eq!(primary_language("x"), None);
        assert_eq!(primary_language("français"), None);
    }
}

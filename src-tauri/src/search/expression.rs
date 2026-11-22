//! What the user typed, made into FTS5 expressions without ever giving their text the meaning of FTS5 syntax
//! (ARCHITECTURE.md §9: the query is never concatenated into the FTS5 grammar).

use crate::util::fold_for_search;

/// Words too common to narrow a search; left out when other words remain (French and English).
const STOP_WORDS: &[&str] = &[
    "a", "au", "aux", "avec", "ce", "ces", "cet", "cette", "d", "dans", "de", "des", "du", "elle",
    "en", "et", "il", "l", "la", "le", "les", "leur", "leurs", "ma", "mes", "mon", "ne", "nos",
    "notre", "on", "ou", "par", "pas", "pour", "qu", "que", "qui", "sa", "sans", "se", "ses",
    "son", "sur", "ta", "tes", "ton", "un", "une", "vos", "votre", "y", "an", "and", "are", "as",
    "at", "be", "by", "for", "from", "in", "is", "it", "its", "my", "of", "or", "our", "that",
    "the", "their", "these", "this", "those", "to", "was", "were", "with", "without", "your",
];

#[derive(Debug, Clone, PartialEq, Eq)]
struct Term {
    text: String,
    phrase: bool,
    negated: bool,
}

/// The words and "quoted phrases" of a query, and whether its last word may still be being typed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedQuery {
    terms: Vec<Term>,
    open_last: bool,
}

impl ParsedQuery {
    pub fn parse(text: &str) -> Self {
        let mut terms = Vec::new();
        let mut chars = text.chars().peekable();
        let mut open_last = false;
        while let Some(&character) = chars.peek() {
            if character.is_whitespace() {
                chars.next();
                open_last = false;
                continue;
            }
            let negated = character == '-'
                && chars
                    .clone()
                    .nth(1)
                    .is_some_and(|next| !next.is_whitespace());
            if negated {
                chars.next();
            }
            if chars.peek() == Some(&'"') {
                chars.next();
                let phrase: String = chars.by_ref().take_while(|&next| next != '"').collect();
                push_term(&mut terms, &phrase, true, negated);
                open_last = false;
            } else {
                let mut word = String::new();
                while let Some(&next) = chars.peek() {
                    if next.is_whitespace() || next == '"' {
                        break;
                    }
                    word.push(next);
                    chars.next();
                }
                push_term(&mut terms, &word, false, negated);
                open_last = !negated;
            }
        }
        // Common words only count when nothing else is searched; the last word stays while it may be the
        // beginning of a longer one.
        let meaningful = terms
            .iter()
            .filter(|term| !term.negated && !is_stop_word(term))
            .count();
        if meaningful > 0 {
            let last = terms.len().saturating_sub(1);
            let mut index = 0;
            terms.retain(|term| {
                let keep = term.negated || !is_stop_word(term) || (open_last && index == last);
                index += 1;
                keep
            });
        }
        Self { terms, open_last }
    }

    /// The words searched, as typed, for display.
    pub fn words(&self) -> Vec<String> {
        self.terms
            .iter()
            .filter(|term| !term.negated)
            .map(|term| term.text.clone())
            .collect()
    }

    /// Expression for the word index: every word must appear, the last one also as the start of a word.
    pub fn fts(&self) -> Option<String> {
        let positives: Vec<&Term> = self.terms.iter().filter(|term| !term.negated).collect();
        if positives.is_empty() {
            return None;
        }
        let last = positives.len() - 1;
        let required: Vec<String> = positives
            .iter()
            .enumerate()
            .map(|(index, term)| {
                let prefix = self.open_last
                    && index == last
                    && !term.phrase
                    && term.text.chars().count() >= 2;
                alternatives(&term.text, prefix)
            })
            .collect();
        let excluded: Vec<String> = self
            .terms
            .iter()
            .filter(|term| term.negated)
            .map(|term| alternatives(&term.text, false))
            .collect();
        let required = required.join(" AND ");
        Some(match excluded.as_slice() {
            [] => required,
            [single] => format!("({required}) NOT {single}"),
            several => format!("({required}) NOT ({})", several.join(" OR ")),
        })
    }

    /// Expression for the trigram index of titles: every word of three characters or more appears in the
    /// title, anywhere (« 555 » in « NE555 »). `None` when no such word was typed.
    pub fn substrings(&self) -> Option<String> {
        let words: Vec<String> = self
            .terms
            .iter()
            .filter(|term| !term.negated && term.text.chars().count() >= 3)
            .map(|term| alternatives(&term.text, false))
            .collect();
        (!words.is_empty()).then(|| words.join(" AND "))
    }
}

fn push_term(terms: &mut Vec<Term>, text: &str, phrase: bool, negated: bool) {
    let text = text.trim();
    // A word without letters or digits matches nothing, and is not searched.
    if text.chars().any(char::is_alphanumeric) {
        terms.push(Term {
            text: text.to_owned(),
            phrase,
            negated,
        });
    }
}

fn is_stop_word(term: &Term) -> bool {
    !term.phrase && STOP_WORDS.contains(&fold_for_search(&term.text).as_str())
}

/// An FTS5 string for `text` (double quotes doubled, so that nothing in it is syntax), or the alternatives of
/// its spellings with and without « œ » and « æ ».
fn alternatives(text: &str, prefix: bool) -> String {
    let lower = text.to_lowercase();
    let mut spellings = vec![lower.clone()];
    for (joined, apart) in [("œ", "oe"), ("æ", "ae")] {
        for spelling in [lower.replace(joined, apart), lower.replace(apart, joined)] {
            if !spellings.contains(&spelling) {
                spellings.push(spelling);
            }
        }
    }
    let quoted: Vec<String> = spellings
        .iter()
        .map(|spelling| {
            format!(
                "\"{}\"{}",
                spelling.replace('"', "\"\""),
                if prefix { "*" } else { "" }
            )
        })
        .collect();
    if quoted.len() == 1 {
        quoted.concat()
    } else {
        format!("({})", quoted.join(" OR "))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_word_is_a_quoted_string_and_the_last_one_a_prefix() {
        let query = ParsedQuery::parse("Brochage NE555");
        assert_eq!(query.fts().as_deref(), Some(r#""brochage" AND "ne555"*"#));
        assert_eq!(query.words(), vec!["Brochage", "NE555"]);
        // A space after the last word: it is complete.
        assert_eq!(
            ParsedQuery::parse("brochage ne555 ").fts().as_deref(),
            Some(r#""brochage" AND "ne555""#)
        );
    }

    #[test]
    fn fts5_syntax_typed_by_the_user_has_no_effect() {
        for (typed, expected) in [
            // « OR » is a common word here, not an operator.
            (
                r#"title:secret OR body:*"#,
                r#""title:secret" AND "body:*"*"#,
            ),
            ("NEAR(a b) ^start", r#""near(a" AND "b)" AND "^start"*"#),
            (r#"x"y"#, r#""x" AND "y""#),
        ] {
            assert_eq!(
                ParsedQuery::parse(typed).fts().as_deref(),
                Some(expected),
                "{typed}"
            );
        }
        // Quotes inside a word are doubled, never closing the string.
        assert_eq!(alternatives(r#"x"y"#, false), r#""x""y""#.to_owned());
    }

    #[test]
    fn phrases_exclusions_and_common_words() {
        let query = ParsedQuery::parse(r#""loi des mailles" -Thévenin la tension"#);
        assert_eq!(
            query.fts().as_deref(),
            Some(r#"("loi des mailles" AND "tension"*) NOT "thévenin""#)
        );
        // Only common words: they are searched.
        assert_eq!(
            ParsedQuery::parse("le la ").fts().as_deref(),
            Some(r#""le" AND "la""#)
        );
        // Nothing searchable.
        assert_eq!(ParsedQuery::parse("  - … &").fts(), None);
        assert_eq!(ParsedQuery::parse("-seul").fts(), None);
    }

    #[test]
    fn words_with_or_without_a_ligature_find_both_spellings() {
        assert_eq!(
            ParsedQuery::parse("noeud ").fts().as_deref(),
            Some(r#"("noeud" OR "nœud")"#)
        );
        assert_eq!(
            ParsedQuery::parse("Nœu").fts().as_deref(),
            Some(r#"("nœu"* OR "noeu"*)"#)
        );
    }

    #[test]
    fn substrings_need_three_characters() {
        assert_eq!(
            ParsedQuery::parse("555 ic").substrings().as_deref(),
            Some(r#""555""#)
        );
        assert_eq!(ParsedQuery::parse("ic").substrings(), None);
    }
}

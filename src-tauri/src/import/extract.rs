//! Text and metadata extraction (specification §7.2, §10.2), bounded in size so that a huge or hostile file
//! never exhausts memory. Metadata are never invented: a value that cannot be read is simply absent.

use std::fs::File;
use std::io::{BufReader, Read};
use std::path::Path;

use quick_xml::Reader;
use quick_xml::events::Event;
use serde::Serialize;
use serde_json::{Map, Value};
use ts_rs::TS;

use super::detect::FileKind;
use crate::repo::documents::ProcessingStatus;

/// Bytes of a text file read for extraction; a longer file is stored whole but indexed partially.
pub const TEXT_READ_MAX: u64 = 16 * 1024 * 1024;
/// Largest extracted text stored, in bytes of UTF-8 (all formats, including PDF text sent by the interface).
pub const CONTENT_MAX_BYTES: usize = 16 * 1024 * 1024;
/// Largest part of a DOCX archive decompressed (protection against zip bombs).
pub const DOCX_PART_MAX: u64 = 64 * 1024 * 1024;

/// Why the text of a document is missing or partial. Shown to the user, never hidden.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum ExtractionIssue {
    /// Only the beginning of the text was kept.
    Truncated,
    InvalidJson,
    InvalidDocx,
    InvalidPdf,
    /// The PDF is protected by a password.
    EncryptedPdf,
    /// The PDF has no text layer (a scan): OCR is not integrated.
    NoTextLayer,
}

impl ExtractionIssue {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Truncated => "truncated",
            Self::InvalidJson => "invalid_json",
            Self::InvalidDocx => "invalid_docx",
            Self::InvalidPdf => "invalid_pdf",
            Self::EncryptedPdf => "encrypted_pdf",
            Self::NoTextLayer => "no_text_layer",
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Extraction {
    pub status: ProcessingStatus,
    pub text: Option<String>,
    pub extractor: &'static str,
    pub metadata: Map<String, Value>,
    pub issue: Option<ExtractionIssue>,
}

impl Extraction {
    fn completed(text: String, extractor: &'static str, metadata: Map<String, Value>) -> Self {
        let (text, truncated) = truncate_utf8(text, CONTENT_MAX_BYTES);
        Self {
            status: ProcessingStatus::Completed,
            text: Some(text),
            extractor,
            metadata,
            issue: truncated.then_some(ExtractionIssue::Truncated),
        }
    }

    fn failed(
        issue: ExtractionIssue,
        extractor: &'static str,
        metadata: Map<String, Value>,
    ) -> Self {
        Self {
            status: ProcessingStatus::Failed,
            text: None,
            extractor,
            metadata,
            issue: Some(issue),
        }
    }
}

/// Extracts what can be extracted from the managed copy of a file.
pub fn extract(kind: FileKind, path: &Path) -> Extraction {
    match kind {
        FileKind::Text | FileKind::Markdown | FileKind::Csv | FileKind::Json => {
            extract_text_file(kind, path)
        }
        FileKind::Docx => extract_docx(path),
        // PDF text is extracted by pdf.js in the interface (ARCHITECTURE §8), then stored by the core.
        FileKind::Pdf => Extraction {
            status: ProcessingStatus::Pending,
            text: None,
            extractor: "pdfjs",
            metadata: Map::new(),
            issue: None,
        },
        // Images are stored and previewed; no OCR engine is integrated, so no text is claimed.
        FileKind::Png | FileKind::Jpeg | FileKind::Webp => Extraction {
            status: ProcessingStatus::Completed,
            text: None,
            extractor: "image",
            metadata: image_metadata(kind, path),
            issue: None,
        },
    }
}

/// Keeps at most `max` bytes, cut on a character boundary.
pub fn truncate_utf8(mut text: String, max: usize) -> (String, bool) {
    if text.len() <= max {
        return (text, false);
    }
    let mut end = max;
    while !text.is_char_boundary(end) {
        end -= 1;
    }
    text.truncate(end);
    (text, true)
}

// --- Text files -------------------------------------------------------------------------------------------

const WINDOWS_1252_HIGH: [char; 32] = [
    '\u{20AC}', '\u{81}', '\u{201A}', '\u{192}', '\u{201E}', '\u{2026}', '\u{2020}', '\u{2021}',
    '\u{2C6}', '\u{2030}', '\u{160}', '\u{2039}', '\u{152}', '\u{8D}', '\u{17D}', '\u{8F}',
    '\u{90}', '\u{2018}', '\u{2019}', '\u{201C}', '\u{201D}', '\u{2022}', '\u{2013}', '\u{2014}',
    '\u{2DC}', '\u{2122}', '\u{161}', '\u{203A}', '\u{153}', '\u{9D}', '\u{17E}', '\u{178}',
];

/// Decodes text bytes: UTF-8 (with or without BOM), UTF-16 with BOM, or else Windows-1252, the encoding of
/// many older French files. Returns the text and the name of the encoding.
pub fn decode_text(bytes: &[u8], truncated: bool) -> (String, &'static str) {
    if let Some(rest) = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]) {
        return (
            decode_utf8_prefix(rest, truncated).unwrap_or_default(),
            "utf-8",
        );
    }
    if let Some(rest) = bytes.strip_prefix(&[0xFF, 0xFE]) {
        return (decode_utf16(rest, u16::from_le_bytes), "utf-16le");
    }
    if let Some(rest) = bytes.strip_prefix(&[0xFE, 0xFF]) {
        return (decode_utf16(rest, u16::from_be_bytes), "utf-16be");
    }
    if let Some(text) = decode_utf8_prefix(bytes, truncated) {
        return (text, "utf-8");
    }
    let text = bytes
        .iter()
        .map(|&byte| match byte {
            0x80..=0x9F => WINDOWS_1252_HIGH[usize::from(byte - 0x80)],
            _ => char::from(byte),
        })
        .collect();
    (text, "windows-1252")
}

/// Valid UTF-8, tolerating a character cut at the end when the file was read partially.
fn decode_utf8_prefix(bytes: &[u8], truncated: bool) -> Option<String> {
    match std::str::from_utf8(bytes) {
        Ok(text) => Some(text.to_owned()),
        Err(error) if truncated && error.error_len().is_none() => {
            let valid = bytes.get(..error.valid_up_to())?;
            std::str::from_utf8(valid).ok().map(str::to_owned)
        }
        Err(_) => None,
    }
}

fn decode_utf16(bytes: &[u8], read: fn([u8; 2]) -> u16) -> String {
    // A trailing odd byte (a cut file) is ignored, like a truncated character.
    let (pairs, _) = bytes.as_chunks::<2>();
    let units: Vec<u16> = pairs.iter().map(|pair| read(*pair)).collect();
    String::from_utf16_lossy(&units)
}

/// Unix line endings, no NUL character.
fn normalize(text: &str) -> String {
    text.replace("\r\n", "\n")
        .replace(['\r'], "\n")
        .replace('\0', "")
}

fn read_prefix(path: &Path, max: u64) -> std::io::Result<(Vec<u8>, bool)> {
    let file = File::open(path)?;
    let size = file.metadata()?.len();
    let mut bytes = Vec::with_capacity(usize::try_from(size.min(max)).unwrap_or(0));
    file.take(max).read_to_end(&mut bytes)?;
    Ok((bytes, size > max))
}

fn extract_text_file(kind: FileKind, path: &Path) -> Extraction {
    let extractor = match kind {
        FileKind::Csv => "csv",
        FileKind::Json => "json",
        FileKind::Markdown => "markdown",
        _ => "text",
    };
    let Ok((bytes, truncated)) = read_prefix(path, TEXT_READ_MAX) else {
        return Extraction::failed(ExtractionIssue::Truncated, extractor, Map::new());
    };
    let (decoded, encoding) = decode_text(&bytes, truncated);
    let text = normalize(&decoded);
    let mut metadata = Map::new();
    metadata.insert("encoding".to_owned(), Value::from(encoding));
    metadata.insert("lineCount".to_owned(), Value::from(text.lines().count()));

    let mut extraction = match kind {
        FileKind::Csv => {
            if let Some((delimiter, columns)) = csv_shape(&text) {
                metadata.insert("delimiter".to_owned(), Value::from(delimiter.to_string()));
                metadata.insert("columnCount".to_owned(), Value::from(columns));
                metadata.insert(
                    "rowCount".to_owned(),
                    Value::from(text.lines().filter(|line| !line.trim().is_empty()).count()),
                );
            }
            Extraction::completed(text, extractor, metadata)
        }
        FileKind::Json if truncated => {
            // A partial JSON document cannot be parsed: its text is kept as it is.
            Extraction::completed(text, extractor, metadata)
        }
        FileKind::Json => match serde_json::from_str::<Value>(&text) {
            Ok(value) => {
                let mut lines = Vec::new();
                flatten_json(&value, &mut String::new(), &mut lines);
                Extraction::completed(lines.join("\n"), extractor, metadata)
            }
            Err(_) => Extraction::failed(ExtractionIssue::InvalidJson, extractor, metadata),
        },
        _ => Extraction::completed(text, extractor, metadata),
    };
    if truncated {
        extraction.issue = Some(ExtractionIssue::Truncated);
    }
    extraction
}

/// Delimiter (`,`, `;` or tab) and column count of the header line, if the text looks tabular.
fn csv_shape(text: &str) -> Option<(char, usize)> {
    let header = text.lines().find(|line| !line.trim().is_empty())?;
    [';', ',', '\t']
        .into_iter()
        .map(|delimiter| (delimiter, header.matches(delimiter).count() + 1))
        .max_by_key(|&(_, columns)| columns)
}

/// One line per textual value, prefixed with its key path, so that search finds both keys and values.
fn flatten_json(value: &Value, path: &mut String, lines: &mut Vec<String>) {
    match value {
        Value::Object(map) => {
            for (key, child) in map {
                let length = path.len();
                if !path.is_empty() {
                    path.push('.');
                }
                path.push_str(key);
                flatten_json(child, path, lines);
                path.truncate(length);
            }
        }
        Value::Array(items) => {
            for (index, child) in items.iter().enumerate() {
                let length = path.len();
                path.push_str(&format!("[{index}]"));
                flatten_json(child, path, lines);
                path.truncate(length);
            }
        }
        Value::String(text) => lines.push(format!("{path}: {text}")),
        Value::Number(number) => lines.push(format!("{path}: {number}")),
        Value::Bool(flag) => lines.push(format!("{path}: {flag}")),
        Value::Null => {}
    }
}

// --- DOCX -------------------------------------------------------------------------------------------------

fn extract_docx(path: &Path) -> Extraction {
    extract_docx_within(path, DOCX_PART_MAX)
}

/// Reads at most `part_max` decompressed bytes of each part: an archive that expands further is cut there and
/// flagged as truncated.
fn extract_docx_within(path: &Path, part_max: u64) -> Extraction {
    let mut metadata = Map::new();
    let Ok(file) = File::open(path) else {
        return Extraction::failed(ExtractionIssue::InvalidDocx, "docx", metadata);
    };
    let Ok(mut archive) = zip::ZipArchive::new(BufReader::new(file)) else {
        return Extraction::failed(ExtractionIssue::InvalidDocx, "docx", metadata);
    };
    if let Ok(core) = archive.by_name("docProps/core.xml") {
        let (properties, _) = read_core_properties(core.take(part_max));
        metadata.extend(properties);
    }
    let Ok(document) = archive.by_name("word/document.xml") else {
        return Extraction::failed(ExtractionIssue::InvalidDocx, "docx", metadata);
    };
    let declared_size = document.size();
    match read_docx_text(document.take(part_max)) {
        Some(text) => {
            let mut extraction = Extraction::completed(text, "docx", metadata);
            if declared_size > part_max {
                extraction.issue = Some(ExtractionIssue::Truncated);
            }
            extraction
        }
        None => Extraction::failed(ExtractionIssue::InvalidDocx, "docx", metadata),
    }
}

/// Text of `word/document.xml`: one line per paragraph, tabs between table cells.
fn read_docx_text(reader: impl Read) -> Option<String> {
    let mut xml = Reader::from_reader(BufReader::new(reader));
    let mut buffer = Vec::new();
    let mut text = String::new();
    let mut in_text = false;
    loop {
        match xml.read_event_into(&mut buffer) {
            Ok(Event::Start(element)) => match element.local_name().as_ref() {
                "t" => in_text = true,
                "tab" => text.push('\t'),
                "br" | "cr" => text.push('\n'),
                _ => {}
            },
            Ok(Event::Empty(element)) => match element.local_name().as_ref() {
                "tab" => text.push('\t'),
                "br" | "cr" => text.push('\n'),
                _ => {}
            },
            Ok(Event::End(element)) => match element.local_name().as_ref() {
                "t" => in_text = false,
                "p" => text.push('\n'),
                "tc" => text.push('\t'),
                _ => {}
            },
            Ok(Event::Text(content)) if in_text => text.push_str(&content.xml10_content()),
            Ok(Event::GeneralRef(reference)) if in_text => {
                if let Ok(Some(character)) = reference.resolve_char_ref() {
                    text.push(character);
                } else if let Some(resolved) =
                    quick_xml::escape::resolve_predefined_entity(&reference.xml10_content())
                {
                    text.push_str(resolved);
                }
            }
            Ok(Event::Eof) => break,
            Ok(_) => {}
            // A truncated part (size limit) ends in the middle of an element: keep what was read.
            Err(_) if !text.is_empty() => break,
            Err(_) => return None,
        }
        buffer.clear();
    }
    Some(
        text.lines()
            .map(str::trim_end)
            .collect::<Vec<_>>()
            .join("\n")
            .trim()
            .to_owned(),
    )
}

/// Title, author and dates declared in `docProps/core.xml`.
fn read_core_properties(reader: impl Read) -> (Map<String, Value>, bool) {
    let mut xml = Reader::from_reader(BufReader::new(reader));
    let mut buffer = Vec::new();
    let mut properties = Map::new();
    let mut current: Option<&'static str> = None;
    loop {
        match xml.read_event_into(&mut buffer) {
            Ok(Event::Start(element)) => {
                current = match element.local_name().as_ref() {
                    "title" => Some("documentTitle"),
                    "creator" => Some("author"),
                    "lastModifiedBy" => Some("lastModifiedBy"),
                    "created" => Some("authoredAt"),
                    "modified" => Some("revisedAt"),
                    _ => None,
                };
            }
            Ok(Event::Text(content)) => {
                if let Some(key) = current {
                    let value = content.xml10_content().trim().to_owned();
                    if !value.is_empty() && value.len() <= 500 {
                        properties.insert(key.to_owned(), Value::from(value));
                    }
                }
            }
            Ok(Event::End(_)) => current = None,
            Ok(Event::Eof) => return (properties, true),
            Ok(_) => {}
            Err(_) => return (properties, false),
        }
        buffer.clear();
    }
}

// --- Images -----------------------------------------------------------------------------------------------

/// Width and height read from the image header, without decoding the image.
fn image_metadata(kind: FileKind, path: &Path) -> Map<String, Value> {
    let mut metadata = Map::new();
    let dimensions = read_prefix(path, 512 * 1024)
        .ok()
        .and_then(|(bytes, _)| image_dimensions(kind, &bytes));
    if let Some((width, height)) = dimensions {
        metadata.insert("width".to_owned(), Value::from(width));
        metadata.insert("height".to_owned(), Value::from(height));
    }
    metadata
}

fn be_u16(bytes: &[u8], at: usize) -> Option<u32> {
    let pair = bytes.get(at..at + 2)?;
    Some(u32::from(u16::from_be_bytes([pair[0], pair[1]])))
}

fn le_u16(bytes: &[u8], at: usize) -> Option<u32> {
    let pair = bytes.get(at..at + 2)?;
    Some(u32::from(u16::from_le_bytes([pair[0], pair[1]])))
}

fn le_u24(bytes: &[u8], at: usize) -> Option<u32> {
    let triple = bytes.get(at..at + 3)?;
    Some(u32::from_le_bytes([triple[0], triple[1], triple[2], 0]))
}

pub fn image_dimensions(kind: FileKind, bytes: &[u8]) -> Option<(u32, u32)> {
    match kind {
        FileKind::Png => {
            // Signature (8), IHDR length (4) and type (4), then width and height.
            if bytes.get(12..16) != Some(b"IHDR") {
                return None;
            }
            let width = u32::from_be_bytes(bytes.get(16..20)?.try_into().ok()?);
            let height = u32::from_be_bytes(bytes.get(20..24)?.try_into().ok()?);
            Some((width, height))
        }
        FileKind::Jpeg => {
            // Walk the segments up to a start-of-frame marker.
            let mut offset = 2;
            while offset + 4 <= bytes.len() {
                if bytes[offset] != 0xFF {
                    return None;
                }
                let marker = bytes[offset + 1];
                let length = usize::try_from(be_u16(bytes, offset + 2)?).ok()?;
                let is_frame =
                    matches!(marker, 0xC0..=0xCF) && !matches!(marker, 0xC4 | 0xC8 | 0xCC);
                if is_frame {
                    let height = be_u16(bytes, offset + 5)?;
                    let width = be_u16(bytes, offset + 7)?;
                    return Some((width, height));
                }
                offset += 2 + length;
            }
            None
        }
        FileKind::Webp => match bytes.get(12..16)? {
            b"VP8 " => Some((le_u16(bytes, 26)? & 0x3FFF, le_u16(bytes, 28)? & 0x3FFF)),
            b"VP8L" => {
                let bits = u32::from_le_bytes(bytes.get(21..25)?.try_into().ok()?);
                Some(((bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1))
            }
            b"VP8X" => Some((le_u24(bytes, 24)? + 1, le_u24(bytes, 27)? + 1)),
            _ => None,
        },
        _ => None,
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use std::io::Write;

    use super::*;

    pub(crate) fn docx_bytes(document_xml: &str, core_xml: Option<&str>) -> Vec<u8> {
        let mut buffer = std::io::Cursor::new(Vec::new());
        {
            let mut writer = zip::ZipWriter::new(&mut buffer);
            let options = zip::write::SimpleFileOptions::default()
                .compression_method(zip::CompressionMethod::Stored);
            writer
                .start_file("word/document.xml", options)
                .expect("entry");
            writer.write_all(document_xml.as_bytes()).expect("write");
            if let Some(core) = core_xml {
                writer
                    .start_file("docProps/core.xml", options)
                    .expect("entry");
                writer.write_all(core.as_bytes()).expect("write");
            }
            writer.finish().expect("finish");
        }
        buffer.into_inner()
    }

    fn write_temp(dir: &tempfile::TempDir, name: &str, bytes: &[u8]) -> std::path::PathBuf {
        let path = dir.path().join(name);
        std::fs::write(&path, bytes).expect("write");
        path
    }

    #[test]
    fn utf8_utf16_and_windows_1252_texts_are_decoded() {
        assert_eq!(
            decode_text("Été".as_bytes(), false),
            ("Été".to_owned(), "utf-8")
        );
        assert_eq!(
            decode_text(b"\xEF\xBB\xBFCours", false),
            ("Cours".to_owned(), "utf-8")
        );
        assert_eq!(
            decode_text(&[0xFF, 0xFE, b'O', 0, b'K', 0], false),
            ("OK".to_owned(), "utf-16le")
        );
        // « Électricité – 5 € » saved by an old Windows editor.
        let legacy = b"\xC9lectricit\xE9 \x96 5 \x80";
        assert_eq!(
            decode_text(legacy, false),
            ("Électricité – 5 €".to_owned(), "windows-1252")
        );
        // A partial read may cut the last character: it is dropped, the rest stays UTF-8.
        let cut = &"Résumé".as_bytes()[..6];
        assert_eq!(decode_text(cut, true), ("Résum".to_owned(), "utf-8"));
    }

    #[test]
    fn text_is_truncated_on_a_character_boundary() {
        let (text, truncated) = truncate_utf8("ééé".to_owned(), 5);
        assert_eq!((text.as_str(), truncated), ("éé", true));
        assert_eq!(
            truncate_utf8("abc".to_owned(), 5),
            ("abc".to_owned(), false)
        );
    }

    #[test]
    fn csv_files_keep_their_text_and_describe_their_shape() {
        let dir = tempfile::tempdir().expect("dir");
        let path = write_temp(&dir, "data.csv", b"nom;valeur\r\nR1;10k\r\nC1;100n\r\n");
        let extraction = extract(FileKind::Csv, &path);
        assert_eq!(extraction.status, ProcessingStatus::Completed);
        assert_eq!(
            extraction.text.as_deref(),
            Some("nom;valeur\nR1;10k\nC1;100n\n")
        );
        assert_eq!(extraction.metadata["delimiter"], ";");
        assert_eq!(extraction.metadata["columnCount"], 2);
        assert_eq!(extraction.metadata["rowCount"], 3);
    }

    #[test]
    fn json_values_are_flattened_with_their_key_path_and_invalid_json_is_reported() {
        let dir = tempfile::tempdir().expect("dir");
        let path = write_temp(
            &dir,
            "data.json",
            br#"{"composant":"NE555","broches":[{"nom":"VCC","numero":8}],"stock":null}"#,
        );
        let extraction = extract(FileKind::Json, &path);
        assert_eq!(
            extraction.text.as_deref(),
            Some("broches[0].nom: VCC\nbroches[0].numero: 8\ncomposant: NE555")
        );
        let broken = write_temp(&dir, "broken.json", b"{\"composant\": ");
        let extraction = extract(FileKind::Json, &broken);
        assert_eq!(extraction.status, ProcessingStatus::Failed);
        assert_eq!(extraction.issue, Some(ExtractionIssue::InvalidJson));
        assert_eq!(extraction.text, None);
    }

    #[test]
    fn docx_paragraphs_tables_entities_and_properties_are_read() {
        let dir = tempfile::tempdir().expect("dir");
        let document = r#"<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
<w:p><w:r><w:t>Loi d’Ohm</w:t></w:r></w:p>
<w:p><w:r><w:t xml:space="preserve">U = R </w:t></w:r><w:r><w:t>&#215; I &amp; P = U</w:t><w:tab/><w:t>I</w:t></w:r></w:p>
<w:tbl><w:tr><w:tc><w:p><w:r><w:t>R1</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>10 kΩ</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
</w:body></w:document>"#;
        let core = r#"<?xml version="1.0"?><cp:coreProperties xmlns:cp="c" xmlns:dc="d" xmlns:dcterms="t">
<dc:title>Électricité</dc:title><dc:creator>Alice</dc:creator><dcterms:created>2026-09-01T08:00:00Z</dcterms:created>
</cp:coreProperties>"#;
        let path = write_temp(&dir, "cours.docx", &docx_bytes(document, Some(core)));
        let extraction = extract(FileKind::Docx, &path);
        assert_eq!(extraction.status, ProcessingStatus::Completed);
        let text = extraction.text.expect("text");
        assert!(
            text.starts_with("Loi d’Ohm\nU = R × I & P = U\tI"),
            "{text}"
        );
        assert!(text.contains("R1"), "{text}");
        assert!(text.contains("10 kΩ"), "{text}");
        assert_eq!(extraction.metadata["documentTitle"], "Électricité");
        assert_eq!(extraction.metadata["author"], "Alice");
        assert_eq!(extraction.metadata["authoredAt"], "2026-09-01T08:00:00Z");
    }

    #[test]
    fn malformed_docx_files_fail_without_panicking() {
        let dir = tempfile::tempdir().expect("dir");
        let not_zip = write_temp(&dir, "fake.docx", b"PK\x03\x04 truncated archive");
        assert_eq!(
            extract(FileKind::Docx, &not_zip).issue,
            Some(ExtractionIssue::InvalidDocx)
        );
        let empty_zip = write_temp(&dir, "empty.docx", &{
            let mut buffer = std::io::Cursor::new(Vec::new());
            zip::ZipWriter::new(&mut buffer).finish().expect("finish");
            buffer.into_inner()
        });
        let extraction = extract(FileKind::Docx, &empty_zip);
        assert_eq!(extraction.status, ProcessingStatus::Failed);
        assert_eq!(extraction.issue, Some(ExtractionIssue::InvalidDocx));
    }

    #[test]
    fn docx_parts_are_read_up_to_the_bound_and_flagged_truncated() {
        use std::io::Write as _;
        let dir = tempfile::tempdir().expect("dir");
        // A part that expands far beyond its compressed size, as in a zip bomb.
        let paragraph = "<w:p><w:r><w:t>Loi d'Ohm</w:t></w:r></w:p>".repeat(2_000);
        let document = format!(
            "<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\">\
             <w:body>{paragraph}</w:body></w:document>"
        );
        let mut buffer = std::io::Cursor::new(Vec::new());
        let mut archive = zip::ZipWriter::new(&mut buffer);
        archive
            .start_file(
                "word/document.xml",
                zip::write::SimpleFileOptions::default(),
            )
            .expect("start");
        archive.write_all(document.as_bytes()).expect("write");
        archive.finish().expect("finish");
        let path = write_temp(&dir, "gonfle.docx", &buffer.into_inner());

        let bound = 4_096;
        let extraction = extract_docx_within(&path, bound);
        assert_eq!(extraction.status, ProcessingStatus::Completed);
        assert_eq!(extraction.issue, Some(ExtractionIssue::Truncated));
        let text = extraction.text.expect("text");
        assert!(text.starts_with("Loi d'Ohm\n"));
        assert!(text.len() < 4_096, "only the bounded part is read");

        let whole = extract_docx_within(&path, DOCX_PART_MAX);
        assert_eq!(whole.issue, None);
        assert_eq!(whole.text.expect("text").lines().count(), 2_000);
    }

    #[test]
    fn pdf_extraction_is_left_to_pdfjs_and_images_never_claim_text() {
        let dir = tempfile::tempdir().expect("dir");
        let pdf = write_temp(&dir, "a.pdf", b"%PDF-1.7\n");
        let extraction = extract(FileKind::Pdf, &pdf);
        assert_eq!(
            (extraction.status, extraction.text),
            (ProcessingStatus::Pending, None)
        );

        let mut png = b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR".to_vec();
        png.extend_from_slice(&640_u32.to_be_bytes());
        png.extend_from_slice(&480_u32.to_be_bytes());
        let path = write_temp(&dir, "a.png", &png);
        let extraction = extract(FileKind::Png, &path);
        assert_eq!(extraction.status, ProcessingStatus::Completed);
        assert_eq!(extraction.text, None);
        assert_eq!(
            (
                &extraction.metadata["width"],
                &extraction.metadata["height"]
            ),
            (&Value::from(640), &Value::from(480))
        );
    }

    #[test]
    fn jpeg_and_webp_dimensions_are_read_from_their_headers() {
        // SOI, APP0 (length 16), SOF0 with height 300 and width 400.
        let mut jpeg = vec![0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10];
        jpeg.extend_from_slice(&[0; 14]);
        jpeg.extend_from_slice(&[0xFF, 0xC0, 0x00, 0x11, 0x08, 0x01, 0x2C, 0x01, 0x90]);
        assert_eq!(image_dimensions(FileKind::Jpeg, &jpeg), Some((400, 300)));

        let mut webp = b"RIFF\0\0\0\0WEBPVP8X".to_vec();
        webp.extend_from_slice(&[0; 8]); // chunk size and flags
        webp.extend_from_slice(&[0x7F, 0x02, 0x00]); // width - 1 = 639
        webp.extend_from_slice(&[0xDF, 0x01, 0x00]); // height - 1 = 479
        assert_eq!(image_dimensions(FileKind::Webp, &webp), Some((640, 480)));
        assert_eq!(image_dimensions(FileKind::Png, b"not a png"), None);
    }
}

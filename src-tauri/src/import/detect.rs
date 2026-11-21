//! Identification of imported files (specification §7.1–7.2): an allowed extension **and** content bytes
//! that agree with it. A file whose content contradicts its extension is refused, whatever its name says.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Formats the Library accepts.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum FileKind {
    Pdf,
    Docx,
    Text,
    Markdown,
    Csv,
    Json,
    Png,
    Jpeg,
    Webp,
}

/// Extensions offered by the file picker, lowercase, without the dot.
pub const SUPPORTED_EXTENSIONS: &[&str] = &[
    "pdf", "docx", "txt", "md", "markdown", "csv", "json", "png", "jpg", "jpeg", "webp",
];

/// Number of leading bytes read to check the signature (a PDF header may follow up to 1 KiB of junk).
pub const HEADER_LEN: usize = 1024;

impl FileKind {
    pub fn from_extension(extension: &str) -> Option<Self> {
        Some(match extension.to_ascii_lowercase().as_str() {
            "pdf" => Self::Pdf,
            "docx" => Self::Docx,
            "txt" => Self::Text,
            "md" | "markdown" => Self::Markdown,
            "csv" => Self::Csv,
            "json" => Self::Json,
            "png" => Self::Png,
            "jpg" | "jpeg" => Self::Jpeg,
            "webp" => Self::Webp,
            _ => return None,
        })
    }

    /// Extension of the managed copy.
    pub fn extension(self) -> &'static str {
        match self {
            Self::Pdf => "pdf",
            Self::Docx => "docx",
            Self::Text => "txt",
            Self::Markdown => "md",
            Self::Csv => "csv",
            Self::Json => "json",
            Self::Png => "png",
            Self::Jpeg => "jpg",
            Self::Webp => "webp",
        }
    }

    pub fn mime_type(self) -> &'static str {
        match self {
            Self::Pdf => "application/pdf",
            Self::Docx => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            Self::Text => "text/plain",
            Self::Markdown => "text/markdown",
            Self::Csv => "text/csv",
            Self::Json => "application/json",
            Self::Png => "image/png",
            Self::Jpeg => "image/jpeg",
            Self::Webp => "image/webp",
        }
    }

    pub fn from_mime_type(mime_type: &str) -> Option<Self> {
        [
            Self::Pdf,
            Self::Docx,
            Self::Text,
            Self::Markdown,
            Self::Csv,
            Self::Json,
            Self::Png,
            Self::Jpeg,
            Self::Webp,
        ]
        .into_iter()
        .find(|kind| kind.mime_type() == mime_type)
    }

    pub fn is_text(self) -> bool {
        matches!(self, Self::Text | Self::Markdown | Self::Csv | Self::Json)
    }

    pub fn is_image(self) -> bool {
        matches!(self, Self::Png | Self::Jpeg | Self::Webp)
    }

    /// True when the first bytes of the file are consistent with this format.
    pub fn matches_signature(self, header: &[u8]) -> bool {
        match self {
            // The PDF header may be preceded by a few bytes of junk (tolerated by every reader).
            Self::Pdf => header.windows(5).any(|window| window == b"%PDF-"),
            Self::Docx => header.starts_with(b"PK\x03\x04"),
            Self::Png => header.starts_with(b"\x89PNG\r\n\x1a\n"),
            Self::Jpeg => header.starts_with(&[0xFF, 0xD8, 0xFF]),
            Self::Webp => {
                header.len() >= 12
                    && header.get(..4) == Some(b"RIFF")
                    && header.get(8..12) == Some(b"WEBP")
            }
            Self::Text | Self::Markdown | Self::Csv | Self::Json => looks_like_text(header),
        }
    }
}

/// Text files have no NUL byte, except UTF-16 files, which start with a byte order mark.
fn looks_like_text(header: &[u8]) -> bool {
    header.starts_with(&[0xFF, 0xFE]) || header.starts_with(&[0xFE, 0xFF]) || !header.contains(&0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extensions_map_to_kinds_whatever_their_case() {
        assert_eq!(FileKind::from_extension("PDF"), Some(FileKind::Pdf));
        assert_eq!(FileKind::from_extension("Jpeg"), Some(FileKind::Jpeg));
        assert_eq!(
            FileKind::from_extension("markdown"),
            Some(FileKind::Markdown)
        );
        assert_eq!(FileKind::from_extension("exe"), None);
        assert_eq!(FileKind::from_extension("doc"), None);
        for extension in SUPPORTED_EXTENSIONS {
            let kind = FileKind::from_extension(extension).expect("supported");
            assert_eq!(FileKind::from_mime_type(kind.mime_type()), Some(kind));
        }
    }

    #[test]
    fn signatures_must_agree_with_the_extension() {
        assert!(FileKind::Pdf.matches_signature(b"%PDF-1.7\n"));
        assert!(FileKind::Pdf.matches_signature(b"\xEF\xBB\xBF%PDF-1.4"));
        assert!(!FileKind::Pdf.matches_signature(b"MZ\x90\x00 not a pdf"));
        assert!(FileKind::Docx.matches_signature(b"PK\x03\x04\x14\x00"));
        assert!(!FileKind::Docx.matches_signature(b"%PDF-1.7"));
        assert!(FileKind::Png.matches_signature(b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR"));
        assert!(FileKind::Jpeg.matches_signature(&[0xFF, 0xD8, 0xFF, 0xE0]));
        assert!(FileKind::Webp.matches_signature(b"RIFF\x24\0\0\0WEBPVP8 "));
        assert!(!FileKind::Webp.matches_signature(b"RIFF\x24\0\0\0WAVE"));
    }

    #[test]
    fn text_formats_refuse_binary_content_but_accept_utf16() {
        assert!(FileKind::Text.matches_signature("Résumé du cours".as_bytes()));
        assert!(FileKind::Csv.matches_signature(b"a;b\n1;2\n"));
        assert!(!FileKind::Text.matches_signature(b"MZ\x90\x00\x03\x00"));
        assert!(FileKind::Text.matches_signature(&[0xFF, 0xFE, b'A', 0]));
    }
}

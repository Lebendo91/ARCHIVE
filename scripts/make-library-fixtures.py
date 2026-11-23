#!/usr/bin/env python3
"""Generates the test files of the Library (tests/fixtures/library/), byte for byte reproducible.

Real files of each supported format, plus problem cases: a malformed JSON and an executable renamed .pdf.
They are used by the end-to-end tests (served by the native core double) and by the native validation.
"""

from __future__ import annotations

import io
import pathlib
import struct
import zipfile
import zlib

OUT = pathlib.Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "library"


def pdf(
    pages: list[list[tuple[int, str]]],
    info: dict[str, str] | None = None,
    lang: str | None = None,
) -> bytes:
    """A PDF with Helvetica text (WinAnsi encoding, so « é » is written \\351).

    `info` fills the information dictionary (Title, Author, CreationDate…, ASCII text) and `lang` the language
    of the catalog: what the file declares about itself. Without them, the output is the same as before.
    """
    objects: list[bytes] = []
    page_ids = [3 + 2 * index for index in range(len(pages))]
    font_id = 3 + 2 * len(pages)
    language = f" /Lang ({lang})" if lang else ""
    objects.append(f"<< /Type /Catalog /Pages 2 0 R{language} >>".encode())
    kids = " ".join(f"{page_id} 0 R" for page_id in page_ids)
    objects.append(f"<< /Type /Pages /Kids [{kids}] /Count {len(pages)} >>".encode())
    for index, lines in enumerate(pages):
        content_id = page_ids[index] + 1
        objects.append(
            (
                f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents {content_id} 0 R "
                f"/Resources << /Font << /F1 {font_id} 0 R >> >> >>"
            ).encode()
        )
        commands = ["BT"]
        y = 760
        for size, text in lines:
            escaped = (
                text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)").replace("é", "\\351")
            )
            commands.append(f"/F1 {size} Tf 72 {y} Td ({escaped}) Tj")
            commands.append(f"-72 -{y} Td")
            y -= size + 16
        commands.append("ET")
        stream = "\n".join(commands).encode("latin-1")
        objects.append(b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream")
    objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")
    info_reference = ""
    if info:
        entries = " ".join(f"/{key} ({value})" for key, value in info.items())
        objects.append(f"<< {entries} >>".encode("latin-1"))
        info_reference = f" /Info {len(objects)} 0 R"

    output = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = []
    for number, body in enumerate(objects, start=1):
        offsets.append(len(output))
        output += f"{number} 0 obj\n".encode() + body + b"\nendobj\n"
    xref = len(output)
    output += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode()
    for offset in offsets:
        output += f"{offset:010d} 00000 n \n".encode()
    output += (
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R{info_reference} >>\nstartxref\n{xref}\n%%EOF\n"
    ).encode()
    return bytes(output)


def png(width: int, height: int) -> bytes:
    """A small RGB image: amber and graphite stripes."""

    def chunk(kind: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + kind
            + data
            + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
        )

    rows = b""
    for y in range(height):
        color = b"\xd6\xa4\x5d" if (y // 8) % 2 == 0 else b"\x17\x1d\x25"
        rows += b"\x00" + color * width
    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(rows, 9))
        + chunk(b"IEND", b"")
    )


def docx(paragraphs: list[str], title: str, author: str) -> bytes:
    """A minimal but valid Word document (fixed timestamps: reproducible bytes)."""
    body = "".join(
        f'<w:p><w:r><w:t xml:space="preserve">{text}</w:t></w:r></w:p>' for text in paragraphs
    )
    parts = {
        "[Content_Types].xml": (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/word/document.xml" '
            'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
            '<Override PartName="/docProps/core.xml" '
            'ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>'
        ),
        "_rels/.rels": (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" '
            'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
            'Target="word/document.xml"/>'
            '<Relationship Id="rId2" '
            'Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" '
            'Target="docProps/core.xml"/></Relationships>'
        ),
        "word/document.xml": (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
            f"<w:body>{body}</w:body></w:document>"
        ),
        "docProps/core.xml": (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
            'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/">'
            f"<dc:title>{title}</dc:title><dc:creator>{author}</dc:creator>"
            "</cp:coreProperties>"
        ),
    }
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, content in parts.items():
            info = zipfile.ZipInfo(name, date_time=(2026, 9, 1, 8, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, content.encode("utf-8"))
    return buffer.getvalue()


FILES: dict[str, bytes] = {
    "fiche-ne555.pdf": pdf(
        [
            [(24, "Timer NE555"), (14, "Fiche technique : réglage du montage astable")],
            [(18, "Brochage"), (12, "Broche 8 : alimentation VCC")],
        ]
    ),
    "cours-electronique.docx": docx(
        ["Loi d’Ohm", "U = R × I", "Les résistances en série s’additionnent."],
        "Électricité générale",
        "Alice",
    ),
    "schema-montage.png": png(48, 32),
    "notes-de-cours.txt": "Résumé : le condensateur se charge à travers R1 et R2.\n".encode("utf-8"),
    "composants.csv": "référence;valeur;quantité\nR1;10k;2\nC1;100n;1\n".encode("utf-8"),
    "brochage.json": '{"composant": "NE555", "broches": [{"numero": 8, "nom": "VCC"}]}'.encode("utf-8"),
    "export-casse.json": b'{"composant": ',
    "facture.pdf": b"MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff\x00\x00",
}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, content in FILES.items():
        (OUT / name).write_bytes(content)
        print(f"{name}: {len(content)} bytes")


if __name__ == "__main__":
    main()

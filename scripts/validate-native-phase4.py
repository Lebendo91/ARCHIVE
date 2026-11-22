#!/usr/bin/env python3
"""Native validation of Phase 4: the production binary imports real files, like a user.

Three launches under Xvfb, in a temporary data folder (`ARCHIVE_DATA_DIR`), never the user's data. The files
of tests/fixtures/library (one per format, plus a malformed JSON and an executable renamed .pdf) are copied
into a temporary « Documents » folder, then:

1. Ctrl+O opens the native file picker (GTK); the whole folder is selected and imported. The database, the
   managed copies and the originals are checked: originals untouched (same SHA-256, same modification date),
   one managed copy per imported file with the same hash, text extracted by the core (text, CSV, JSON, Word)
   and by pdf.js in the web view (PDF, under the production Content Security Policy), metadata, timeline.
2. The same folder is imported again: everything is a duplicate or refused, nothing is added. The PDF is
   opened from the Library (search, then its title): its preview renders and its opening is recorded.
3. Relaunch: the documents are still there; the log holds no error and no CSP violation.

Screenshots go to visual-audit/native-phase4/. Prerequisites: `npm run tauri build -- --no-bundle`, then Xvfb,
xdotool and ImageMagick (`import`). Exit code 0 only if every check passes.
"""

from __future__ import annotations

import hashlib
import json
import os
import pathlib
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import time

ROOT = pathlib.Path(__file__).resolve().parent.parent
BINARY = ROOT / "src-tauri" / "target" / "release" / "archive"
FIXTURES = ROOT / "tests" / "fixtures" / "library"
OUT = ROOT / "visual-audit" / "native-phase4"
DISPLAY = ":96"

IMPORTED = {
    "fiche-ne555.pdf",
    "cours-electronique.docx",
    "schema-montage.png",
    "notes-de-cours.txt",
    "composants.csv",
    "brochage.json",
    "export-casse.json",
}
REFUSED = {"facture.pdf"}

checks: list[tuple[str, bool]] = []


def check(name: str, condition: bool, detail: object = None) -> None:
    checks.append((name, condition))
    print(("PASS " if condition else "FAIL ") + name, flush=True)
    if not condition and detail is not None:
        print(f"  got: {detail!r}", flush=True)


def sha256(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


class Session:
    def __init__(self, data_dir: pathlib.Path, documents: pathlib.Path) -> None:
        self.data_dir = data_dir
        self.documents = documents
        self.env = {
            **os.environ,
            "DISPLAY": DISPLAY,
            "ARCHIVE_DATA_DIR": str(data_dir),
            # The GTK file picker opens in this folder's parent, like a user's home.
            "HOME": str(documents.parent),
            "GTK_USE_PORTAL": "0",
        }
        self.log = open(OUT / "native-output.log", "a", encoding="utf-8")  # noqa: SIM115

    def run(self, *args: str) -> None:
        subprocess.run(args, check=True, env=self.env)

    def key(self, *keys: str) -> None:
        self.run("xdotool", "key", "--clearmodifiers", *keys)
        time.sleep(0.7)

    def type(self, text: str) -> None:
        self.run("xdotool", "type", "--delay", "40", text)
        time.sleep(0.5)

    def click(self, x: int, y: int) -> None:
        self.run("xdotool", "mousemove", str(x), str(y), "click", "1")
        time.sleep(1.0)

    def shot(self, name: str) -> None:
        self.run("import", "-window", "root", str(OUT / f"{name}.png"))

    def windows(self) -> list[str]:
        found = subprocess.run(
            ["xdotool", "search", "--onlyvisible", "--name", "."],
            env=self.env,
            capture_output=True,
            text=True,
            check=False,
        )
        return found.stdout.split()

    def launch(self) -> subprocess.Popen[bytes]:
        process = subprocess.Popen([str(BINARY)], env=self.env, stdout=self.log, stderr=self.log)
        for _ in range(60):
            found = subprocess.run(
                ["xdotool", "search", "--name", "ARCHIVE"],
                env=self.env,
                capture_output=True,
                text=True,
                check=False,
            )
            if found.stdout.strip():
                break
            time.sleep(0.5)
        time.sleep(8)  # interface loaded and data fetched
        # Gives the keyboard focus to the web view (an empty area of the content).
        self.click(1400, 880)
        return process

    def pick_folder(self, name: str) -> None:
        """Ctrl+O, then in the GTK file picker: go to the folder, select every file, open them."""
        before = set(self.windows())
        self.key("ctrl+o")
        for _ in range(30):
            if set(self.windows()) - before:
                break
            time.sleep(0.5)
        time.sleep(2)
        # Without a window manager, the keyboard follows the pointer: move it over the picker, which opens in
        # the top left corner, above the main window.
        self.run("xdotool", "mousemove", "600", "400")
        time.sleep(0.5)
        self.shot(f"{name}-picker")
        self.key("ctrl+l")
        self.type(f"{self.documents}/")
        self.key("Return")
        time.sleep(1.5)
        # The first file of the list (below the path bar and the column headers), then every file, then « Open ».
        self.click(300, 83)
        self.key("ctrl+a")
        self.shot(f"{name}-picker-selection")
        self.key("Return")
        time.sleep(6)  # copies, extraction, then pdf.js in the web view

    @staticmethod
    def stop(process: subprocess.Popen[bytes]) -> None:
        process.terminate()
        process.wait(timeout=20)
        time.sleep(1)

    def database(self) -> sqlite3.Connection:
        return sqlite3.connect(self.data_dir / "archive.db")

    def managed_copy(self, stored_filename: str) -> pathlib.Path:
        stem = stored_filename.split(".", 1)[0]
        return self.data_dir / "files" / stem[-2:] / stored_filename


def documents_by_name(session: Session) -> dict[str, dict[str, object]]:
    with session.database() as db:
        db.row_factory = sqlite3.Row
        rows = db.execute(
            "SELECT d.*, c.content_text, c.extractor FROM documents d"
            " LEFT JOIN document_contents c ON c.document_id = d.id WHERE d.deleted_at IS NULL"
        ).fetchall()
    return {row["original_filename"]: dict(row) for row in rows}


def first_launch(session: Session, originals: dict[str, tuple[str, int]]) -> None:
    process = session.launch()
    session.shot("01-first-run")
    session.pick_folder("02")
    session.shot("03-import-panel")
    # pdf.js extracts the PDF text in the web view after the import: wait for it.
    for _ in range(40):
        pdf = documents_by_name(session).get("fiche-ne555.pdf")
        if pdf and pdf["indexing_status"] != "pending":
            break
        time.sleep(0.5)
    session.shot("04-after-extraction")
    session.stop(process)

    documents = documents_by_name(session)
    check("every valid file imported, the renamed executable refused", set(documents) == IMPORTED, sorted(documents))
    check(
        "originals untouched (same SHA-256 and modification date)",
        all(
            (sha256(session.documents / name), (session.documents / name).stat().st_mtime_ns) == originals[name]
            for name in originals
        ),
    )
    copies_ok = True
    for name, row in documents.items():
        copy = session.managed_copy(str(row["stored_filename"]))
        if not copy.exists() or sha256(copy) != row["content_hash"] or row["content_hash"] != originals[name][0]:
            copies_ok = False
    check("one managed copy per document, with the hash of its original", copies_ok)

    def content(name: str) -> str:
        return str(documents.get(name, {}).get("content_text") or "")

    def metadata(name: str) -> dict[str, object]:
        return json.loads(str(documents.get(name, {}).get("metadata_json") or "{}"))

    check(
        "text file: content kept as is",
        content("notes-de-cours.txt") == "Résumé : le condensateur se charge à travers R1 et R2.\n",
        content("notes-de-cours.txt"),
    )
    check("CSV: content kept as is", content("composants.csv").startswith("référence;valeur;quantité\nR1;10k;2"))
    check(
        "JSON: values indexed with their path",
        "broches[0].nom: VCC" in content("brochage.json") and "composant: NE555" in content("brochage.json"),
        content("brochage.json"),
    )
    broken = documents.get("export-casse.json", {})
    check(
        "invalid JSON kept, its problem recorded",
        broken.get("indexing_status") == "failed" and metadata("export-casse.json").get("extractionIssue") == "invalid_json",
        broken.get("indexing_status"),
    )
    check(
        "Word: paragraphs extracted, with title and author",
        content("cours-electronique.docx") == "Loi d’Ohm\nU = R × I\nLes résistances en série s’additionnent."
        and metadata("cours-electronique.docx").get("documentTitle") == "Électricité générale"
        and metadata("cours-electronique.docx").get("author") == "Alice",
        (content("cours-electronique.docx"), metadata("cours-electronique.docx")),
    )
    png = documents.get("schema-montage.png", {})
    check(
        "image: dimensions read, no text claimed",
        metadata("schema-montage.png").get("width") == 48
        and metadata("schema-montage.png").get("height") == 32
        and not content("schema-montage.png")
        and png.get("indexing_status") == "completed",
        metadata("schema-montage.png"),
    )
    pdf = documents.get("fiche-ne555.pdf", {})
    check(
        "PDF: text extracted by pdf.js in the web view, with its page count",
        pdf.get("indexing_status") == "completed"
        and "Timer NE555" in content("fiche-ne555.pdf")
        and "Broche 8 : alimentation VCC" in content("fiche-ne555.pdf")
        and pdf.get("extractor") == "pdfjs"
        and metadata("fiche-ne555.pdf").get("pageCount") == 2,
        (pdf.get("indexing_status"), content("fiche-ne555.pdf"), metadata("fiche-ne555.pdf")),
    )
    with session.database() as db:
        events = db.execute(
            "SELECT count(*) FROM timeline_events WHERE event_type = 'document_imported'"
        ).fetchone()[0]
    check("each import recorded in the timeline", events == len(IMPORTED), events)


def second_launch(session: Session) -> None:
    process = session.launch()
    session.pick_folder("05")
    session.shot("06-duplicates")
    count = len(documents_by_name(session))
    check("importing the same files again adds nothing", count == len(IMPORTED), count)
    # Library, search « ne555 », then the title of the only result.
    session.key("Escape")
    session.click(92, 132)
    session.click(400, 109)
    session.type("ne555")
    time.sleep(1.5)
    session.shot("07-library-search")
    session.click(380, 262)
    time.sleep(4)
    session.shot("08-pdf-preview")
    session.stop(process)
    pdf = documents_by_name(session).get("fiche-ne555.pdf", {})
    check("opening the PDF from the Library is recorded", pdf.get("last_opened_at") is not None)


def third_launch(session: Session) -> None:
    process = session.launch()
    session.shot("09-relaunch")
    session.stop(process)
    count = len(documents_by_name(session))
    check("documents still there after a relaunch", count == len(IMPORTED), count)
    log = session.data_dir / "logs" / "archive.log"
    text = log.read_text(encoding="utf-8") if log.exists() else ""
    errors = [line for line in text.splitlines() if "[ERROR]" in line]
    check("application log written", bool(text))
    check("no error in the log (native core or interface)", not errors)
    check("no Content Security Policy violation reported", "CSP violation" not in text)
    for line in errors:
        print("  " + line)


def main() -> int:
    if not BINARY.exists():
        print(f"Missing {BINARY}: run `npm run tauri build -- --no-bundle` first.", file=sys.stderr)
        return 2
    missing = [tool for tool in ("Xvfb", "xdotool", "import") if shutil.which(tool) is None]
    if missing:
        print(
            f"Missing tools: {', '.join(missing)}. On Ubuntu: apt-get install -y xvfb xdotool imagemagick",
            file=sys.stderr,
        )
        return 2
    shutil.rmtree(OUT, ignore_errors=True)
    OUT.mkdir(parents=True)
    xvfb = subprocess.Popen(["Xvfb", DISPLAY, "-screen", "0", "1440x900x24", "-nolisten", "tcp"])
    time.sleep(2)
    workdir = pathlib.Path(tempfile.mkdtemp(prefix="archive-phase4-"))
    data_dir = workdir / "data"
    documents = workdir / "Documents"
    documents.mkdir()
    for fixture in sorted(FIXTURES.iterdir()):
        shutil.copy2(fixture, documents / fixture.name)
    originals = {
        path.name: (sha256(path), path.stat().st_mtime_ns) for path in sorted(documents.iterdir())
    }
    check("fixtures prepared", set(originals) == IMPORTED | REFUSED, sorted(originals))
    try:
        session = Session(data_dir, documents)
        first_launch(session, originals)
        second_launch(session)
        third_launch(session)
    finally:
        xvfb.terminate()
        if (data_dir / "logs").exists():
            shutil.copytree(data_dir / "logs", OUT / "logs", dirs_exist_ok=True)
        shutil.rmtree(workdir, ignore_errors=True)
    failed = [name for name, ok in checks if not ok]
    print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())

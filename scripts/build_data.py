#!/usr/bin/env python3
"""Build static data files for the Dante contabulate app.

The output schema intentionally mirrors the KJV contabulate app:
- docs/data/plays.json
- docs/data/chunks.json
- docs/data/tokens.json
- docs/data/tokens2.json
- docs/data/tokens3.json
- docs/lines/all_lines.json

The source text is Project Gutenberg ebook #1000.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable
from urllib.error import URLError
from urllib.request import urlopen

SOURCE_URL = "https://www.gutenberg.org/cache/epub/1000/pg1000.txt"
ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "docs" / "data"
LINES_DIR = ROOT / "docs" / "lines"
CACHE_DIR = ROOT / "source_text"
CACHE_FILE = CACHE_DIR / "pg1000.txt"

CANTICLES = [
    ("Inferno", "INFERNO", "Inf"),
    ("Purgatorio", "PURGATORIO", "Purg"),
    ("Paradiso", "PARADISO", "Par"),
]
CANTICLE_NAMES = {name for name, _, _ in CANTICLES}
ABBR_BY_CANTICLE = {name: abbr for name, _, abbr in CANTICLES}
HEADER_RE = re.compile(r"(Inferno|Purgatorio|Paradiso)\s+Canto\s+([IVXLCDM]+)\.?", re.IGNORECASE)
TOKEN_RE = re.compile(r"[0-9A-Za-zÀ-ÖØ-öø-ÿ]+", re.UNICODE)
GUTENBERG_START_RE = re.compile(r"\*\*\*\s*START OF THE PROJECT GUTENBERG EBOOK.*?\*\*\*", re.IGNORECASE | re.DOTALL)
GUTENBERG_END_RE = re.compile(r"\*\*\*\s*END OF THE PROJECT GUTENBERG EBOOK.*", re.IGNORECASE | re.DOTALL)


@dataclass
class CantoSection:
    canticle: str
    canto_roman: str
    title: str
    abbr: str
    canto_number: int
    raw_text: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build Dante contabulate data files.")
    parser.add_argument("--source-url", default=SOURCE_URL)
    parser.add_argument("--source-file", type=Path, default=CACHE_FILE)
    parser.add_argument("--skip-download", action="store_true")
    return parser.parse_args()


def download_text(url: str) -> str:
    with urlopen(url, timeout=60) as response:
        return response.read().decode("utf-8-sig")


def load_source_text(source_file: Path, source_url: str, skip_download: bool) -> str:
    if source_file.exists():
        return source_file.read_text(encoding="utf-8-sig")

    if skip_download:
        raise FileNotFoundError(f"Source file not found: {source_file}")

    try:
        text = download_text(source_url)
    except URLError as exc:
        raise RuntimeError(
            f"Unable to download {source_url}. "
            f"Place a local copy at {source_file} or rerun with network access."
        ) from exc

    source_file.parent.mkdir(parents=True, exist_ok=True)
    source_file.write_text(text, encoding="utf-8")
    return text


def clean_gutenberg_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n").replace("\ufeff", "")
    start_match = GUTENBERG_START_RE.search(text)
    if start_match:
        text = text[start_match.end():]
    end_match = GUTENBERG_END_RE.search(text)
    if end_match:
        text = text[:end_match.start()]
    return text.strip()


def roman_to_int(value: str) -> int:
    numerals = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100, "D": 500, "M": 1000}
    total = 0
    prev = 0
    for char in reversed(value.upper()):
        current = numerals[char]
        if current < prev:
            total -= current
        else:
            total += current
            prev = current
    return total


def locate_body_start(text: str) -> int:
    anchor = text.find("Nel mezzo del cammin di nostra vita")
    if anchor == -1:
        match = HEADER_RE.search(text)
        if not match:
            raise ValueError("Could not find the beginning of the poem.")
        return match.start()

    last_header_start = None
    for match in HEADER_RE.finditer(text):
        if match.start() > anchor:
            break
        last_header_start = match.start()
    if last_header_start is None:
        raise ValueError("Could not find the first canto header.")
    return last_header_start


def extract_cantos(text: str) -> list[CantoSection]:
    text = clean_gutenberg_text(text)
    text = text[locate_body_start(text):]

    matches = list(HEADER_RE.finditer(text))
    if not matches:
        raise ValueError("No canto headers found in source text.")

    sections: list[CantoSection] = []
    for idx, match in enumerate(matches):
        canticle = match.group(1).title()
        roman = match.group(2).upper()
        start = match.end()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(text)
        raw_text = text[start:end].strip()
        if raw_text.startswith(canticle):
            raw_text = raw_text[len(canticle):].strip()

        canto_number = roman_to_int(roman)
        sections.append(
            CantoSection(
                canticle=canticle,
                canto_roman=roman,
                title=f"{canticle} {roman}",
                abbr=f"{ABBR_BY_CANTICLE[canticle]}.{roman}",
                canto_number=canto_number,
                raw_text=raw_text,
            )
        )

    return sections


def normalize_line(line: str) -> str:
    line = unicodedata.normalize("NFC", line)
    line = line.replace("“", '"').replace("”", '"').replace("’", "'").replace("—", " ")
    return re.sub(r"\s+", " ", line).strip()


def split_poem_lines(raw_text: str) -> list[str]:
    lines = [normalize_line(part) for part in raw_text.split("\n")]
    lines = [line for line in lines if line and line not in CANTICLE_NAMES]
    return lines


def group_terzine(poem_lines: list[str]) -> list[list[str]]:
    groups: list[list[str]] = []
    current: list[str] = []
    for line in poem_lines:
        current.append(line)
        if len(current) == 3:
            groups.append(current)
            current = []
    if current:
        groups.append(current)
    return groups


def tokenize(text: str) -> list[str]:
    normalized = unicodedata.normalize("NFC", text).lower().replace("’", " ").replace("'", " ")
    return [match.group(0) for match in TOKEN_RE.finditer(normalized)]


def update_ngram_index(index: dict[str, list[list[int]]], terms: Iterable[str], chunk_id: int) -> None:
    counts = Counter(terms)
    for term, count in counts.items():
        index[term].append([chunk_id, count])


def build_dataset(source_text: str) -> dict[str, object]:
    sections = extract_cantos(source_text)
    plays = []
    chunks = []
    all_lines = []
    tokens1: dict[str, list[list[int]]] = defaultdict(list)
    tokens2: dict[str, list[list[int]]] = defaultdict(list)
    tokens3: dict[str, list[list[int]]] = defaultdict(list)

    scene_id = 1
    play_id = 1

    for section in sections:
        poem_lines = split_poem_lines(section.raw_text)
        terzine = group_terzine(poem_lines)
        play_location = f"{play_id:02d}.{ABBR_BY_CANTICLE[section.canticle]}.{section.canto_number:03d}"
        total_words = 0

        line_number = 1
        for terzina_number, terzina_lines in enumerate(terzine, start=1):
            chunk_text = "\n".join(terzina_lines)
            chunk_tokens = tokenize(chunk_text)
            total_words += len(chunk_tokens)

            canonical_id = f"{ABBR_BY_CANTICLE[section.canticle]}.1.{terzina_number}"
            location = f"{play_location}.001.{terzina_number:03d}"
            chunks.append(
                {
                    "scene_id": scene_id,
                    "canonical_id": canonical_id,
                    "location": location,
                    "play_id": play_id,
                    "play_title": section.title,
                    "play_abbr": section.abbr,
                    "genre": section.canticle,
                    "act": 1,
                    "scene": terzina_number,
                    "heading": f"{section.title} {terzina_number}",
                    "total_words": len(chunk_tokens),
                    "unique_words": len(set(chunk_tokens)),
                    "num_speeches": 0,
                    "num_lines": len(terzina_lines),
                    "characters_present_count": 0,
                }
            )

            update_ngram_index(tokens1, chunk_tokens, scene_id)
            update_ngram_index(tokens2, (" ".join(chunk_tokens[i:i + 2]) for i in range(len(chunk_tokens) - 1)), scene_id)
            update_ngram_index(tokens3, (" ".join(chunk_tokens[i:i + 3]) for i in range(len(chunk_tokens) - 2)), scene_id)

            for line in terzina_lines:
                all_lines.append(
                    {
                        "play_id": play_id,
                        "canonical_id": canonical_id,
                        "location": location,
                        "act": 1,
                        "scene": terzina_number,
                        "line_num": line_number,
                        "speaker": "",
                        "text": line,
                    }
                )
                line_number += 1

            scene_id += 1

        plays.append(
            {
                "play_id": play_id,
                "location": play_location,
                "title": section.title,
                "abbr": section.abbr,
                "genre": section.canticle,
                "first_performance_year": None,
                "num_acts": 1,
                "num_scenes": len(terzine),
                "num_speeches": 0,
                "total_words": total_words,
                "total_lines": len(poem_lines),
            }
        )
        play_id += 1

    return {
        "plays": plays,
        "chunks": chunks,
        "tokens1": dict(sorted(tokens1.items())),
        "tokens2": dict(sorted(tokens2.items())),
        "tokens3": dict(sorted(tokens3.items())),
        "all_lines": all_lines,
    }


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def main() -> int:
    args = parse_args()
    try:
        source_text = load_source_text(args.source_file, args.source_url, args.skip_download)
        dataset = build_dataset(source_text)
    except Exception as exc:  # pragma: no cover - surfaced directly in CLI usage
        print(f"error: {exc}", file=sys.stderr)
        return 1

    write_json(DATA_DIR / "plays.json", dataset["plays"])
    write_json(DATA_DIR / "chunks.json", dataset["chunks"])
    write_json(DATA_DIR / "tokens.json", dataset["tokens1"])
    write_json(DATA_DIR / "tokens2.json", dataset["tokens2"])
    write_json(DATA_DIR / "tokens3.json", dataset["tokens3"])
    write_json(LINES_DIR / "all_lines.json", dataset["all_lines"])

    # The Dante app does not use characters, but keeping explicit empty files
    # avoids special-casing shared UI code.
    write_json(DATA_DIR / "characters.json", [])
    write_json(DATA_DIR / "character_name_filter_config.json", {})
    write_json(DATA_DIR / "tokens_char.json", {})
    write_json(DATA_DIR / "tokens_char2.json", {})
    write_json(DATA_DIR / "tokens_char3.json", {})

    print(
        f"Built {len(dataset['plays'])} cantos, "
        f"{len(dataset['chunks'])} terzine, "
        f"and {len(dataset['all_lines'])} lines."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Fetch Dartmouth Dante Project commentary-interest counts by line.

The DDP search endpoint returns all commentary records that touch a requested
canticle/canto/line. We store a compact cache keyed by Dante line id
(e.g. Inf.01.001). The aggregate ``total`` count excludes the base "Text of the
Divine Comedy" result; individual commentary counts are grouped by DDP
commentary id and also exclude that base text.
"""

from __future__ import annotations

import argparse
import html
import json
import re
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from http.cookiejar import CookieJar
from pathlib import Path
from typing import Any
from urllib.parse import urlencode
from urllib.request import HTTPCookieProcessor, Request, build_opener, urlopen

ROOT = Path(__file__).resolve().parents[1]
LINES_FILE = ROOT / "docs" / "lines" / "all_lines.json"
OUT_FILE = ROOT / "source_text" / "ddp_commentary_counts.json"
DDP_BASE_URL = "https://dante.dartmouth.edu/"
DDP_SEARCH_URL = f"{DDP_BASE_URL}search_view.php"
DDP_FORM_URL = f"{DDP_BASE_URL}search.php"
USER_AGENT = "Mozilla/5.0 (compatible; dante-contabulate/1.0; scholarly count cache)"
CANTICA_NUM = {"Inf": 1, "Purg": 2, "Par": 3}
TOTAL_RE = re.compile(r"Displaying\s+[\d,]+-[\d,]+\s+of\s+([\d,]+)\s+results", re.I)
RESULT_RE = re.compile(r'<a\s+class="result"\s+href="[^"]*doc=(\d+)[^"]*"><strong>(.*?)</strong>', re.I | re.S)
OPTION_RE = re.compile(r'<option\s+value="(\d+)">(.*?)</option>', re.I | re.S)
BASE_TEXT_RE = re.compile(r"Text of the\s+<i>Divine Comedy</i>", re.I)
BASE_TEXT_ID = "13215"


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def parse_line_id(canonical_id: str) -> tuple[int, int, int]:
    abbr, canto, line = canonical_id.split(".")
    return CANTICA_NUM[abbr], int(canto), int(line)


def clean_html_text(value: str) -> str:
    value = re.sub(r"<[^>]+>", "", value)
    return re.sub(r"\s+", " ", html.unescape(value)).strip()


def parse_commentary_options() -> dict[str, dict[str, Any]]:
    try:
        req = Request(DDP_FORM_URL, headers={"User-Agent": USER_AGENT})
        form_html = urlopen(req, timeout=30).read().decode("utf-8", "replace")
    except Exception:
        return {}
    out: dict[str, dict[str, Any]] = {}
    for comm_id, label_html in OPTION_RE.findall(form_html):
        if comm_id == "0" or comm_id == BASE_TEXT_ID or len(comm_id) != 5:
            continue
        label = clean_html_text(label_html)
        if not label:
            continue
        name, _, year = label.partition(",")
        out[comm_id] = {"key": comm_id, "label": name.strip() or label, "year": year.strip(), "reference_count": 0}
    return out


def normalize_existing_line(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        total = int(value.get("total", value.get("commentary_interest", 0)) or 0)
        commentaries = value.get("commentaries") if isinstance(value.get("commentaries"), dict) else None
        out = {"total": total}
        if commentaries is not None:
            out["commentaries"] = {str(k): int(v or 0) for k, v in commentaries.items()}
        return out
    try:
        return {"total": int(value or 0)}
    except (TypeError, ValueError):
        return {"total": 0}


def parse_result_page(page_html: str) -> tuple[int, Counter[str], dict[str, str]]:
    total_match = TOTAL_RE.search(page_html)
    total_results = int(total_match.group(1).replace(",", "")) if total_match else 0
    counts: Counter[str] = Counter()
    labels: dict[str, str] = {}
    for doc_id, label_html in RESULT_RE.findall(page_html):
        comm_id = doc_id[:5]
        if comm_id == BASE_TEXT_ID or BASE_TEXT_RE.search(label_html):
            continue
        label = clean_html_text(label_html)
        counts[comm_id] += 1
        labels.setdefault(comm_id, label)
    return total_results, counts, labels


def fetch_line_counts(canonical_id: str, retries: int = 3) -> tuple[str, dict[str, Any], dict[str, str]]:
    cantica, canto, line = parse_line_id(canonical_id)
    params = urlencode(
        [
            ("query", ""),
            ("cmd", "Search"),
            ("language", "any"),
            ("cantica", str(cantica)),
            ("canto", str(canto)),
            ("line", str(line)),
        ]
    )
    search_url = f"{DDP_SEARCH_URL}?{params}"
    last_exc: Exception | None = None
    for attempt in range(retries):
        try:
            opener = build_opener(HTTPCookieProcessor(CookieJar()))
            req = Request(search_url, headers={"User-Agent": USER_AGENT})
            page_html = opener.open(req, timeout=30).read().decode("utf-8", "replace")
            total_results, counts, labels = parse_result_page(page_html)
            total_pages = max(1, (total_results + 19) // 20)
            for page_num in range(2, total_pages + 1):
                page_url = f"{DDP_SEARCH_URL}?cmd=gotopage&arg1={page_num}"
                page_req = Request(page_url, headers={"User-Agent": USER_AGENT})
                next_html = opener.open(page_req, timeout=30).read().decode("utf-8", "replace")
                _, page_counts, page_labels = parse_result_page(next_html)
                counts.update(page_counts)
                labels.update({k: v for k, v in page_labels.items() if k not in labels})
            total = sum(counts.values())
            return canonical_id, {"total": total, "commentaries": dict(sorted(counts.items()))}, labels
        except Exception as exc:  # network flake: retry politely
            last_exc = exc
            time.sleep(0.5 * (attempt + 1))
    raise RuntimeError(f"Failed to fetch {canonical_id}: {last_exc}")


def make_payload(counts: dict[str, Any], commentators: dict[str, dict[str, Any]]) -> dict[str, Any]:
    totals_by_commentary: Counter[str] = Counter()
    normalized_lines = {}
    for line_id, value in sorted(counts.items()):
        normalized = normalize_existing_line(value)
        normalized_lines[line_id] = normalized
        for comm_id, count in normalized.get("commentaries", {}).items():
            totals_by_commentary[comm_id] += int(count or 0)
    for comm_id, total in totals_by_commentary.items():
        commentators.setdefault(comm_id, {"key": comm_id, "label": comm_id, "year": "", "reference_count": 0})
        commentators[comm_id]["reference_count"] = total
    return {
        "source": "Dartmouth Dante Project search counts",
        "source_url": DDP_SEARCH_URL,
        "description": "Line-level commentary result counts; base Divine Comedy text result excluded. Individual counts are grouped by DDP commentary id.",
        "metadata": {
            "commentators": sorted(commentators.values(), key=lambda item: (str(item.get("label", "")), str(item.get("key", ""))))
        },
        "lines": normalized_lines,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Build DDP line commentary count cache.")
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--limit", type=int, default=0, help="Optional line limit for smoke tests.")
    parser.add_argument("--refresh-individuals", action="store_true", help="Refetch lines that have only aggregate totals.")
    args = parser.parse_args()

    lines = load_json(LINES_FILE, [])
    ids = [str(row["canonical_id"]) for row in lines if row.get("canonical_id")]
    if args.limit:
        ids = ids[: args.limit]

    existing = load_json(OUT_FILE, {})
    raw_lines = existing.get("lines", existing if isinstance(existing, dict) else {})
    counts = {str(k): normalize_existing_line(v) for k, v in raw_lines.items()}
    commentators = parse_commentary_options()
    for item in existing.get("metadata", {}).get("commentators", []) if isinstance(existing, dict) else []:
        key = str(item.get("key", "")).strip()
        if key and key != BASE_TEXT_ID and len(key) == 5:
            commentators.setdefault(key, {"key": key, "label": str(item.get("label") or key), "year": str(item.get("year") or ""), "reference_count": 0})

    todo = [
        line_id
        for line_id in ids
        if line_id not in counts or (args.refresh_individuals and "commentaries" not in counts[line_id])
    ]
    print(f"DDP commentary count cache: {len(counts)} cached, {len(todo)} to fetch")

    done = 0
    seen_labels: dict[str, str] = {}
    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        futures = {pool.submit(fetch_line_counts, line_id): line_id for line_id in todo}
        for fut in as_completed(futures):
            line_id, line_counts, labels = fut.result()
            counts[line_id] = line_counts
            seen_labels.update({k: v for k, v in labels.items() if k not in seen_labels})
            for comm_id, label in labels.items():
                commentators.setdefault(comm_id, {"key": comm_id, "label": label, "year": "", "reference_count": 0})
            done += 1
            if done % 100 == 0 or done == len(todo):
                OUT_FILE.write_text(json.dumps(make_payload(counts, commentators), ensure_ascii=False, indent=2), encoding="utf-8")
                print(f"fetched {done}/{len(todo)}")

    OUT_FILE.write_text(json.dumps(make_payload(counts, commentators), ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {OUT_FILE} with {len(counts)} line counts")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

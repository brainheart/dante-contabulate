#!/usr/bin/env python3
"""Fetch Dartmouth Dante Project commentary-interest counts by line.

The DDP search endpoint returns all commentary records that touch a requested
canticle/canto/line. We store a compact cache keyed by Dante line id
(e.g. Inf.01.001) and subtract the base "Text of the Divine Comedy" result so
these are commentary counts, not text+commentary counts.
"""

from __future__ import annotations

import argparse
import json
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
LINES_FILE = ROOT / "docs" / "lines" / "all_lines.json"
OUT_FILE = ROOT / "source_text" / "ddp_commentary_counts.json"
DDP_SEARCH_URL = "https://dante.dartmouth.edu/search_view.php"
USER_AGENT = "Mozilla/5.0 (compatible; dante-contabulate/1.0; scholarly count cache)"
CANTICA_NUM = {"Inf": 1, "Purg": 2, "Par": 3}
TOTAL_RE = re.compile(r"Displaying\s+[\d,]+-[\d,]+\s+of\s+([\d,]+)\s+results", re.I)
BASE_TEXT_RE = re.compile(r"Text of the\s+<i>Divine Comedy</i>", re.I)


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def parse_line_id(canonical_id: str) -> tuple[int, int, int]:
    abbr, canto, line = canonical_id.split(".")
    return CANTICA_NUM[abbr], int(canto), int(line)


def fetch_count(canonical_id: str, retries: int = 3) -> tuple[str, int]:
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
    url = f"{DDP_SEARCH_URL}?{params}"
    last_exc: Exception | None = None
    for attempt in range(retries):
        try:
            req = Request(url, headers={"User-Agent": USER_AGENT})
            html = urlopen(req, timeout=30).read().decode("utf-8", "replace")
            match = TOTAL_RE.search(html)
            total = int(match.group(1).replace(",", "")) if match else 0
            base_text = 1 if BASE_TEXT_RE.search(html) else 0
            return canonical_id, max(0, total - base_text)
        except Exception as exc:  # network flake: retry politely
            last_exc = exc
            time.sleep(0.5 * (attempt + 1))
    raise RuntimeError(f"Failed to fetch {canonical_id}: {last_exc}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Build DDP line commentary count cache.")
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--limit", type=int, default=0, help="Optional line limit for smoke tests.")
    args = parser.parse_args()

    lines = load_json(LINES_FILE, [])
    ids = [str(row["canonical_id"]) for row in lines if row.get("canonical_id")]
    if args.limit:
        ids = ids[: args.limit]

    existing = load_json(OUT_FILE, {})
    counts = dict(existing.get("lines", existing if isinstance(existing, dict) else {}))
    todo = [line_id for line_id in ids if line_id not in counts]
    print(f"DDP commentary count cache: {len(counts)} cached, {len(todo)} to fetch")

    done = 0
    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        futures = {pool.submit(fetch_count, line_id): line_id for line_id in todo}
        for fut in as_completed(futures):
            line_id, count = fut.result()
            counts[line_id] = count
            done += 1
            if done % 100 == 0 or done == len(todo):
                OUT_FILE.write_text(
                    json.dumps(
                        {
                            "source": "Dartmouth Dante Project search counts",
                            "source_url": DDP_SEARCH_URL,
                            "description": "Line-level commentary result counts; base Divine Comedy text result excluded.",
                            "lines": dict(sorted(counts.items())),
                        },
                        ensure_ascii=False,
                        indent=2,
                    ),
                    encoding="utf-8",
                )
                print(f"fetched {done}/{len(todo)}")

    OUT_FILE.write_text(
        json.dumps(
            {
                "source": "Dartmouth Dante Project search counts",
                "source_url": DDP_SEARCH_URL,
                "description": "Line-level commentary result counts; base Divine Comedy text result excluded.",
                "lines": dict(sorted(counts.items())),
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"Wrote {OUT_FILE} with {len(counts)} line counts")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

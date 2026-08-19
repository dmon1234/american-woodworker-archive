#!/usr/bin/env python3
from __future__ import annotations

import argparse
import concurrent.futures
import json
import os
import re
import sys
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path


SITE_ROOT = Path(__file__).resolve().parents[1]
EXPECTED_ISSUES = 157


@dataclass(frozen=True)
class IssueSource:
    id: str
    disc: int
    year: int
    sequence: int
    issue_dir: Path


UNESCAPED_AMPERSAND = re.compile(r"&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)")


def clean_xml(raw: str) -> str:
    raw = raw.replace("<!--<!---->-->", "<!---->")
    return UNESCAPED_AMPERSAND.sub("&amp;", raw)


def parse_xml(path: Path) -> ET.Element:
    raw = path.read_text(encoding="utf-8-sig", errors="replace")
    try:
        return ET.fromstring(raw)
    except ET.ParseError:
        return ET.fromstring(clean_xml(raw))


def rel_from_site(path: Path, site_root: Path) -> str:
    return Path(os.path.relpath(path.resolve(), site_root.resolve())).as_posix()


def path_from_site(relative_path: str, site_root: Path) -> Path:
    return (site_root / relative_path).resolve()


def normalize_text(value: str | None) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def issue_roots(source_root: Path) -> list[tuple[int, Path]]:
    return [
        (1, source_root / "American Woodworker 1" / "disc1" / "issues"),
        (2, source_root / "American Woodworker 2" / "disc2" / "issues"),
    ]


def discover_issue_sources(source_root: Path) -> list[IssueSource]:
    sources: list[IssueSource] = []
    for disc, issue_root in issue_roots(source_root):
        if not issue_root.is_dir():
            raise RuntimeError(f"Missing issue directory: {issue_root}")
        for year_dir in sorted(path for path in issue_root.iterdir() if path.is_dir()):
            year = int(year_dir.name)
            for issue_dir in sorted(path for path in year_dir.iterdir() if path.is_dir()):
                match = re.fullmatch(r"(\d{4})_(\d{2})", issue_dir.name)
                if not match:
                    raise RuntimeError(f"Unexpected issue directory name: {issue_dir}")
                sources.append(
                    IssueSource(
                        id=issue_dir.name,
                        disc=disc,
                        year=year,
                        sequence=int(match.group(2)),
                        issue_dir=issue_dir,
                    )
                )
    return sorted(sources, key=lambda source: (source.year, source.sequence, source.disc))


def issue_source_for_id(source_root: Path, issue_id: str) -> IssueSource:
    match = re.fullmatch(r"(\d{4})_(\d{2})", issue_id)
    if not match:
        raise RuntimeError(f"Expected issue id in YYYY_NN form, got: {issue_id}")

    year = int(match.group(1))
    sequence = int(match.group(2))
    matches: list[IssueSource] = []
    for disc in (1, 2):
        issue_dir = source_root / f"American Woodworker {disc}" / f"disc{disc}" / "issues" / str(year) / issue_id
        if issue_dir.is_dir():
            matches.append(IssueSource(issue_id, disc, year, sequence, issue_dir))

    if len(matches) != 1:
        locations = "\n".join(str(source.issue_dir) for source in matches) or "none"
        raise RuntimeError(f"Expected one source directory for {issue_id}, found {len(matches)}:\n{locations}")

    return matches[0]


def find_single_asset_file(issue_dir: Path, filename: str) -> Path:
    matches = list(issue_dir.glob(f"*/*/{filename}"))
    if len(matches) != 1:
        raise RuntimeError(f"Expected one {filename} under {issue_dir}, found {len(matches)}")
    return matches[0]


def page_text_by_number(text_root: ET.Element) -> dict[int, str]:
    pages: dict[int, str] = {}
    for page in text_root.findall("./page"):
        page_number = int(page.attrib["p"])
        pages[page_number] = normalize_text("".join(page.itertext()))
    return pages


def build_issue(source: IssueSource, source_root: Path, site_root: Path) -> tuple[dict, list[dict], list[dict]]:
    document_path = find_single_asset_file(source.issue_dir, "document.xml")
    text_path = find_single_asset_file(source.issue_dir, "DocumentText.xml")
    asset_dir = document_path.parent
    document_root = parse_xml(document_path)
    text_root = parse_xml(text_path)

    title = normalize_text(document_root.findtext("title"))
    pages = []
    for page in document_root.findall("./pages/page"):
        page_number = int(page.attrib["pagenum"])
        image = asset_dir / page.attrib["src"]
        thumbnail = asset_dir / f"Thumbnail_{page_number}.jpg"
        pages.append(
            {
                "number": page_number,
                "label": page.attrib.get("label", ""),
                "image": rel_from_site(image, site_root),
                "thumbnail": rel_from_site(thumbnail, site_root),
                "width": int(page.findtext("pagewidth") or 0),
                "height": int(page.findtext("pageheight") or 0),
            }
        )

    toc = [
        {
            "title": normalize_text(item.attrib.get("label")),
            "page": int(item.attrib["gotopage"]),
        }
        for item in document_root.findall("./customtoc/content")
    ]

    cover = source_root / f"American Woodworker {source.disc}" / f"disc{source.disc}" / "images" / "sub" / "covers" / f"{source.id}.jpg"
    if not cover.exists():
        raise RuntimeError(f"{source.id}: missing cover {cover}")

    for page in pages:
        if not (site_root / page["image"]).resolve().exists():
            raise RuntimeError(f"{source.id} page {page['number']}: missing image {page['image']}")
        if not (site_root / page["thumbnail"]).resolve().exists():
            raise RuntimeError(f"{source.id} page {page['number']}: missing thumbnail {page['thumbnail']}")

    text_pages = page_text_by_number(text_root)
    source_issue_dir = source.issue_dir.resolve().relative_to(source_root.resolve()).as_posix()

    issue = {
        "id": source.id,
        "disc": source.disc,
        "year": source.year,
        "sequence": source.sequence,
        "sortKey": f"{source.year:04d}_{source.sequence:02d}",
        "title": title,
        "pageCount": len(pages),
        "source": {
            "issueDir": source_issue_dir,
            "assetDir": rel_from_site(asset_dir, site_root),
            "documentXml": rel_from_site(document_path, site_root),
            "documentTextXml": rel_from_site(text_path, site_root),
        },
        "coverImage": rel_from_site(cover, site_root),
        "toc": toc,
        "pages": pages,
    }

    page_index = [
        {
            "issueId": source.id,
            "page": page["number"],
            "title": title,
            "text": text_pages.get(page["number"], ""),
        }
        for page in pages
    ]

    toc_index = [
        {
            "issueId": source.id,
            "page": item["page"],
            "title": item["title"],
        }
        for item in toc
    ]

    return issue, page_index, toc_index


def validate_archive(issues: list[dict], pages: list[dict], toc: list[dict], expected_issues: int) -> None:
    errors: list[str] = []
    if len(issues) != expected_issues:
        errors.append(f"Expected {expected_issues} issues, emitted {len(issues)}")

    issue_map = {issue["id"]: issue for issue in issues}
    if len(issue_map) != len(issues):
        errors.append("Duplicate issue ids emitted")

    valid_issue_pages: dict[str, set[int]] = {}
    for issue in issues:
        issue_pages = {page["number"] for page in issue["pages"]}
        expected_pages = set(range(1, issue["pageCount"] + 1))
        valid_issue_pages[issue["id"]] = issue_pages
        if issue_pages != expected_pages:
            errors.append(f"{issue['id']}: non-contiguous page model")
        for entry in issue["toc"]:
            if entry["page"] not in issue_pages:
                errors.append(f"{issue['id']}: TOC target out of range: {entry['title']} -> {entry['page']}")

    for record in pages:
        issue_pages = valid_issue_pages.get(record["issueId"])
        if issue_pages is None:
            errors.append(f"Search page record references unknown issue {record['issueId']}")
        elif record["page"] not in issue_pages:
            errors.append(f"Search page record references invalid page {record['issueId']}:{record['page']}")

    for record in toc:
        issue_pages = valid_issue_pages.get(record["issueId"])
        if issue_pages is None:
            errors.append(f"Search TOC record references unknown issue {record['issueId']}")
        elif record["page"] not in issue_pages:
            errors.append(f"Search TOC record references invalid page {record['issueId']}:{record['page']}")

    if errors:
        formatted = "\n".join(f"- {error}" for error in errors[:50])
        extra = "" if len(errors) <= 50 else f"\n... and {len(errors) - 50} more"
        raise RuntimeError(f"Archive validation failed:\n{formatted}{extra}")


def write_js(path: Path, global_name: str, payload: dict) -> None:
    encoded = json.dumps(payload, ensure_ascii=True, separators=(",", ":"))
    path.write_text(f"window.{global_name} = {encoded};\n", encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate local American Woodworker archive metadata and search data from original DVD files."
    )
    parser.add_argument(
        "--source-root",
        type=Path,
        default=SITE_ROOT.parent,
        help="Directory containing 'American Woodworker 1' and 'American Woodworker 2'. Defaults to the parent of this repository.",
    )
    parser.add_argument(
        "--site-root",
        type=Path,
        default=SITE_ROOT,
        help="Directory where index.html, reader.html, and assets/js live. Defaults to this repository.",
    )
    parser.add_argument(
        "--expected-issues",
        type=int,
        default=None,
        help="Expected number of issues. Defaults to 157, or 1 when --issue is used.",
    )
    parser.add_argument(
        "--issue",
        help="Build one issue id such as 1985_01 without scanning the full issue tree.",
    )
    parser.add_argument(
        "--jobs",
        type=int,
        default=min(4, os.cpu_count() or 1),
        help="Number of issue files to process concurrently. Defaults to up to 4.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    source_root = args.source_root.expanduser().resolve()
    site_root = args.site_root.expanduser().resolve()
    jobs = max(1, args.jobs)
    expected_issues = args.expected_issues if args.expected_issues is not None else (1 if args.issue else EXPECTED_ISSUES)

    issues = []
    pages = []
    toc = []

    if args.issue:
        sources = [issue_source_for_id(source_root, args.issue)]
        print(f"Selected issue {args.issue}", file=sys.stderr, flush=True)
    else:
        sources = discover_issue_sources(source_root)
        print(f"Discovered {len(sources)} issue directories", file=sys.stderr, flush=True)

    if jobs == 1:
        for index, source in enumerate(sources, 1):
            print(f"[{index}/{len(sources)}] {source.id}", file=sys.stderr, flush=True)
            issue, page_index, toc_index = build_issue(source, source_root, site_root)
            issues.append(issue)
            pages.extend(page_index)
            toc.extend(toc_index)
    else:
        print(f"Processing with {jobs} jobs", file=sys.stderr, flush=True)
        with concurrent.futures.ThreadPoolExecutor(max_workers=jobs) as executor:
            future_sources = {
                executor.submit(build_issue, source, source_root, site_root): source
                for source in sources
            }
            for index, future in enumerate(concurrent.futures.as_completed(future_sources), 1):
                source = future_sources[future]
                issue, page_index, toc_index = future.result()
                print(f"[{index}/{len(sources)}] {source.id}", file=sys.stderr, flush=True)
                issues.append(issue)
                pages.extend(page_index)
                toc.extend(toc_index)

    issues.sort(key=lambda issue: issue["sortKey"])
    print("Validating in-memory archive model", file=sys.stderr, flush=True)
    validate_archive(issues, pages, toc, expected_issues)

    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    archive_payload = {
        "title": "American Woodworker",
        "subtitle": "1985-2010",
        "generatedAt": generated_at,
        "issues": issues,
    }
    search_payload = {
        "generatedAt": generated_at,
        "pages": pages,
        "toc": toc,
    }

    output_dir = site_root / "assets" / "js"
    output_dir.mkdir(parents=True, exist_ok=True)
    archive_path = output_dir / "archive-data.js"
    search_path = output_dir / "search-data.js"
    print("Writing generated data files", file=sys.stderr, flush=True)
    write_js(archive_path, "AW_ARCHIVE", archive_payload)
    write_js(search_path, "AW_SEARCH_INDEX", search_payload)

    print(f"Source root: {source_root}")
    print(f"Site root: {site_root}")
    print(f"Wrote {len(issues)} issues")
    print(f"Wrote {len(pages)} page search records")
    print(f"Wrote {len(toc)} TOC search records")
    print(f"{archive_path.relative_to(site_root)} {archive_path.stat().st_size} bytes")
    print(f"{search_path.relative_to(site_root)} {search_path.stat().st_size} bytes")


if __name__ == "__main__":
    main()

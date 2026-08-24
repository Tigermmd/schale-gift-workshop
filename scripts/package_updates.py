"""Discover gift-related package announcements from the official CN news API."""

from __future__ import annotations

import hashlib
import re
from datetime import datetime, timezone
from html.parser import HTMLParser


OFFICIAL_NEWS_BASE = "https://bluearchive-cn.com/news"
PACKAGE_HEADING = re.compile(r"^(?:[一二三四五六七八九十百]+|\d+)[、.．]\s*(.+)$")
PRICE_PATTERN = re.compile(r"(?P<price>\d+(?:\.\d+)?)\s*元")
LIMIT_PATTERN = re.compile(r"(?:限购|可购买)\s*(?P<limit>\d+)\s*次")
RELEVANT_KEYWORDS = (
    "礼物",
    "花束",
    "拱心石",
    "制造石",
    "合成石",
    "制造礼包",
)
BLOCK_TAGS = {
    "br",
    "div",
    "li",
    "p",
    "section",
    "table",
    "td",
    "th",
    "tr",
}


class _LineParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []

    def handle_starttag(self, tag, attrs):
        if tag.lower() in BLOCK_TAGS:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag.lower() in BLOCK_TAGS:
            self.parts.append("\n")

    def handle_data(self, data):
        self.parts.append(data)


def html_lines(content):
    parser = _LineParser()
    parser.feed(str(content or ""))
    parser.close()
    lines = []
    for raw in "".join(parser.parts).splitlines():
        line = re.sub(r"\s+", " ", raw.replace("\xa0", " ")).strip()
        if line:
            lines.append(line)
    return lines


def _published_at(milliseconds):
    try:
        stamp = int(milliseconds) / 1000
    except (TypeError, ValueError):
        return None
    return datetime.fromtimestamp(stamp, tz=timezone.utc).isoformat(timespec="seconds")


def _package_sections(lines):
    sections = []
    current = None
    for line in lines:
        match = PACKAGE_HEADING.match(line)
        if match and not line.startswith("■"):
            if current:
                sections.append(current)
            current = {"name": match.group(1).strip(), "lines": []}
        elif current:
            current["lines"].append(line)
    if current:
        sections.append(current)
    return sections


def _section_values(lines, heading):
    values = []
    collecting = False
    for line in lines:
        if line.startswith("■"):
            collecting = heading in line
            continue
        if collecting:
            values.append(line.lstrip("•·- ").strip())
    return [value for value in values if value]


def _parse_package(section, notice_id, index):
    lines = section["lines"]
    price_line = next((line for line in reversed(lines) if PRICE_PATTERN.search(line)), "")
    price_match = PRICE_PATTERN.search(price_line)
    limit_match = LIMIT_PATTERN.search(price_line)
    contents = _section_values(lines, "礼包内容")
    availability = _section_values(lines, "可购买时间")
    name = section["name"]
    relevant = any(keyword in " ".join([name] + contents) for keyword in RELEVANT_KEYWORDS)
    confidence = "high" if price_match and limit_match and contents else "review"
    return {
        "candidateId": f"cn-news-{notice_id}-package-{index}",
        "nameZhCn": name,
        "priceCny": float(price_match.group("price")) if price_match else None,
        "purchaseLimit": int(limit_match.group("limit")) if limit_match else None,
        "availabilityText": availability,
        "contentsText": contents,
        "relevantToGiftWorkshop": relevant,
        "parseConfidence": confidence,
    }


def parse_package_notice(row):
    notice_id = int(row["id"])
    content = str(row.get("content") or row.get("description") or "")
    lines = html_lines(content)
    packages = [
        _parse_package(section, notice_id, index)
        for index, section in enumerate(_package_sections(lines), start=1)
    ]
    return {
        "noticeId": notice_id,
        "title": str(row.get("title") or ""),
        "publishedAt": _published_at(row.get("publishTime")),
        "source": f"{OFFICIAL_NEWS_BASE}/{notice_id}",
        "contentSha256": hashlib.sha256(content.encode("utf-8")).hexdigest(),
        "packages": packages,
    }


def discover_package_candidates(rows, catalog_sources=()):
    known = {str(source).rstrip("/") for source in catalog_sources}
    candidates = []
    for row in rows:
        if "礼包" not in str(row.get("title") or ""):
            continue
        notice = parse_package_notice(row)
        if notice["source"].rstrip("/") in known:
            continue
        notice["packages"] = [
            package for package in notice["packages"] if package["relevantToGiftWorkshop"]
        ]
        if notice["packages"]:
            candidates.append(notice)
    return sorted(candidates, key=lambda item: item["noticeId"], reverse=True)

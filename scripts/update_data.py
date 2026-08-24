#!/usr/bin/env python3
"""Refresh versioned game-data snapshots without using an AI agent."""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from relationship_data import crafting_expected_relationship as crafting_generator
from relationship_data import generate_localization_data as localization_generator
from relationship_data import generate_relationship_data as relationship_generator
from scripts.package_updates import discover_package_candidates
from scripts.snapshot_updates import (
    build_release_timeline,
    semantic_equal,
    validate_generated_snapshots,
)


DATA_DIR = ROOT / "relationship_data"
USER_AGENT = "schale-gift-workshop-updater/1.0"
MAX_RESPONSE_BYTES = 32 * 1024 * 1024
ALLOWED_ORIGINS = {
    "https://bluearchive-cn.com",
    "https://raw.githubusercontent.com",
    "https://schaledb.com",
}
STUDENT_URLS = {
    "items_en": relationship_generator.ITEMS_EN_URL,
    "students_en": relationship_generator.STUDENTS_EN_URL,
    "items_zh_cn": relationship_generator.ITEMS_CN_URL,
    "students_zh_cn": relationship_generator.STUDENTS_CN_URL,
    "students_jp": localization_generator.SCHaleDB_STUDENTS_JP_URL,
    "items_jp": localization_generator.SCHaleDB_ITEMS_JP_URL,
    "config": relationship_generator.CONFIG_URL,
    "crafting_cn": crafting_generator.CRAFTING_CN_URL,
    "crafting_jp": localization_generator.SCHaleDB_CRAFTING_JP_URL,
}
SNAPSHOT_PATHS = {
    "students": DATA_DIR / "student_gift_preferences.json",
    "gifts": DATA_DIR / "gifts.json",
    "thresholds": DATA_DIR / "relationship_thresholds.json",
    "crafting": DATA_DIR / "crafting_expected_relationship.json",
    "localization": DATA_DIR / "localization.json",
    "timeline": DATA_DIR / "jp_release_timeline.json",
}
CANDIDATE_PATH = DATA_DIR / "paid_packages_cn_candidates.json"
CATALOG_PATH = DATA_DIR / "paid_packages_cn.json"


def _origin(url):
    parsed = urlparse(url)
    return f"{parsed.scheme}://{parsed.netloc}"


def fetch_json(url, attempts=3):
    if _origin(url) not in ALLOWED_ORIGINS:
        raise ValueError(f"source host is not allowed: {url}")
    last_error = None
    for attempt in range(attempts):
        try:
            request = Request(url, headers={"Accept": "application/json", "User-Agent": USER_AGENT})
            with urlopen(request, timeout=60) as response:
                length = response.headers.get("Content-Length")
                if length and int(length) > MAX_RESPONSE_BYTES:
                    raise ValueError(f"source response is too large: {url}")
                payload = response.read(MAX_RESPONSE_BYTES + 1)
            if len(payload) > MAX_RESPONSE_BYTES:
                raise ValueError(f"source response is too large: {url}")
            return json.loads(payload.decode("utf-8"))
        except (OSError, ValueError, json.JSONDecodeError) as error:
            last_error = error
            if attempt + 1 < attempts:
                time.sleep(attempt + 1)
    raise RuntimeError(f"failed to fetch {url}: {last_error}")


def _relationship_payloads(raw, retrieved_at):
    sources = {key: STUDENT_URLS[key] for key in ("items_en", "students_en", "items_zh_cn", "students_zh_cn")}
    source = relationship_generator.source_stamp(raw["config"], retrieved_at, sources)
    gifts = relationship_generator.make_gifts(raw["items_en"], raw["items_zh_cn"])
    students = relationship_generator.make_student_preferences(
        raw["students_en"], raw["students_zh_cn"], gifts, "cn"
    )
    scope = {
        "server": "cn",
        "language": "bilingual",
        "languages": {"en": "en", "zh_cn": "cn"},
        "student_region_index": relationship_generator.REGION_INDEX["cn"],
    }
    gift_payload = {
        "schema_version": 2,
        "scope": scope,
        "source": source,
        "gift_count": len(gifts),
        "gifts": gifts,
    }
    student_scope = dict(scope, catalog="complete_student_catalog")
    student_payload = {
        "schema_version": 2,
        "scope": student_scope,
        "source": source,
        "student_count": len(students),
        "cn_released_student_count": sum(1 for student in students if student["cn_released"]),
        "common_premium_tags": relationship_generator.COMMON_FAVOR_TAGS,
        "reaction_labels_en": {str(key): value for key, value in relationship_generator.REACTION_LABELS_EN.items()},
        "reaction_labels_zh_cn": {str(key): value for key, value in relationship_generator.REACTION_LABELS_ZH_CN.items()},
        "reaction_labels_zh": {"1": "小", "2": "中", "3": "大", "4": "特大"},
        "students": students,
    }
    threshold_payload = {
        "schema_version": 2,
        "scope": {"server": "cn", "language": "bilingual", "languages": {"en": "en", "zh_cn": "cn"}},
        "source": source,
        "relationship_level_cap": 100,
        "stat_bonus_level_cap": 50,
        "gift_exp": {
            "normal": {"小": 20, "中": 40, "大": 60, "特大": 80},
            "premium": {"小": None, "中": 120, "大": 180, "特大": 240},
        },
        "gift_exp_bilingual": {
            "en": {
                "normal": {"Small": 20, "Medium": 40, "Large": 60, "Huge": 80},
                "premium": {"Small": None, "Medium": 120, "Large": 180, "Huge": 240},
            },
            "zh_cn": {
                "normal": {"小": 20, "中": 40, "大": 60, "特大": 80},
                "premium": {"小": None, "中": 120, "大": 180, "特大": 240},
            },
        },
        "other_exp": {"cafe_touch": 15, "schedule_min": 15, "schedule_max": 25, "schedule_bonus_multiplier": 2},
        "levels": relationship_generator.make_thresholds(),
    }
    return student_payload, gift_payload, threshold_payload


def _localization_payload(raw, students, gifts, crafting, retrieved_at):
    students_jp = localization_generator.record_index(raw["students_jp"])
    items_jp = localization_generator.record_index(raw["items_jp"])
    nodes_jp = localization_generator.record_index(
        {str(node["Id"]): node for node in raw["crafting_jp"]["Nodes"]}
    )
    student_ids = {str(student["student_id"]) for student in students["students"]}
    gift_ids = {str(gift["id"]) for gift in gifts["gifts"]}
    node_ids = {
        str(node["id"])
        for rows in crafting["crafting_probability"]["node_distributions"].values()
        for node in rows
    }
    student_names = {value: students_jp[value]["Name"] for value in student_ids if value in students_jp}
    gift_names = {value: items_jp[value]["Name"] for value in gift_ids if value in items_jp}
    node_names = {value: nodes_jp[value]["NameJp"] for value in node_ids if value in nodes_jp}
    localization_generator.require_names(student_names, student_ids, "student")
    localization_generator.require_names(gift_names, gift_ids, "gift")
    localization_generator.require_names(node_names, node_ids, "node")
    return {
        "schema_version": 1,
        "scope": {
            "language": "trilingual",
            "languages": {"zh_cn": "cn", "en": "en", "ja": "jp"},
            "student_count": len(student_names),
            "gift_count": len(gift_names),
            "node_count": len(node_names),
        },
        "source": {
            "retrieved_at": retrieved_at,
            "students_jp": STUDENT_URLS["students_jp"],
            "items_jp": STUDENT_URLS["items_jp"],
            "crafting_jp": STUDENT_URLS["crafting_jp"],
            "translation_source": "SchaleDB data/jp (JP region data)",
        },
        "students": student_names,
        "gifts": gift_names,
        "nodes": node_names,
    }


def generate_schaledb_snapshots(fetcher=fetch_json, now=None):
    now = now or datetime.now(timezone.utc)
    retrieved_at = now.isoformat(timespec="seconds")
    raw = {name: fetcher(url) for name, url in STUDENT_URLS.items()}
    students, gifts, thresholds = _relationship_payloads(raw, retrieved_at)
    crafting = crafting_generator.build_snapshot(
        students["students"],
        raw["crafting_cn"],
        {"crafting_source": STUDENT_URLS["crafting_cn"], "relationship_snapshot": "student_gift_preferences.json"},
        retrieved_at,
        gifts["gifts"],
    )
    localization = _localization_payload(raw, students, gifts, crafting, retrieved_at)
    timeline = build_release_timeline(raw["students_jp"], now.date().isoformat())
    return {
        "students": students,
        "gifts": gifts,
        "thresholds": thresholds,
        "crafting": crafting,
        "localization": localization,
        "timeline": timeline,
    }


def fetch_news_rows(page_count=8, fetcher=fetch_json):
    rows = {}
    for page in range(1, page_count + 1):
        url = f"https://bluearchive-cn.com/api/news/list?pageIndex={page}&pageNum=50&type=1"
        response = fetcher(url)
        data = response.get("data") if isinstance(response, dict) else None
        page_rows = data.get("rows") if isinstance(data, dict) else None
        if not isinstance(page_rows, list):
            raise ValueError(f"official news API returned an invalid page: {page}")
        for row in page_rows:
            rows[int(row["id"])] = row
        if not page_rows:
            break
    return list(rows.values())


def _read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def _write_json(path, payload):
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(str(temporary), str(path))


def _catalog_sources(catalog):
    sources = set(catalog.get("sources") or [])
    sources.update(package.get("source") for package in catalog.get("packages", []) if package.get("source"))
    return sources


def build_package_candidate_payload(rows, catalog, now=None):
    now = now or datetime.now(timezone.utc)
    notices = discover_package_candidates(rows, _catalog_sources(catalog))
    return {
        "schemaVersion": 1,
        "server": "cn",
        "generatedAt": now.isoformat(timespec="seconds"),
        "source": {
            "newsApi": "https://bluearchive-cn.com/api/news/list",
            "site": "https://bluearchive-cn.com/news",
        },
        "noticeCount": len(notices),
        "notices": notices,
    }


def plan_updates(news_pages=8):
    current = {key: _read_json(path) for key, path in SNAPSHOT_PATHS.items()}
    generated = generate_schaledb_snapshots()
    validate_generated_snapshots(generated, current)
    changes = {
        key: payload
        for key, payload in generated.items()
        if not semantic_equal(payload, current[key])
    }
    catalog = _read_json(CATALOG_PATH)
    package_payload = build_package_candidate_payload(fetch_news_rows(news_pages), catalog)
    existing_candidates = _read_json(CANDIDATE_PATH) if CANDIDATE_PATH.exists() else None
    if package_payload["notices"]:
        if existing_candidates is None or not semantic_equal(package_payload, existing_candidates):
            changes["packageCandidates"] = package_payload
    elif existing_candidates is not None:
        changes["removePackageCandidates"] = True
    return current, generated, changes


def apply_updates(changes, with_assets=False):
    changed_paths = []
    for key, path in SNAPSHOT_PATHS.items():
        if key in changes:
            _write_json(path, changes[key])
            changed_paths.append(str(path.relative_to(ROOT)))
    if "packageCandidates" in changes:
        _write_json(CANDIDATE_PATH, changes["packageCandidates"])
        changed_paths.append(str(CANDIDATE_PATH.relative_to(ROOT)))
    if changes.get("removePackageCandidates") and CANDIDATE_PATH.exists():
        CANDIDATE_PATH.unlink()
        changed_paths.append(str(CANDIDATE_PATH.relative_to(ROOT)))
    if with_assets and any(key in changes for key in ("students", "gifts", "crafting")):
        from generate_dashboard_assets import build_manifest

        manifest_path = ROOT / "assets" / "manifest.json"
        old_manifest = _read_json(manifest_path) if manifest_path.exists() else None
        manifest = build_manifest(DATA_DIR, ROOT)
        if old_manifest is None or not semantic_equal(old_manifest, manifest):
            _write_json(manifest_path, manifest)
            changed_paths.append(str(manifest_path.relative_to(ROOT)))
    return changed_paths


def _summary(current, generated, changes, changed_paths, applied):
    current_students = current["students"]["students"]
    current_ids = {int(student["student_id"]) for student in current_students}
    generated_students = generated["students"]["students"]
    new_students = [
        {"studentId": int(student["student_id"]), "name": student["name_zh_cn"]}
        for student in generated_students
        if int(student["student_id"]) not in current_ids
    ]
    candidates = changes.get("packageCandidates", {}).get("notices", [])
    return {
        "applied": applied,
        "changed": bool(changes),
        "updates": sorted(changes),
        "changedPaths": changed_paths,
        "studentCount": len(generated_students),
        "giftCount": len(generated["gifts"]["gifts"]),
        "newStudents": new_students,
        "newPackageNotices": [
            {"noticeId": notice["noticeId"], "title": notice["title"], "source": notice["source"]}
            for notice in candidates
        ],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write validated updates to the repository")
    parser.add_argument("--with-assets", action="store_true", help="download missing images when student/gift data changes")
    parser.add_argument("--news-pages", type=int, default=8, help="official CN news pages to scan")
    args = parser.parse_args()
    if not 1 <= args.news_pages <= 40:
        parser.error("--news-pages must be from 1 to 40")
    current, generated, changes = plan_updates(args.news_pages)
    changed_paths = apply_updates(changes, args.with_assets) if args.apply else []
    print(json.dumps(_summary(current, generated, changes, changed_paths, args.apply), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

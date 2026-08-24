#!/usr/bin/env python3
"""Generate the current Blue Archive gift/relationship data snapshot.

The gift matching rule is copied from SchaleDB's StudentGifts view:
student preference tags plus the three common premium-gift tags are matched
against gift tags; the displayed reaction grade is capped at four.
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen


SCHaleDB_BASE_EN = "https://schaledb.com/data/en"
SCHaleDB_BASE_CN = "https://schaledb.com/data/cn"
ITEMS_EN_URL = f"{SCHaleDB_BASE_EN}/items.min.json"
STUDENTS_EN_URL = f"{SCHaleDB_BASE_EN}/students.min.json"
ITEMS_CN_URL = f"{SCHaleDB_BASE_CN}/items.min.json"
STUDENTS_CN_URL = f"{SCHaleDB_BASE_CN}/students.min.json"
CONFIG_URL = "https://schaledb.com/data/config.min.json"
COMMON_FAVOR_TAGS = ["BC", "Bc", "ew"]
REGION_INDEX = {"jp": 0, "global": 1, "cn": 2}
REACTION_LABELS_EN = {1: "Small", 2: "Medium", 3: "Large", 4: "Huge"}
REACTION_LABELS_ZH_CN = {1: "小", 2: "中", 3: "大", 4: "特大"}

# Source: Blue Archive Wikiru, SandBox/絆ランク, table updated 2026-06-13.
# Each tuple is (level, EXP needed to reach the next level, cumulative EXP).
BOND_TABLE = [
    (1, 15, 0), (2, 30, 15), (3, 30, 45), (4, 35, 75),
    (5, 35, 110), (6, 35, 145), (7, 40, 180), (8, 40, 220),
    (9, 40, 260), (10, 60, 300), (11, 90, 360), (12, 105, 450),
    (13, 120, 555), (14, 140, 675), (15, 160, 815), (16, 180, 975),
    (17, 205, 1155), (18, 230, 1360), (19, 255, 1590), (20, 285, 1845),
    (21, 315, 2130), (22, 345, 2445), (23, 375, 2790), (24, 410, 3165),
    (25, 445, 3575), (26, 480, 4020), (27, 520, 4500), (28, 560, 5020),
    (29, 600, 5580), (30, 645, 6180), (31, 690, 6825), (32, 735, 7515),
    (33, 780, 8250), (34, 830, 9030), (35, 880, 9860), (36, 930, 10740),
    (37, 985, 11670), (38, 1040, 12655), (39, 1095, 13695), (40, 1155, 14790),
    (41, 1215, 15945), (42, 1275, 17160), (43, 1335, 18435), (44, 1400, 19770),
    (45, 1465, 21170), (46, 1530, 22635), (47, 1600, 24165), (48, 1670, 25765),
    (49, 1740, 27435), (50, 1815, 29175), (51, 1890, 30990), (52, 1965, 32880),
    (53, 2040, 34845), (54, 2120, 36885), (55, 2200, 39005), (56, 2280, 41205),
    (57, 2365, 43485), (58, 2450, 45850), (59, 2535, 48300), (60, 2625, 50835),
    (61, 2715, 53460), (62, 2805, 56175), (63, 2895, 58980), (64, 2990, 61875),
    (65, 3085, 64865), (66, 3180, 67950), (67, 3280, 71130), (68, 3380, 74410),
    (69, 3480, 77790), (70, 3585, 81270), (71, 3690, 84855), (72, 3795, 88545),
    (73, 3900, 92340), (74, 4010, 96240), (75, 4120, 100250), (76, 4230, 104370),
    (77, 4345, 108600), (78, 4460, 112945), (79, 4575, 117405), (80, 4695, 121980),
    (81, 4815, 126675), (82, 4935, 131490), (83, 5055, 136425), (84, 5180, 141480),
    (85, 5305, 146660), (86, 5430, 151965), (87, 5560, 157395), (88, 5690, 162955),
    (89, 5820, 168645), (90, 5955, 174465), (91, 6090, 180420), (92, 6225, 186510),
    (93, 6360, 192735), (94, 6500, 199095), (95, 6640, 205595), (96, 6780, 212235),
    (97, 6925, 219015), (98, 7070, 225940), (99, 7215, 233010), (100, 7365, 240225),
]


def read_json(path_or_url: str):
    if path_or_url.startswith("http"):
        request = Request(path_or_url, headers={"User-Agent": "BlueArchiveResearch/1.0"})
        with urlopen(request, timeout=60) as response:
            return json.load(response)
    with open(path_or_url, encoding="utf-8") as handle:
        return json.load(handle)


def source_stamp(config: dict, retrieved_at: str, sources: dict[str, str]) -> dict:
    return {
        "retrieved_at": retrieved_at,
        "schaledb_build": config.get("build"),
        "items_source": sources["items_en"],
        "students_source": sources["students_en"],
        "items_source_en": sources["items_en"],
        "students_source_en": sources["students_en"],
        "items_source_zh_cn": sources["items_zh_cn"],
        "students_source_zh_cn": sources["students_zh_cn"],
        "translation_source": "SchaleDB data/cn (CN region data)",
        "config_source": CONFIG_URL,
        "matching_rule_source": "https://schaledb.com/assets/StudentGifts-8fad62db.js",
        "relationship_table_source": "https://bluearchive.wikiru.jp/?SandBox/%E7%B5%86%E3%83%A9%E3%83%B3%E3%82%AF",
    }


def reaction_label(grade: int) -> str:
    return REACTION_LABELS_ZH_CN[grade]


def _record_index(records: dict, label: str) -> dict[int, dict]:
    return {record["Id"]: record for record in records.values()}


def _require_matching_ids(english: dict[int, dict], chinese: dict[int, dict], label: str) -> None:
    english_ids = set(english)
    chinese_ids = set(chinese)
    if english_ids != chinese_ids:
        missing_cn = sorted(english_ids - chinese_ids)
        missing_en = sorted(chinese_ids - english_ids)
        raise ValueError(
            f"{label} locale IDs differ: missing_cn={missing_cn[:10]}, "
            f"missing_en={missing_en[:10]}"
        )


def make_gifts(items_en: dict, items_zh_cn: dict) -> list[dict]:
    items_en_by_id = _record_index(items_en, "items_en")
    items_zh_cn_by_id = _record_index(items_zh_cn, "items_zh_cn")
    _require_matching_ids(items_en_by_id, items_zh_cn_by_id, "items")
    gifts = []
    for item in items_en_by_id.values():
        if item.get("Category") != "Favor":
            continue
        item_zh_cn = items_zh_cn_by_id[item["Id"]]
        gifts.append(
            {
                "id": item["Id"],
                "name_en": item["Name"],
                "name_zh_cn": item_zh_cn["Name"],
                # Backward-compatible alias for older simulator consumers.
                "name_zh": item_zh_cn["Name"],
                "desc_en": item.get("Desc", ""),
                "desc_zh_cn": item_zh_cn.get("Desc", ""),
                "rarity": item["Rarity"],
                "quality": item["Quality"],
                "base_exp": item["ExpValue"],
                "icon": item["Icon"],
                "tags": item.get("Tags", []),
                "is_released": item.get("IsReleased", [False, False, False]),
            }
        )
    return sorted(gifts, key=lambda gift: gift["id"])


def make_student_preferences(
    students_en: dict, students_zh_cn: dict, gifts: list[dict], server: str
) -> list[dict]:
    students_en_by_id = _record_index(students_en, "students_en")
    students_zh_cn_by_id = _record_index(students_zh_cn, "students_zh_cn")
    _require_matching_ids(students_en_by_id, students_zh_cn_by_id, "students")
    region_index = REGION_INDEX[server]
    result = []
    for student in students_en_by_id.values():
        released = student.get("IsReleased", [False, False, False])
        limited_types = student.get("IsLimited", [0, 0, 0])
        jp_limited_type = int(limited_types[REGION_INDEX["jp"]] or 0)
        # Keep the complete SchaleDB student catalog in the snapshot.  CN
        # release state is data on each row, not a generation-time filter;
        # the UI needs unreleased students for gift planning and future
        # package previews while release-state logic decides whether daily
        # schedule/cafe EXP is eligible.
        student_zh_cn = students_zh_cn_by_id[student["Id"]]
        cn_released = bool(released[REGION_INDEX["cn"]])
        student_tags = set(student.get("FavorItemTags") or [])
        unique_tags = set(student.get("FavorItemUniqueTags") or [])
        match_tags = student_tags | unique_tags | set(COMMON_FAVOR_TAGS)
        all_values = []
        preferences = []
        for gift in gifts:
            common_count = sum(tag in COMMON_FAVOR_TAGS for tag in gift["tags"])
            matched_tags = [tag for tag in gift["tags"] if tag in match_tags]
            raw_matches = len(matched_tags)
            capped_matches = min(raw_matches, 3)
            grade = capped_matches + 1
            student_preference = capped_matches - common_count > 0
            universal_gift = common_count > 0 and not any(
                tag not in COMMON_FAVOR_TAGS for tag in matched_tags
            )
            value = {
                "gift_id": gift["id"],
                "reaction_grade": grade,
                "reaction_label_en": REACTION_LABELS_EN[grade],
                "reaction_label_zh_cn": reaction_label(grade),
                # Backward-compatible alias for older simulator consumers.
                "reaction_label_zh": reaction_label(grade),
                "relationship_exp": gift["base_exp"] * (1 + capped_matches),
                "matched_tags": matched_tags,
                "is_student_preference": student_preference,
                "is_universal": universal_gift,
                "is_premium": gift["rarity"] == "SSR",
            }
            all_values.append(value)
            if student_preference:
                preferences.append(value)
        preferences.sort(key=lambda item: item["gift_id"])
        all_values.sort(key=lambda item: item["gift_id"])
        record = {
            "student_id": student["Id"],
            "name_en": student["Name"],
            "name_zh_cn": student_zh_cn["Name"],
            # Backward-compatible alias for older simulator consumers.
            "name_zh": student_zh_cn["Name"],
            "path_name": student.get("PathName"),
            "default_order": student.get("DefaultOrder"),
            "is_released": released,
            "cn_released": cn_released,
            "future_only": not cn_released,
            "release_status": "released" if cn_released else "unreleased",
            "favor_item_tags": sorted(student_tags),
            "favor_item_unique_tags": sorted(unique_tags),
            "favor_alts": student.get("FavorAlts", []),
            "gift_values": all_values,
            "preferred_gifts": preferences,
            "most_favorite_gifts": [
                item["gift_id"] for item in preferences if item["reaction_grade"] == 4
            ],
            "universal_gifts": [
                item["gift_id"] for item in all_values if item["is_universal"]
            ],
            "no_matching_gift_in_source": not preferences,
        }
        if jp_limited_type in {1, 2, 3}:
            record["is_limited"] = limited_types
            if not cn_released:
                record["launch_package_eligibility"] = "limited_or_fes"
        result.append(record)
    return sorted(result, key=lambda student: (student["default_order"] is None, student["default_order"], student["student_id"]))


def make_thresholds() -> list[dict]:
    return [
        {
            "level": level,
            "next_level_exp": next_exp,
            "cumulative_exp_to_reach_level": total_exp,
            "can_advance_in_simulator": level < 100,
        }
        for level, next_exp, total_exp in BOND_TABLE
    ]


def dump_json(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--server", choices=REGION_INDEX, default="cn")
    parser.add_argument("--items-en", default=ITEMS_EN_URL)
    parser.add_argument("--students-en", default=STUDENTS_EN_URL)
    parser.add_argument("--items-zh-cn", default=ITEMS_CN_URL)
    parser.add_argument("--students-zh-cn", default=STUDENTS_CN_URL)
    parser.add_argument("--config", default=CONFIG_URL)
    parser.add_argument("--output-dir", type=Path, default=Path(__file__).parent)
    args = parser.parse_args()

    items_en = read_json(args.items_en)
    students_en = read_json(args.students_en)
    items_zh_cn = read_json(args.items_zh_cn)
    students_zh_cn = read_json(args.students_zh_cn)
    config = read_json(args.config)
    retrieved_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    sources = {
        "items_en": args.items_en,
        "students_en": args.students_en,
        "items_zh_cn": args.items_zh_cn,
        "students_zh_cn": args.students_zh_cn,
    }
    source = source_stamp(config, retrieved_at, sources)
    gifts = make_gifts(items_en, items_zh_cn)
    preferences = make_student_preferences(students_en, students_zh_cn, gifts, args.server)

    dump_json(
        args.output_dir / "gifts.json",
        {
            "schema_version": 2,
            "scope": {
                "server": args.server,
                "language": "bilingual",
                "languages": {"en": "en", "zh_cn": "cn"},
                "student_region_index": REGION_INDEX[args.server],
            },
            "source": source,
            "gift_count": len(gifts),
            "gifts": gifts,
        },
    )
    dump_json(
        args.output_dir / "student_gift_preferences.json",
        {
            "schema_version": 2,
            "scope": {
                "server": args.server,
                "language": "bilingual",
                "languages": {"en": "en", "zh_cn": "cn"},
                "student_region_index": REGION_INDEX[args.server],
                "catalog": "complete_student_catalog",
            },
            "source": source,
            "student_count": len(preferences),
            "cn_released_student_count": sum(1 for student in preferences if student["cn_released"]),
            "common_premium_tags": COMMON_FAVOR_TAGS,
            "reaction_labels_en": {str(k): v for k, v in REACTION_LABELS_EN.items()},
            "reaction_labels_zh_cn": {str(k): v for k, v in REACTION_LABELS_ZH_CN.items()},
            "reaction_labels_zh": {"1": "小", "2": "中", "3": "大", "4": "特大"},
            "students": preferences,
        },
    )
    dump_json(
        args.output_dir / "relationship_thresholds.json",
        {
            "schema_version": 2,
            "scope": {
                "server": args.server,
                "language": "bilingual",
                "languages": {"en": "en", "zh_cn": "cn"},
            },
            "source": source,
            "relationship_level_cap": 100,
            "stat_bonus_level_cap": {"jp": 50, "global": 50, "cn": 50}[args.server],
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
            "levels": make_thresholds(),
        },
    )


if __name__ == "__main__":
    main()

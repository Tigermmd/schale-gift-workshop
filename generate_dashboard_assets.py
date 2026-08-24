#!/usr/bin/env python3
"""Download the SchaleDB images used by the relationship dashboard.

The generated manifest keeps the public source URL beside each local cache path,
so the page can fall back to SchaleDB when a local asset is unavailable.
"""

from __future__ import annotations

import argparse
import json
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen


BASE_URL = "https://schaledb.com"
CRAFTING_URL = "https://schaledb.com/data/crafting.min.json"
USER_AGENT = "BlueArchiveRelationshipDashboard/1.0"
MAX_ASSET_BYTES = 32 * 1024 * 1024
REACTION_ICON_SPECS = [
    (
        f"reaction:{grade}",
        f"./assets/reactions/gift-0{grade}.png",
        f"{BASE_URL}/images/ui/Cafe_Interaction_Gift_0{grade}.png",
    )
    for grade in range(1, 5)
]

# Secondary assets are kept separate from the compact icons already used in
# lists.  The collection portraits are used only in the selected-student
# detail/hero surfaces, so the list view stays fast while the detail view can
# feel like an in-game profile instead of a plain admin card.
UI_ASSET_SPECS = [
    (
        "ui:schaledb-logo",
        "./assets/ui/schaledb-logo.svg",
        f"{BASE_URL}/images/logo_schaledb.svg",
    ),
    (
        "ui:schaledb-logo-small",
        "./assets/ui/schaledb-logo-small.svg",
        f"{BASE_URL}/images/logo_small.svg",
    ),
    (
        "ui:craft-node-border",
        "./assets/ui/craft-node-border.png",
        f"{BASE_URL}/images/craftnode/Node_Border.png",
    ),
    (
        "ui:momotalk",
        "./assets/ui/momotalk.png",
        f"{BASE_URL}/images/ui/Icon_MomoTalk.png",
    ),
    (
        "ui:momotalk-compact",
        "./assets/ui/momotalk-compact.png",
        f"{BASE_URL}/images/ui/Icon_MomoTalk2.png",
    ),
    (
        "ui:schedule-favor",
        "./assets/ui/schedule-favor.png",
        f"{BASE_URL}/images/ui/School_Icon_Schedule_Favor.png",
    ),
    (
        "ui:momotalk-font",
        "./assets/ui/momotalk-font.png",
        f"{BASE_URL}/images/ui/ImgFont_Momotalk.png",
    ),
    (
        "ui:schaledb-error",
        "./assets/ui/schaledb-error.png",
        f"{BASE_URL}/images/ui/arona_error.png",
    ),
    (
        "ui:schaledb-gdd-full",
        "./assets/ui/schaledb-gdd-full.png",
        "https://schaledb.com/images/ui/pixel/GDD_Full.png",
    ),
    (
        "ui:schaledb-gdd-logo",
        "./assets/ui/schaledb-gdd-logo.png",
        "https://schaledb.com/images/ui/pixel/GDD_Logo.png",
    ),
    (
        "ui:schaledb-logo-dark",
        "./assets/ui/schaledb-logo-dark.png",
        "https://schaledb.com/logo-dark.png",
    ),
    # SchaleDB's native rarity tiles keep gift cards recognizable without
    # adding another large illustration or inventing a new visual language.
    (
        "ui:schaledb-rarity-n",
        "./assets/ui/pixel/BG_N.png",
        "https://schaledb.com/images/ui/pixel/BG_N.png",
    ),
    (
        "ui:schaledb-rarity-r",
        "./assets/ui/pixel/BG_R.png",
        "https://schaledb.com/images/ui/pixel/BG_R.png",
    ),
    (
        "ui:schaledb-rarity-sr",
        "./assets/ui/pixel/BG_SR.png",
        "https://schaledb.com/images/ui/pixel/BG_SR.png",
    ),
    (
        "ui:schaledb-rarity-ssr",
        "./assets/ui/pixel/BG_SSR.png",
        "https://schaledb.com/images/ui/pixel/BG_SSR.png",
    ),
    (
        "ui:schaledb-type-tile",
        "./assets/ui/pixel/Background_Type.png",
        "https://schaledb.com/images/ui/pixel/Background_Type.png",
    ),
    # Pixel backgrounds from SchaleDB.  These are used as low-opacity page
    # textures and section markers, so the data remains the visual focus.
    (
        "ui:schaledb-pixel-skill-normal",
        "./assets/ui/pixel/Background_Skill_Normal.png",
        "https://schaledb.com/images/ui/pixel/Background_Skill_Normal.png",
    ),
    (
        "ui:schaledb-pixel-skill-explosion",
        "./assets/ui/pixel/Background_Skill_Explosion.png",
        "https://schaledb.com/images/ui/pixel/Background_Skill_Explosion.png",
    ),
    (
        "ui:schaledb-pixel-skill-pierce",
        "./assets/ui/pixel/Background_Skill_Pierce.png",
        "https://schaledb.com/images/ui/pixel/Background_Skill_Pierce.png",
    ),
    (
        "ui:schaledb-pixel-skill-mystic",
        "./assets/ui/pixel/Background_Skill_Mystic.png",
        "https://schaledb.com/images/ui/pixel/Background_Skill_Mystic.png",
    ),
    (
        "ui:schaledb-pixel-skill-sonic",
        "./assets/ui/pixel/Background_Skill_Sonic.png",
        "https://schaledb.com/images/ui/pixel/Background_Skill_Sonic.png",
    ),
    (
        "ui:schaledb-pixel-skill-chemical",
        "./assets/ui/pixel/Background_Skill_Chemical.png",
        "https://schaledb.com/images/ui/pixel/Background_Skill_Chemical.png",
    ),
    (
        "ui:schaledb-pixel-slider",
        "./assets/ui/pixel/slider.png",
        "https://schaledb.com/images/ui/pixel/slider.png",
    ),
    (
        "ui:schaledb-enemy-elite",
        "./assets/ui/Common_Icon_Enemy_Elite.png",
        "https://schaledb.com/images/ui/Common_Icon_Enemy_Elite.png",
    ),
    (
        "ui:schaledb-enemy-champion",
        "./assets/ui/Common_Icon_Enemy_Champion.png",
        "https://schaledb.com/images/ui/Common_Icon_Enemy_Champion.png",
    ),
]

# Official SchaleDB stage illustrations give each workspace a small sense of
# place.  Each area has a second, alternate crop that can be used as a
# low-contrast texture without making the page repeat the same banner.
STAGE_ART_SPECS = [
    spec
    for area in range(1, 7)
    for variant, label in ((0, "normal"), (1, "alternate"))
    for spec in [
        (
            f"ui:stage-mission-{area}-{label}",
            f"./assets/ui/stages/mission_{area}_{variant}.webp",
            f"{BASE_URL}/images/stage/mission_{area}_{variant}.webp",
        )
    ]
]

# Small event-scene illustrations from SchaleDB.  They are intentionally
# cached as a separate family: these are atmosphere, not data-bearing
# student or gift images.  Each workspace can use a different trio so the
# dashboard does not feel like the same stage screenshot repeated everywhere.
EVENT_ART_IDS = (701, 801, 802, 805, 808, 812, 818, 824, 828, 834, 839, 844)
EVENT_ART_SPECS = [
    (
        f"ui:event-scene-{event_id}",
        f"./assets/ui/events/event_{event_id}.webp",
        f"{BASE_URL}/images/stage/event_{event_id}.webp",
    )
    for event_id in EVENT_ART_IDS
]

# Non-gift items that appear in inventory, periodic resources and package
# contents.  Keeping their native icons next to the gift cache makes those
# sections readable without inventing glyphs for stones and boxes.
ITEM_ASSET_SPECS = [
    (
        f"item:{item_id}",
        f"./assets/items/{item_id}.webp",
        f"{BASE_URL}/images/item/icon/{icon}.webp",
    )
    for item_id, icon in (
        (1, "item_icon_craftitem_0"),
        (3, "item_icon_craftitem_1"),
        (80, "item_icon_shiftingcraftitem_0"),
        (81, "item_icon_shiftingcraftitem_1"),
        (82, "item_icon_shiftingcraftitem_2"),
        (83, "item_icon_shiftingcraftitem_3"),
        (90, "item_icon_craft_material_0"),
        (100000, "item_icon_favor_random"),
        (100008, "item_icon_favor_selection"),
        (100009, "item_icon_favor_random_lv2"),
    )
]

# Future-planning entries are not part of the released-student preference
# snapshot, but their portraits are still useful when the planner is opened
# for a not-yet-released student.
EXTRA_PORTRAIT_STUDENT_IDS = (10122,)
EXTRA_COLLECTION_STUDENT_IDS = (10122,)


def _is_allowed_remote(url: str) -> bool:
    parsed = urlparse(url)
    return parsed.scheme == "https" and parsed.netloc == "schaledb.com"


def _read_limited(response, limit: int = MAX_ASSET_BYTES) -> bytes:
    length = response.headers.get("Content-Length")
    if length and int(length) > limit:
        raise ValueError("remote asset is too large")
    payload = response.read(limit + 1)
    if len(payload) > limit:
        raise ValueError("remote asset is too large")
    return payload


def read_json(path: Path | str) -> dict:
    if str(path).startswith("http"):
        if not _is_allowed_remote(str(path)):
            raise ValueError("remote JSON source is not allowed")
        request = Request(str(path), headers={"User-Agent": USER_AGENT})
        with urlopen(request, timeout=15) as response:
            return json.loads(_read_limited(response).decode("utf-8"))
    return json.loads(Path(path).read_text(encoding="utf-8"))


def download(url: str, destination: Path) -> bool:
    if not _is_allowed_remote(url):
        return False
    if destination.is_file() and destination.stat().st_size > 0:
        return True
    try:
        request = Request(url, headers={"User-Agent": USER_AGENT})
        with urlopen(request, timeout=15) as response:
            content_type = response.headers.get_content_type()
            payload = _read_limited(response)
        if not payload or content_type == "text/html":
            return False
        destination.parent.mkdir(parents=True, exist_ok=True)
        temporary = destination.with_suffix(destination.suffix + ".tmp")
        temporary.write_bytes(payload)
        os.replace(str(temporary), str(destination))
        return True
    except (HTTPError, URLError, TimeoutError, OSError, ValueError):
        return False


def download_asset(
    output_dir: Path,
    key: str,
    local_relative: str,
    remote: str,
) -> tuple[str, dict]:
    local_path = output_dir / local_relative.removeprefix("./")
    downloaded = download(remote, local_path)
    return key, {
        "local": local_relative,
        "remote": remote,
        "downloaded": downloaded,
        "bytes": local_path.stat().st_size if local_path.is_file() else 0,
    }


def build_manifest(data_dir: Path, output_dir: Path) -> dict:
    gifts = read_json(data_dir / "gifts.json")["gifts"]
    students = read_json(data_dir / "student_gift_preferences.json")["students"]
    crafting = read_json(CRAFTING_URL)
    specs: list[tuple[str, str, str]] = []

    for gift in gifts:
        specs.append(
            (
                f"gift:{gift['id']}",
                f"./assets/gifts/{gift['id']}.webp",
                f"{BASE_URL}/images/item/icon/{gift['icon']}.webp",
            )
        )
    for student in students:
        specs.append(
            (
                f"student:{student['student_id']}",
                f"./assets/students/{student['student_id']}.webp",
                f"{BASE_URL}/images/student/icon/{student['student_id']}.webp",
            )
        )
        specs.append(
            (
                f"student-collection:{student['student_id']}",
                f"./assets/students/collection/{student['student_id']}.webp",
                f"{BASE_URL}/images/student/collection/{student['student_id']}.webp",
            )
        )
        specs.append(
            (
                f"student-portrait:{student['student_id']}",
                f"./assets/students/portrait/{student['student_id']}.webp",
                f"{BASE_URL}/images/student/portrait/{student['student_id']}.webp",
            )
        )
    known_student_ids = {int(student["student_id"]) for student in students}
    for student_id in EXTRA_PORTRAIT_STUDENT_IDS:
        if student_id in known_student_ids:
            continue
        specs.append(
            (
                f"student-portrait:{student_id}",
                f"./assets/students/portrait/{student_id}.webp",
                f"{BASE_URL}/images/student/portrait/{student_id}.webp",
            )
        )
    for student_id in EXTRA_COLLECTION_STUDENT_IDS:
        if student_id in known_student_ids:
            continue
        specs.append(
            (
                f"student-collection:{student_id}",
                f"./assets/students/collection/{student_id}.webp",
                f"{BASE_URL}/images/student/collection/{student_id}.webp",
            )
        )
    for node in crafting.get("Nodes", []):
        icon = node.get("Icon")
        if not icon:
            continue
        specs.append(
            (
                f"node:{node['Id']}",
                f"./assets/nodes/{node['Id']}.png",
                f"{BASE_URL}/images/craftnode/{icon}.png",
            )
        )
    specs.extend(REACTION_ICON_SPECS)
    specs.extend(UI_ASSET_SPECS)
    specs.extend(STAGE_ART_SPECS)
    specs.extend(EVENT_ART_SPECS)
    specs.extend(ITEM_ASSET_SPECS)

    with ThreadPoolExecutor(max_workers=12) as executor:
        entries = dict(
            executor.map(
                lambda spec: download_asset(output_dir, *spec),
                specs,
            )
        )

    return {
        "schema_version": 1,
        "source": {
            "image_base": BASE_URL,
            "crafting_source": CRAFTING_URL,
            "retrieved_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        },
        "entries": entries,
        "counts": {
            "gifts": len(gifts),
            "students": len(students),
            "student_collection_portraits": len(students) + sum(1 for student_id in EXTRA_COLLECTION_STUDENT_IDS if student_id not in known_student_ids),
            "student_portraits": len(students) + sum(1 for student_id in EXTRA_PORTRAIT_STUDENT_IDS if student_id not in known_student_ids),
            "crafting_nodes": len(crafting.get("Nodes", [])),
            "reaction_icons": len(REACTION_ICON_SPECS),
            "ui_assets": len(UI_ASSET_SPECS),
            "event_art": len(EVENT_ART_SPECS),
            "item_assets": len(ITEM_ASSET_SPECS),
            "downloaded": sum(1 for entry in entries.values() if entry["downloaded"]),
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", type=Path, default=Path(__file__).parent / "relationship_data")
    parser.add_argument("--output-dir", type=Path, default=Path(__file__).parent)
    args = parser.parse_args()
    manifest = build_manifest(args.data_dir, args.output_dir)
    manifest_path = args.output_dir / "assets" / "manifest.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest["counts"], ensure_ascii=False))


if __name__ == "__main__":
    main()

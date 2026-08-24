"""Pure helpers for generating and validating versioned game-data snapshots."""

from __future__ import annotations

import copy


VOLATILE_KEYS = {"retrieved_at", "schaledb_build", "generatedAt", "checkedAt", "asOf"}


def _without_volatile(value):
    if isinstance(value, dict):
        return {
            key: _without_volatile(item)
            for key, item in value.items()
            if key not in VOLATILE_KEYS
        }
    if isinstance(value, list):
        return [_without_volatile(item) for item in value]
    return copy.deepcopy(value)


def semantic_equal(left, right):
    return _without_volatile(left) == _without_volatile(right)


def build_release_timeline(students_jp, as_of):
    students = list(students_jp.values())
    students.sort(
        key=lambda student: (
            student.get("DefaultOrder") is None,
            student.get("DefaultOrder") if student.get("DefaultOrder") is not None else 10**9,
            int(student["Id"]),
        )
    )
    return {
        "schemaVersion": 1,
        "server": "jp",
        "asOf": as_of,
        "source": "SchaleDB JP students.min.json",
        "sourceUrl": "https://schaledb.com/data/jp/students.min.json",
        "note": "日服 DefaultOrder 快照；同一学生 ID 跨服务器使用。官方公告补充/核验日期后可扩展 releaseDate 与 sources。",
        "students": [
            {
                "studentId": int(student["Id"]),
                "jpRank": rank,
                "name_ja": student.get("Name") or "",
            }
            for rank, student in enumerate(students, start=1)
        ],
    }


def _ids(rows, key):
    values = [int(row[key]) for row in rows]
    if len(values) != len(set(values)):
        raise ValueError(f"duplicate {key} values in generated snapshot")
    return set(values)


def validate_generated_snapshots(generated, current):
    students = generated["students"]["students"]
    gifts = generated["gifts"]["gifts"]
    student_ids = _ids(students, "student_id")
    gift_ids = _ids(gifts, "id")
    current_student_ids = _ids(current["students"]["students"], "student_id")
    current_gift_ids = _ids(current["gifts"]["gifts"], "id")
    missing_students = sorted(current_student_ids - student_ids)
    missing_gifts = sorted(current_gift_ids - gift_ids)
    if missing_students:
        raise ValueError(f"student IDs disappeared: {missing_students[:20]}")
    if missing_gifts:
        raise ValueError(f"gift IDs disappeared: {missing_gifts[:20]}")

    for student in students:
        values = _ids(student.get("gift_values", []), "gift_id")
        if values != gift_ids:
            raise ValueError(f"student {student['student_id']} has incomplete gift values")

    crafting_ids = _ids(generated["crafting"]["students"], "student_id")
    timeline_ids = _ids(generated["timeline"]["students"], "studentId")
    localization_student_ids = {int(value) for value in generated["localization"]["students"]}
    localization_gift_ids = {int(value) for value in generated["localization"]["gifts"]}
    if crafting_ids != student_ids:
        raise ValueError("crafting student IDs do not match the student snapshot")
    if timeline_ids != student_ids:
        raise ValueError("release timeline IDs do not match the student snapshot")
    if localization_student_ids != student_ids:
        raise ValueError("localized student IDs do not match the student snapshot")
    if localization_gift_ids != gift_ids:
        raise ValueError("localized gift IDs do not match the gift snapshot")

    released_count = sum(bool(student.get("cn_released")) for student in students)
    current_released_count = sum(
        bool(student.get("cn_released")) for student in current["students"]["students"]
    )
    if released_count < current_released_count:
        raise ValueError("CN released-student count decreased")

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from generate_dashboard_assets import download
from relationship_data.generate_relationship_data import make_student_preferences
from scripts.package_updates import discover_package_candidates, parse_package_notice
from scripts.update_data import (
    build_release_timeline,
    semantic_equal,
    validate_generated_snapshots,
)


PACKAGE_NOTICE = {
    "id": 2001,
    "title": "【预告】全新礼包上架",
    "publishTime": 1787137368000,
    "content": """
      <p>一、限定学生礼物礼包</p>
      <p>■ 礼包内容</p>
      <p>• 指定学生的最喜欢紫礼物 × 6</p>
      <p>• 指定学生的最喜欢金礼物 × 10</p>
      <p>• 美丽花束 × 2</p>
      <p>■ 可购买时间</p>
      <p>2026年08月20日维护结束后 ~ 09月03日 13:59</p>
      <p>■ 价格</p>
      <p>98元（限购3次）</p>
      <p>二、装备设计图礼包</p>
      <p>■ 礼包内容</p>
      <p>• T9装备设计图选择券 × 30</p>
      <p>■ 价格</p>
      <p>156元（限购1次）</p>
    """,
}


class DataUpdaterTests(unittest.TestCase):
    def test_asset_downloader_rejects_non_schaledb_sources(self):
        with TemporaryDirectory() as directory:
            destination = Path(directory) / "asset.bin"
            self.assertFalse(download(Path("/etc/hosts").as_uri(), destination))
            self.assertFalse(destination.exists())

    def test_future_limited_student_gets_launch_package_metadata(self):
        base = {
            "Id": 100,
            "Name": "Future",
            "PathName": "future",
            "DefaultOrder": 1,
            "IsReleased": [True, True, False],
            "IsLimited": [3, 3, 3],
            "FavorItemTags": [],
            "FavorItemUniqueTags": [],
        }
        permanent = dict(base, Id=200, Name="Permanent", IsLimited=[4, 4, 0])
        en = {"100": base, "200": permanent}
        cn = {
            "100": dict(base, Name="未来限定"),
            "200": dict(permanent, Name="未来常驻"),
        }
        rows = make_student_preferences(en, cn, [], "cn")
        limited = next(row for row in rows if row["student_id"] == 100)
        normal = next(row for row in rows if row["student_id"] == 200)
        self.assertEqual(limited["launch_package_eligibility"], "limited_or_fes")
        self.assertEqual(limited["is_limited"], [3, 3, 3])
        self.assertNotIn("launch_package_eligibility", normal)
        self.assertNotIn("is_limited", normal)

    def test_package_notice_parser_keeps_structured_relevant_package(self):
        notice = parse_package_notice(PACKAGE_NOTICE)
        self.assertEqual(notice["noticeId"], 2001)
        self.assertEqual(len(notice["packages"]), 2)
        package = notice["packages"][0]
        self.assertEqual(package["nameZhCn"], "限定学生礼物礼包")
        self.assertEqual(package["priceCny"], 98)
        self.assertEqual(package["purchaseLimit"], 3)
        self.assertEqual(package["contentsText"][-1], "美丽花束 × 2")
        self.assertTrue(package["relevantToGiftWorkshop"])
        self.assertEqual(package["parseConfidence"], "high")
        self.assertFalse(notice["packages"][1]["relevantToGiftWorkshop"])

    def test_package_discovery_only_returns_new_relevant_notices(self):
        old = dict(PACKAGE_NOTICE, id=2000)
        candidates = discover_package_candidates(
            [old, PACKAGE_NOTICE],
            catalog_sources={"https://bluearchive-cn.com/news/2000"},
        )
        self.assertEqual([item["noticeId"] for item in candidates], [2001])
        self.assertEqual(len(candidates[0]["packages"]), 1)

    def test_release_timeline_uses_default_order_and_complete_ids(self):
        timeline = build_release_timeline(
            {
                "20": {"Id": 20, "DefaultOrder": 1, "Name": "二"},
                "10": {"Id": 10, "DefaultOrder": 0, "Name": "一"},
                "30": {"Id": 30, "DefaultOrder": None, "Name": "三"},
            },
            as_of="2026-08-24",
        )
        self.assertEqual([row["studentId"] for row in timeline["students"]], [10, 20, 30])
        self.assertEqual([row["jpRank"] for row in timeline["students"]], [1, 2, 3])
        self.assertEqual(timeline["asOf"], "2026-08-24")

    def test_semantic_compare_ignores_only_refresh_metadata(self):
        old = {"asOf": "old", "source": {"retrieved_at": "old", "schaledb_build": 1}, "students": [{"id": 1}]}
        new = {"asOf": "new", "source": {"retrieved_at": "new", "schaledb_build": 2}, "students": [{"id": 1}]}
        changed = {"source": {"retrieved_at": "new", "schaledb_build": 2}, "students": [{"id": 2}]}
        self.assertTrue(semantic_equal(old, new))
        self.assertFalse(semantic_equal(old, changed))

    def test_snapshot_validation_rejects_student_loss(self):
        current = {
            "students": {"students": [{"student_id": 1}, {"student_id": 2}]},
            "gifts": {"gifts": [{"id": 5000}]},
        }
        generated = {
            "students": {"students": [{"student_id": 1, "gift_values": [{"gift_id": 5000}]}]},
            "gifts": {"gifts": [{"id": 5000}]},
            "crafting": {"students": [{"student_id": 1}]},
            "localization": {"students": {"1": "一"}, "gifts": {"5000": "礼物"}},
            "timeline": {"students": [{"studentId": 1, "jpRank": 1}]},
        }
        with self.assertRaisesRegex(ValueError, "student IDs disappeared"):
            validate_generated_snapshots(generated, current)


if __name__ == "__main__":
    unittest.main()

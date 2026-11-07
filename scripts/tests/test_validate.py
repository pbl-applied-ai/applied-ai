"""validate.py·migrate_v01_v02.py 테스트 (스키마 v0.2, KAN-9 / #3 A~H).

python -m unittest discover -s scripts/tests -v
fixture는 직접 만든 가짜 데이터(Smpl0Gochu1)다.
"""

from __future__ import annotations

import copy
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import migrate_v01_v02 as migrate  # noqa: E402
import validate  # noqa: E402

FIX = Path(__file__).resolve().parent / "fixtures" / "validate" / "Smpl0Gochu1"


def fixture(name: str) -> dict:
    return validate.load(FIX / f"{name}.json")


class Base(unittest.TestCase):
    def setUp(self):
        self.bundle = fixture("bundle")
        self.recipe = fixture("recipe")
        self.user = fixture("user_recipe")

    def errors(self, bundle=None, recipe=None, user=None):
        return validate.check_case(bundle or self.bundle, recipe, user, "t")

    def assertPasses(self, **kw):
        self.assertEqual(self.errors(**kw), [])

    def assertFails(self, pattern: str = "", **kw):
        errors = self.errors(**kw)
        self.assertTrue(errors, "오류가 나야 함")
        if pattern:
            self.assertTrue(any(pattern in e for e in errors), errors)


class FixtureTest(Base):
    def test_fixture_passes(self):
        self.assertPasses(recipe=self.recipe, user=self.user)


class ItemIdTest(Base):  # A
    def test_id_required(self):
        del self.recipe["ingredients"][0]["id"]
        self.assertFails("id", recipe=self.recipe)
        r = fixture("recipe")
        del r["steps"][0]["id"]
        self.assertFails("id", recipe=r)

    def test_id_format(self):
        for bad in ("ing-a", "ing-0", "ing-user-1", "step-1", "ing-01"):
            r = copy.deepcopy(self.recipe)
            r["ingredients"][0]["id"] = bad
            self.assertFails(recipe=r)
        r = copy.deepcopy(self.recipe)
        r["steps"][0]["id"] = "step-user-1"
        self.assertFails(recipe=r)

    def test_id_unique_in_recipe(self):
        self.recipe["ingredients"][1]["id"] = "ing-1"
        self.assertFails("중복", recipe=self.recipe)
        r = fixture("recipe")
        r["steps"][1]["id"] = "step-1"
        self.assertFails("중복", recipe=r)

    def test_user_ids_allowed_only_in_user_recipe(self):
        self.assertPasses(user=self.user)  # ing-user-1, step-user-1
        self.user["ingredients"][2]["id"] = "ing-1"
        self.assertFails("중복", user=self.user)


class UserRecipeTest(Base):  # B
    def test_run_id_uuid(self):
        u = copy.deepcopy(self.user)
        del u["run_id"]
        self.assertFails("run_id", user=u)
        self.user["run_id"] = "not-a-uuid"
        self.assertFails("run_id", user=self.user)

    def test_amount_needs_confirmed_or_user_entered(self):
        ing = self.user["ingredients"][1]
        ing["user_entered"] = False  # 분량이 있는데 unconfirmed + 사용자 입력 아님
        self.assertFails(user=self.user)
        ing["user_entered"] = True
        self.assertPasses(user=self.user)

    def test_confirmed_needs_amount(self):
        self.user["ingredients"][0]["amount_raw"] = None
        self.assertFails(user=self.user)

    def test_edited_and_user_entered_required(self):
        for key in ("edited", "user_entered"):
            u = copy.deepcopy(self.user)
            del u["ingredients"][0][key]
            self.assertFails(key, user=u)
            u = copy.deepcopy(self.user)
            del u["steps"][0][key]
            self.assertFails(key, user=u)

    def test_recipe_has_no_user_fields(self):
        for key in ("edited", "user_entered"):
            r = copy.deepcopy(self.recipe)
            r["ingredients"][0][key] = False
            self.assertFails(recipe=r)

    def test_video_id_matches_bundle(self):
        self.user["video_id"] = "Other0Video"
        self.assertFails("video_id", user=self.user)


class SegmentTest(Base):  # C, D
    def test_comment_segment(self):
        self.assertPasses()
        self.bundle["segments"][2]["id"] = "desc-1"
        self.assertFails("comment-N", bundle=self.bundle)

    def test_unknown_type(self):
        self.bundle["segments"][3]["type"] = "caption"
        self.assertFails(bundle=self.bundle)

    def test_timed_types_need_times(self):
        del self.bundle["segments"][3]["start_ms"]
        self.assertFails("start_ms", bundle=self.bundle)

    def test_untimed_types_have_no_times(self):
        for i in (0, 1, 2):  # title, description, comment
            b = fixture("bundle")
            b["segments"][i]["start_ms"] = 0
            self.assertFails(bundle=b)


class PartialTest(Base):  # E
    def test_partial_one_side_empty(self):
        self.recipe["partial"] = True
        self.recipe["steps"] = []
        self.assertPasses(recipe=self.recipe)
        r = fixture("recipe")
        r["partial"] = True
        r["ingredients"] = []
        self.assertPasses(recipe=r)

    def test_partial_both_empty(self):
        self.recipe.update(partial=True, ingredients=[], steps=[])
        self.assertFails(recipe=self.recipe)

    def test_not_partial_needs_both(self):
        self.recipe["steps"] = []
        self.assertFails(recipe=self.recipe)
        r = fixture("recipe")
        r.update(partial=False, ingredients=[])
        self.assertFails(recipe=r)


class RunTest(Base):  # G
    def test_stage_keys(self):
        self.bundle["run"]["stages"]["merge"] = {"tool": "x", "version": "0"}
        self.assertFails("merge", bundle=self.bundle)

    def test_collect_stage_allowed(self):
        # #40(Instagram 수집기)이 쓰는 키. #3 G 목록에 더한다.
        self.bundle["run"]["stages"]["collect"] = {"tool": "apify", "version": "api"}
        self.assertPasses()

    def test_media_sha256(self):
        self.bundle["source"]["media_sha256"] = "a" * 64
        self.assertPasses()
        self.bundle["source"]["media_sha256"] = "A" * 64
        self.assertFails("media_sha256", bundle=self.bundle)


class VersionTest(Base):  # H
    def test_only_02(self):
        for name in ("bundle", "recipe", "user"):
            b, r, u = fixture("bundle"), fixture("recipe"), fixture("user_recipe")
            {"bundle": b, "recipe": r, "user": u}[name]["schema_version"] = "0.1"
            self.assertFails("schema_version", bundle=b, recipe=r, user=u)


def to_v01(recipe: dict) -> dict:
    old = copy.deepcopy(recipe)
    old["schema_version"] = "0.1"
    old.pop("partial", None)
    for item in old["ingredients"] + old["steps"]:
        item.pop("id")
    return old


class MigrateTest(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.dir)
        bundle = fixture("bundle")
        bundle["schema_version"] = "0.1"
        self.write("bundle.json", bundle)
        self.write("recipe.json", to_v01(fixture("recipe")))

    def write(self, name, data):
        (self.dir / name).write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")

    def read(self, name):
        return validate.load(self.dir / name)

    def test_adds_ids_and_version_only(self):
        changed = migrate.migrate_dir(self.dir)
        self.assertEqual(sorted(p.name for p in changed), ["bundle.json", "recipe.json"])
        self.assertEqual(self.read("recipe.json"), fixture("recipe"))
        self.assertEqual(self.read("bundle.json"), fixture("bundle"))
        self.assertEqual(validate.check_dir(self.dir), [])

    def test_ids_follow_array_order(self):
        recipe = self.read("recipe.json")
        recipe["steps"].reverse()
        self.write("recipe.json", recipe)
        migrate.migrate_dir(self.dir)
        self.assertEqual([s["id"] for s in self.read("recipe.json")["steps"]], ["step-1", "step-2"])

    def test_partial_run_marked(self):
        recipe = self.read("recipe.json")
        recipe["steps"] = []
        self.write("recipe.json", recipe)
        migrate.migrate_dir(self.dir)
        out = self.read("recipe.json")
        self.assertIs(out["partial"], True)
        self.assertEqual(validate.check_dir(self.dir), [])

    def test_idempotent(self):
        migrate.migrate_dir(self.dir)
        first = (self.dir / "recipe.json").read_bytes()
        self.assertEqual(migrate.migrate_dir(self.dir), [])
        self.assertEqual((self.dir / "recipe.json").read_bytes(), first)

    def test_unknown_version_stops(self):
        recipe = self.read("recipe.json")
        recipe["schema_version"] = "0.9"
        self.write("recipe.json", recipe)
        with self.assertRaises(migrate.MigrationError):
            migrate.migrate_dir(self.dir)

    def test_keeps_formatting(self):
        one_line = '{ "name": "고추장", "amount_raw": null, "amount_status": "unconfirmed", "evidence": [] }'
        text = (
            '{\n  "schema_version": "0.1",\n  "video_id": "Smpl0Gochu1",\n  "title": "덮밥",\n'
            f'  "ingredients": [\n    {one_line}\n  ],\n'
            '  "steps": [\n    {\n      "order": 1,\n      "text": "볶는다",\n      "evidence": []\n    }\n  ]\n}\n'
        )
        (self.dir / "recipe.json").write_text(text, encoding="utf-8")
        migrate.migrate_dir(self.dir)
        out = (self.dir / "recipe.json").read_text(encoding="utf-8")
        self.assertIn('    { "id": "ing-1", "name": "고추장"', out)
        self.assertIn('    {\n      "id": "step-1",\n      "order": 1,', out)
        self.assertIn('"schema_version": "0.2"', out)
        self.assertEqual(len(out.splitlines()), len(text.splitlines()) + 1)  # 단계 id 한 줄만 늘어난다

    def test_cli(self):
        self.assertEqual(migrate.main([str(self.dir)]), 0)
        self.assertEqual(self.read("recipe.json")["schema_version"], "0.2")


if __name__ == "__main__":
    unittest.main()

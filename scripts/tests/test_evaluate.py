"""scripts/evaluate.py 테스트. fixture는 직접 만든 가짜 데이터(Smpl0…)만 쓴다.

실행: python -m unittest discover -s scripts/tests -v
"""

from __future__ import annotations

import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import evaluate  # noqa: E402

FIX = Path(__file__).resolve().parent / "fixtures" / "eval"
SYN = evaluate.load_synonyms(evaluate.DEFAULT_SYNONYMS)


def ing(name, amount=None, ev=(), name_raw=None, **extra):
    item = {
        "name": name,
        "amount_raw": amount,
        "amount_status": "confirmed" if amount else "unconfirmed",
        "evidence": list(ev),
        **extra,
    }
    if name_raw:
        item["name_raw"] = name_raw
    return item


def case(name):
    d = FIX / "gold" / name
    return {"bundle": evaluate.load(d / "bundle.json"), "recipe": evaluate.load(d / "recipe.json")}


def pred_case(name, bundle=True):
    d = FIX / "pred" / name
    return {
        "recipe": evaluate.load(d / "recipe.json"),
        "bundle": evaluate.load(d / "bundle.json") if bundle and (d / "bundle.json").exists() else None,
    }


class MatchTest(unittest.TestCase):
    def test_normalize_spaces_and_parens(self):
        self.assertEqual(evaluate.norm_name(" 고추장 (매운맛) "), evaluate.norm_name("고추장"))
        self.assertEqual(evaluate.norm_name("다진 마늘"), evaluate.norm_name("다진마늘"))

    def test_one_to_one_with_duplicates(self):
        self.assertEqual(evaluate.match_ingredients([ing("밥"), ing("밥")], [ing("밥")], SYN), [(0, 0)])

    def test_synonym(self):
        self.assertEqual(evaluate.match_ingredients([ing("식용유")], [ing("기름")], SYN), [(0, 0)])

    def test_name_raw_fallback(self):
        gold = [ing("식용유", name_raw="카놀라유")]
        self.assertEqual(evaluate.match_ingredients(gold, [ing("카놀라유")], SYN), [(0, 0)])

    def test_synonym_does_not_steal_later_exact_match(self):
        # gold 순서대로 모든 단계를 돌면 "파"가 동의어로 pred "대파"를 먼저 가져간다.
        # 정확 일치를 모든 gold에 먼저 돌려야 gold[1] "대파"가 짝을 얻는다.
        gold = [ing("파"), ing("대파")]
        self.assertEqual(evaluate.match_ingredients(gold, [ing("대파")], SYN), [(1, 0)])

    def test_item_ids_ignored(self):
        # v0.2 항목 ID가 있어도 이름으로 맞춘다.
        self.assertEqual(evaluate.match_ingredients([ing("밥", id="ing-1")], [ing("밥", id="ing-2")], SYN), [(0, 0)])


class CaseScoreTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.c = evaluate.evaluate_case(case("Smpl0Gochu1"), pred_case("Smpl0Gochu1"), SYN)

    def test_recall_precision(self):
        c = self.c
        self.assertEqual((c["gold_ings"], c["gold_evidenced"], c["pred_ings"]), (5, 4, 4))
        self.assertEqual((c["matched"], c["matched_evidenced"]), (3, 3))
        self.assertEqual(c["gold_unevidenced"], 1)
        self.assertEqual(c["unmatched_gold"], ["밥", "깨"])
        self.assertEqual(c["unmatched_pred"], ["기름"])

    def test_amount(self):
        c = self.c
        self.assertEqual((c["amount_gold_confirmed"], c["amount_pairs"]), (3, 2))
        self.assertEqual((c["amount_exact"], c["amount_norm"]), (1, 2))

    def test_amount_unit_not_converted(self):
        gold = {"bundle": {"segments": [{"id": "asr-0", "type": "asr", "start_ms": 0, "end_ms": 1, "text": "간장 1큰술"}]},
                "recipe": {"ingredients": [ing("간장", "1큰술", ["asr-0"])], "steps": []}}
        pred = {"bundle": None, "recipe": {"ingredients": [ing("간장", "1T", ["asr-0"])], "steps": []}}
        c = evaluate.evaluate_case(gold, pred, SYN)
        self.assertEqual((c["amount_pairs"], c["amount_norm"]), (1, 0))

    def test_status_table(self):
        c = self.c
        self.assertEqual((c["status_pairs"], c["status_agree"]), (3, 2))
        self.assertEqual(c["status_table"], {"confirmed>confirmed": 2, "unconfirmed>confirmed": 1})

    def test_fabricated_split_by_pred_source(self):
        self.assertEqual(self.c["fabricated"], 1)
        self.assertEqual(self.c["fabricated_by_source"], {"고정 댓글": 1})

    def test_unverified_amounts_listed(self):
        c = self.c
        self.assertEqual(c["unverified"], 1)
        self.assertEqual(c["unverified_list"][0]["name"], "기름")
        self.assertEqual(c["unverified_list"][0]["amount_raw"], "1큰술")

    def test_evidence_totals(self):
        c = self.c
        self.assertEqual((c["ev_pred_segs"], c["ev_pred_correct"]), (3, 1))
        self.assertEqual((c["ev_gold_segs"], c["ev_gold_covered"]), (5, 1))
        self.assertEqual(c["ev_pred_timed"], 1)

    def test_steps(self):
        c = self.c
        self.assertEqual((c["gold_steps"], c["pred_steps"], c["steps_missing"]), (3, 2, 1))

    def test_sources(self):
        c = self.c
        self.assertEqual(c["gold_confirmed"], 3)
        self.assertEqual(c["gold_unconfirmed"], 2)
        self.assertEqual(c["source_estimated"], 0)
        self.assertEqual(c["sources"]["설명"], {"with": 3, "sole": 1, "correct": 2, "sole_correct": 0})
        self.assertEqual(c["sources"]["말소리"], {"with": 2, "sole": 0, "correct": 2, "sole_correct": 0})

    def test_schema_pass(self):
        self.assertEqual((self.c["schema_pass"], self.c["schema_errors"]), (1, []))
        self.assertEqual((self.c["partial"], self.c["no_result"]), (0, 0))


class SegmentTest(unittest.TestCase):
    def seg(self, type_, text="x", start=None, end=None):
        s = {"id": f"{type_}-0", "type": type_, "text": text}
        if start is not None:
            s.update(start_ms=start, end_ms=end)
        return s

    def test_asr_overlap(self):
        self.assertTrue(evaluate.seg_match(self.seg("asr", "a", 1000, 3000), self.seg("asr", "b", 2500, 5000)))

    def test_asr_no_overlap(self):
        self.assertFalse(evaluate.seg_match(self.seg("asr", "a", 0, 3000), self.seg("asr", "a", 3000, 5000)))

    def test_type_must_match(self):
        self.assertFalse(evaluate.seg_match(self.seg("asr", "a", 0, 3000), self.seg("ocr", "a", 0, 3000)))

    def test_untimed_text(self):
        self.assertTrue(evaluate.seg_match(self.seg("description", "김치 1컵"), self.seg("description", "김치  1컵")))
        self.assertFalse(evaluate.seg_match(self.seg("comment", "김치 1컵"), self.seg("comment", "김치 2컵")))

    def test_amount_source_fallback(self):
        segs = {"asr-0": self.seg("asr", "소금 조금 넣어요", 0, 1)}
        self.assertEqual(evaluate.amount_sources(ing("소금", "약간", ["asr-0"]), segs), ({"말소리"}, True))


class SchemaTest(unittest.TestCase):
    def setUp(self):
        self.gold = case("Smpl0Gochu1")

    def test_bad_evidence_id_fails(self):
        p = pred_case("Smpl0Gochu1")
        p["recipe"]["ingredients"][0]["evidence"] = ["asr-99"]
        self.assertTrue(evaluate.evaluate_case(self.gold, p, SYN)["schema_errors"])

    def test_partial_exempts_min_items_only(self):
        p = pred_case("x-kimch")
        c = evaluate.evaluate_case(case("Smpl0Kimch2"), p, SYN)
        self.assertEqual((c["partial"], c["schema_pass"]), (1, 1))
        p["recipe"]["ingredients"][0]["evidence"] = []  # confirmed인데 근거 없음 → 그대로 실패
        c = evaluate.evaluate_case(case("Smpl0Kimch2"), p, SYN)
        self.assertEqual((c["partial"], c["schema_pass"]), (1, 0))

    def test_both_empty_fails(self):
        p = pred_case("x-kimch")
        p["recipe"]["ingredients"] = []
        c = evaluate.evaluate_case(case("Smpl0Kimch2"), p, SYN)
        self.assertEqual((c["partial"], c["schema_pass"]), (0, 0))

    def test_no_result(self):
        c = evaluate.evaluate_case(case("Smpl0Missng3"), {"recipe": None, "bundle": None}, SYN)
        self.assertEqual((c["no_result"], c["schema_pass"], c["matched"], c["steps_missing"]), (1, 0, 0, 1))


class RunTest(unittest.TestCase):
    def run_fixture(self, manifest=True):
        m = evaluate.load_manifest(FIX / "manifest.csv") if manifest else {}
        return evaluate.evaluate_run(FIX / "gold", FIX / "pred", SYN, m)

    def test_pairing_by_video_id_and_bundle_fallback(self):
        r = self.run_fixture()
        self.assertEqual(sorted(r["cases"]), ["Smpl0Gochu1", "Smpl0Kimch2", "Smpl0Missng3"])
        self.assertEqual(r["cases"]["Smpl0Kimch2"]["pred_dir"], "x-kimch")
        self.assertTrue(any("x-kimch" in w and "gold bundle" in w for w in r["warnings"]))

    def test_totals(self):
        t = self.run_fixture()["total"]
        self.assertEqual((t["cases"], t["gold_ings"], t["matched"]), (3, 8, 5))
        self.assertEqual((t["partial"], t["no_result"], t["schema_pass"]), (1, 1, 2))

    def test_manifest_subtotals(self):
        r = self.run_fixture()
        self.assertEqual(r["by_platform"]["YouTube"]["cases"], 2)
        self.assertEqual(r["by_platform"]["Instagram"]["cases"], 1)
        self.assertEqual(r["by_category"]["설명란"]["cases"], 2)
        self.assertEqual(list(self.run_fixture(manifest=False)["by_platform"]), ["unknown"])

    def test_cli(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "eval.json"
            argv = ["--gold", str(FIX / "gold"), "--pred", f"v7#1={FIX / 'pred'}", "--pred", f"v7#2={FIX / 'pred'}",
                    "--manifest", str(FIX / "manifest.csv"), "--out", str(out)]
            stdout, stderr = io.StringIO(), io.StringIO()
            with redirect_stdout(stdout), redirect_stderr(stderr):
                code = evaluate.main(argv)
            self.assertEqual(code, 0)
            self.assertIn("v7#1", stdout.getvalue())
            data = json.loads(out.read_text(encoding="utf-8"))
            recall = data["groups"]["v7"]["recall"]
            self.assertEqual((recall["mean"], recall["min"], recall["max"], recall["runs"]), (0.625, 0.625, 0.625, 2))
            self.assertEqual(data["runs"]["v7#1"]["rates"]["recall"], {"n": 5, "d": 8, "rate": 0.625})

    def test_cli_missing_gold(self):
        with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
            self.assertEqual(evaluate.main(["--gold", str(FIX / "nope"), "--pred", str(FIX / "pred")]), 1)


if __name__ == "__main__":
    unittest.main()

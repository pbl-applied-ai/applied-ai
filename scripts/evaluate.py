"""정답(gold) 레시피와 파이프라인 결과(pred)를 비교해 점수를 낸다.

사용법:
    python scripts/evaluate.py --gold <정답 폴더> --pred v7#1=<결과 폴더> [--pred v7#2=<결과 폴더> ...]
                               [--manifest <csv>] [--out <json>]

- 정답 폴더: 케이스 폴더마다 bundle.json·recipe.json.
- 결과 폴더: 케이스 폴더마다 recipe.json, 있으면 bundle.json(근거 ID가 결과 bundle 기준이라서).
  폴더 이름으로 짝짓고, 없으면 recipe.video_id로 찾는다. recipe.json이 없으면 "결과 없음".
- --pred 라벨의 '#' 앞(v7#1 → v7)으로 묶어 평균·최소·최대를 낸다.
- --manifest: case,platform,category 열(category = 분량 출처 분류). 소계에 쓴다.

지표 정의는 PR(KAN-26) 설명을 따른다. 점수·정답·실행 결과는 레포에 커밋하지 않는다.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import unicodedata
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker

from validate import SCHEMAS, load, recipe_rules

DEFAULT_SYNONYMS = Path(__file__).resolve().parent / "eval_synonyms.json"

SOURCE = {"title": "제목", "description": "설명", "comment": "고정 댓글", "asr": "말소리", "ocr": "화면 글자"}
TIMED = {"asr", "ocr"}
NO_EVIDENCE = "근거 없음"

_recipe_v = None


def recipe_validator() -> Draft202012Validator:
    global _recipe_v
    if _recipe_v is None:
        _recipe_v = Draft202012Validator(load(SCHEMAS / "recipe.schema.json"), format_checker=FormatChecker())
    return _recipe_v


# ---------- 정규화·짝짓기 ----------

def norm_text(s: str) -> str:
    """분량·문장 비교용: NFKC + 공백 제거. 단위·숫자 표기는 바꾸지 않는다."""
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", s or ""))


def norm_name(s: str) -> str:
    """재료 이름 비교용: NFKC, 괄호와 괄호 안 내용 제거, 소문자, 공백 제거."""
    s = unicodedata.normalize("NFKC", s or "")
    s = re.sub(r"\([^)]*\)|\[[^\]]*\]", "", s)
    return re.sub(r"\s+", "", s).lower()


def load_synonyms(path: Path) -> dict[str, str]:
    """{정규화한 표기: 정규화한 표준 이름}"""
    table = {}
    for g in load(path)["groups"]:
        canonical = norm_name(g["canonical"])
        for alias in g["aliases"]:
            table[norm_name(alias)] = canonical
    return table


def match_ingredients(gold: list[dict], pred: list[dict], synonyms: dict[str, str]) -> list[tuple[int, int]]:
    """1:1 탐욕 매칭. 단계마다 모든 gold를 돈 뒤 다음 단계로 간다(앞 단계 짝을 뒤 단계가 가로채지 않게).

    ① name 정확 일치 ② 동의어 ③ 어느 쪽이든 name_raw ↔ 상대 name.
    항목 id(v0.2)는 보지 않는다(#3 A: 평가는 재료 이름으로).
    """
    def keys_exact(item):
        return {norm_name(item["name"])}

    def keys_syn(item):
        k = norm_name(item["name"])
        return {synonyms.get(k, k)}

    def keys_raw(item):
        return {norm_name(item[f]) for f in ("name", "name_raw") if item.get(f)}

    def raw_match(g, p):
        # 같은 name끼리는 ①에서 끝났으므로 name_raw가 낀 조합만 본다.
        gk, pk = keys_raw(g), keys_raw(p)
        return bool(gk & pk)

    passes = [
        lambda g, p: keys_exact(g) == keys_exact(p),
        lambda g, p: keys_syn(g) == keys_syn(p),
        raw_match,
    ]
    pairs, used_g, used_p = [], set(), set()
    for same in passes:
        for gi, g in enumerate(gold):
            if gi in used_g:
                continue
            for pi, p in enumerate(pred):
                if pi not in used_p and same(g, p):
                    pairs.append((gi, pi))
                    used_g.add(gi)
                    used_p.add(pi)
                    break
    return sorted(pairs)


# ---------- 근거 ----------

def seg_match(p: dict, g: dict) -> bool:
    """같은 종류이고, asr·ocr은 시각 구간이 겹치면, 그 밖은 문장이 같으면 맞음(#3 F)."""
    if p["type"] != g["type"]:
        return False
    if p["type"] in TIMED:
        if not all(k in s for s in (p, g) for k in ("start_ms", "end_ms")):
            return False
        return min(p["end_ms"], g["end_ms"]) > max(p["start_ms"], g["start_ms"])
    return norm_text(p["text"]) == norm_text(g["text"])


def amount_sources(item: dict, segs: dict[str, dict]) -> tuple[set[str], bool]:
    """분량이 나온 출처. 근거 중 분량 문자열이 든 segment로 정하고, 없으면 근거 전체로 추정(True)."""
    ev = [segs[i] for i in item["evidence"] if i in segs]
    if not ev:
        return {NO_EVIDENCE}, True
    amount = norm_text(item["amount_raw"])
    hit = [s for s in ev if amount and amount in norm_text(s["text"])]
    return {SOURCE.get(s["type"], s["type"]) for s in (hit or ev)}, not hit


def amount_in_evidence(item: dict, segs: dict[str, dict]) -> bool:
    amount = norm_text(item["amount_raw"])
    return any(amount in norm_text(segs[i]["text"]) for i in item["evidence"] if i in segs)


# ---------- 스키마 ----------

def schema_check(recipe: dict, bundle: dict, partial: bool) -> list[str]:
    """validate.py와 같은 스키마·교차 규칙. partial이면 ingredients·steps의 minItems만 면제(worker-interface 4번)."""
    errors = [
        e for e in recipe_validator().iter_errors(recipe)
        if not (partial and e.validator == "minItems" and list(e.absolute_path) in (["ingredients"], ["steps"]))
    ]
    if errors:
        return [f"{'/'.join(map(str, e.absolute_path)) or '(root)'}: {e.message}" for e in errors]
    return recipe_rules(recipe, bundle, "recipe.json")


# ---------- 케이스 점수 ----------

def evaluate_case(gold: dict, pred: dict, synonyms: dict[str, str]) -> dict:
    g_recipe, g_segs = gold["recipe"], {s["id"]: s for s in gold["bundle"]["segments"]}
    p_recipe = pred.get("recipe")
    p_bundle = pred.get("bundle") or gold["bundle"]
    p_segs = {s["id"]: s for s in p_bundle["segments"]}

    g_ings, g_steps = g_recipe["ingredients"], g_recipe["steps"]
    p_ings = p_recipe.get("ingredients", []) if p_recipe else []
    p_steps = p_recipe.get("steps", []) if p_recipe else []
    partial = bool(p_recipe) and (not p_ings) != (not p_steps)

    c = defaultdict(int)
    c["cases"] = 1
    c["no_result"] = int(p_recipe is None)
    c["partial"] = int(partial)

    pairs = match_ingredients(g_ings, p_ings, synonyms)
    matched_g = {gi for gi, _ in pairs}
    matched_p = {pi for _, pi in pairs}

    # 재현율·정밀도
    c["gold_ings"] = len(g_ings)
    c["gold_evidenced"] = sum(1 for g in g_ings if g["evidence"])
    c["gold_unevidenced"] = c["gold_ings"] - c["gold_evidenced"]
    c["pred_ings"] = len(p_ings)
    c["matched"] = len(pairs)
    c["matched_evidenced"] = sum(1 for gi in matched_g if g_ings[gi]["evidence"])

    # 분량·상태·지어낸 값·근거
    status_table = defaultdict(int)
    fab_by_source = defaultdict(int)
    for gi, pi in pairs:
        g, p = g_ings[gi], p_ings[pi]
        gs, ps = g["amount_status"], p.get("amount_status")
        c["status_pairs"] += 1
        c["status_agree"] += int(gs == ps)
        status_table[f"{gs}>{ps}"] += 1
        if gs == "confirmed":
            c["amount_pairs"] += 1
            c["amount_exact"] += int((p.get("amount_raw") or "").strip() == g["amount_raw"].strip())
            c["amount_norm"] += int(norm_text(p.get("amount_raw")) == norm_text(g["amount_raw"]))
        elif ps == "confirmed":
            c["fabricated"] += 1
            for src in amount_sources(p, p_segs)[0]:
                fab_by_source[src] += 1

        p_ev = [p_segs[i] for i in p.get("evidence", []) if i in p_segs]
        g_ev = [g_segs[i] for i in g["evidence"] if i in g_segs]
        c["ev_pred_segs"] += len(p_ev)
        c["ev_pred_timed"] += sum(1 for s in p_ev if s["type"] in TIMED)
        c["ev_pred_correct"] += sum(1 for s in p_ev if any(seg_match(s, t) for t in g_ev))
        c["ev_gold_segs"] += len(g_ev)
        c["ev_gold_timed"] += sum(1 for s in g_ev if s["type"] in TIMED)
        c["ev_gold_covered"] += sum(1 for t in g_ev if any(seg_match(s, t) for s in p_ev))

    # 근거 미확인 분량(검토 필요): pred confirmed 분량이 pred 근거 문장 어디에도 없음
    unverified = [
        {"name": p["name"], "amount_raw": p.get("amount_raw"), "evidence": p.get("evidence", [])}
        for p in p_ings
        if p.get("amount_status") == "confirmed" and not amount_in_evidence(p, p_segs)
    ]
    c["unverified"] = len(unverified)

    # 정답 출처별 집계
    sources = defaultdict(lambda: {"with": 0, "sole": 0, "correct": 0, "sole_correct": 0})
    pred_of = dict(pairs)
    for gi, g in enumerate(g_ings):
        if g["amount_status"] != "confirmed":
            c["gold_unconfirmed"] += 1
            continue
        c["gold_confirmed"] += 1
        c["amount_gold_confirmed"] += 1
        srcs, estimated = amount_sources(g, g_segs)
        c["source_estimated"] += int(estimated)
        pi = pred_of.get(gi)
        correct = pi is not None and norm_text(p_ings[pi].get("amount_raw")) == norm_text(g["amount_raw"])
        for src in srcs:
            sources[src]["with"] += 1
            sources[src]["correct"] += int(correct)
            if len(srcs) == 1:
                sources[src]["sole"] += 1
                sources[src]["sole_correct"] += int(correct)

    # 조리 순서
    c["gold_steps"] = len(g_steps)
    c["pred_steps"] = len(p_steps)
    c["steps_missing"] = max(0, len(g_steps) - len(p_steps))
    c["steps_diff"] = len(p_steps) - len(g_steps)
    c["steps_missing_cases"] = int(c["steps_missing"] > 0)

    # 스키마
    errors = ["결과 없음"] if p_recipe is None else schema_check(p_recipe, p_bundle, partial)
    c["schema_pass"] = int(not errors)

    return {
        **c,
        "status_table": dict(status_table),
        "fabricated_by_source": dict(fab_by_source),
        "sources": {k: dict(v) for k, v in sources.items()},
        "schema_errors": errors,
        "unverified_list": unverified,
        "unmatched_gold": [g["name"] for gi, g in enumerate(g_ings) if gi not in matched_g],
        "unmatched_pred": [p["name"] for pi, p in enumerate(p_ings) if pi not in matched_p],
    }


# ---------- 실행 단위 집계 ----------

def add_counts(total: dict, part: dict) -> None:
    """숫자와 중첩 dict는 더하고, 목록·문자열은 케이스별로만 남긴다."""
    for k, v in part.items():
        if isinstance(v, bool) or isinstance(v, (list, str)):
            continue
        if isinstance(v, int):
            total[k] = total.get(k, 0) + v
        elif isinstance(v, dict):
            add_counts(total.setdefault(k, {}), v)


def ratio(n: int, d: int) -> dict:
    return {"n": n, "d": d, "rate": round(n / d, 4) if d else None}


def rates(t: dict) -> dict:
    g = t.get
    return {
        "recall": ratio(g("matched", 0), g("gold_ings", 0)),
        "recall_evidenced": ratio(g("matched_evidenced", 0), g("gold_evidenced", 0)),
        "precision": ratio(g("matched", 0), g("pred_ings", 0)),
        "amount_exact": ratio(g("amount_exact", 0), g("amount_pairs", 0)),
        "amount_norm": ratio(g("amount_norm", 0), g("amount_pairs", 0)),
        "amount_norm_all": ratio(g("amount_norm", 0), g("amount_gold_confirmed", 0)),
        "status_agree": ratio(g("status_agree", 0), g("status_pairs", 0)),
        "evidence_precision": ratio(g("ev_pred_correct", 0), g("ev_pred_segs", 0)),
        "evidence_recall": ratio(g("ev_gold_covered", 0), g("ev_gold_segs", 0)),
        "evidence_timed": ratio(g("ev_pred_timed", 0), g("ev_pred_segs", 0)),
        "schema_pass": ratio(g("schema_pass", 0), g("cases", 0)),
    }


def load_case_dir(d: Path) -> dict:
    return {
        "recipe": load(d / "recipe.json") if (d / "recipe.json").exists() else None,
        "bundle": load(d / "bundle.json") if (d / "bundle.json").exists() else None,
    }


def load_manifest(path: Path) -> dict[str, dict]:
    with path.open(encoding="utf-8-sig", newline="") as f:
        return {row["case"]: row for row in csv.DictReader(f)}


def evaluate_run(gold_dir: Path, pred_dir: Path, synonyms: dict[str, str], manifest: dict[str, dict]) -> dict:
    gold_cases = sorted(p.parent for p in gold_dir.glob("*/recipe.json"))
    if not gold_cases:
        raise FileNotFoundError(f"{gold_dir}: 정답 케이스(*/recipe.json) 없음")
    pred_by_video = {}
    for d in sorted(p.parent for p in pred_dir.glob("*/recipe.json")):
        pred_by_video.setdefault(load(d / "recipe.json").get("video_id"), d)

    cases, warnings = {}, []
    total = {}
    by_platform, by_category = defaultdict(dict), defaultdict(dict)
    for gd in gold_cases:
        gold = {"recipe": load(gd / "recipe.json"), "bundle": load(gd / "bundle.json")}
        pd = pred_dir / gd.name
        if not (pd / "recipe.json").exists():
            pd = pred_by_video.get(gold["recipe"]["video_id"], pd)
        pred = load_case_dir(pd) if pd.is_dir() else {"recipe": None, "bundle": None}
        if pred["recipe"] is None:
            warnings.append(f"{gd.name}: 결과 없음")
        elif pred["bundle"] is None:
            warnings.append(f"{gd.name}: {pd.name}/bundle.json 없음, gold bundle로 근거를 찾음")

        c = evaluate_case(gold, pred, synonyms)
        c["pred_dir"] = pd.name if pred["recipe"] is not None else None
        row = manifest.get(gd.name, {})
        c["platform"] = row.get("platform") or "unknown"
        c["category"] = row.get("category") or "unknown"
        cases[gd.name] = c
        add_counts(total, c)
        add_counts(by_platform[c["platform"]], c)
        add_counts(by_category[c["category"]], c)

    return {
        "cases": cases,
        "total": total,
        "rates": rates(total),
        "by_platform": dict(by_platform),
        "by_category": dict(by_category),
        "warnings": warnings,
    }


def group_stats(runs: dict[str, dict]) -> dict:
    """라벨 '#' 앞으로 묶어 비율의 평균·최소·최대, 카운트 지표의 평균을 낸다."""
    groups = defaultdict(list)
    for label, r in runs.items():
        groups[label.split("#")[0]].append(r)
    out = {}
    for name, rs in groups.items():
        stats = {}
        for key in rs[0]["rates"]:
            vals = [r["rates"][key]["rate"] for r in rs if r["rates"][key]["rate"] is not None]
            stats[key] = {
                "mean": round(sum(vals) / len(vals), 4) if vals else None,
                "min": min(vals) if vals else None,
                "max": max(vals) if vals else None,
                "runs": len(vals),
            }
        for key in ("fabricated", "unverified", "steps_missing", "partial", "no_result"):
            vals = [r["total"].get(key, 0) for r in rs]
            stats[key] = {"mean": round(sum(vals) / len(vals), 4), "min": min(vals), "max": max(vals), "runs": len(vals)}
        out[name] = stats
    return out


# ---------- 출력 ----------

COLUMNS = [
    ("재현율", "recall"), ("재현율(근거O)", "recall_evidenced"), ("정밀도", "precision"),
    ("분량 원문", "amount_exact"), ("분량 정규화", "amount_norm"), ("상태 일치", "status_agree"),
    ("근거 P", "evidence_precision"), ("근거 R", "evidence_recall"), ("스키마", "schema_pass"),
]
COUNTS = [("지어낸 값", "fabricated"), ("근거 미확인", "unverified"), ("단계 누락", "steps_missing"),
          ("partial", "partial"), ("결과 없음", "no_result")]


def fmt_rate(r: dict) -> str:
    return "-" if r["rate"] is None else f"{r['rate']:.2f} ({r['n']}/{r['d']})"


def print_report(runs: dict[str, dict], groups: dict[str, dict], with_manifest: bool) -> None:
    header = ["실행"] + [c for c, _ in COLUMNS] + [c for c, _ in COUNTS]
    rows = []
    for label, r in runs.items():
        rows.append([label] + [fmt_rate(r["rates"][k]) for _, k in COLUMNS] + [str(r["total"].get(k, 0)) for _, k in COUNTS])
    for name, s in groups.items():
        def fmt(x):
            return "-" if x["mean"] is None else f"{x['mean']:.2f} [{x['min']:.2f}–{x['max']:.2f}]"
        rows.append([f"{name} 평균"] + [fmt(s[k]) for _, k in COLUMNS] + [fmt(s[k]) for _, k in COUNTS])
    widths = [max(len(str(x)) for x in col) for col in zip(header, *rows)]
    for line in [header] + rows:
        print(" | ".join(str(x).ljust(w) for x, w in zip(line, widths)))

    print("\n정답 분량 출처 (gold confirmed 재료 기준: 출처 있음 / 단독 / 맞힘)")
    for label, r in runs.items():
        t = r["total"]
        parts = [
            f"{src} {v['with']}/{v.get('sole', 0)}/{v['correct']}"
            for src, v in sorted(t.get("sources", {}).items())
        ]
        print(f"  {label}: confirmed {t.get('gold_confirmed', 0)}, unconfirmed {t.get('gold_unconfirmed', 0)}, "
              f"출처 추정 {t.get('source_estimated', 0)} | " + ", ".join(parts))
        if t.get("fabricated_by_source"):
            print(f"    지어낸 값의 pred 근거 출처: {t['fabricated_by_source']}")

    if with_manifest:
        print("\n소계 (재현율 · 분량 정규화 · 지어낸 값)")
        for label, r in runs.items():
            for kind in ("by_platform", "by_category"):
                for name, t in r[kind].items():
                    rt = rates(t)
                    print(f"  {label} {name}({t['cases']}): {fmt_rate(rt['recall'])} · "
                          f"{fmt_rate(rt['amount_norm'])} · {t.get('fabricated', 0)}")


def parse_pred(arg: str) -> tuple[str, Path]:
    label, sep, path = arg.partition("=")
    if not sep:
        return Path(arg).name, Path(arg)
    return label, Path(path)


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description="정답과 파이프라인 결과 비교")
    ap.add_argument("--gold", required=True, type=Path)
    ap.add_argument("--pred", required=True, action="append", help="LABEL=DIR (반복 가능, 예: v7#1=reports/v7/run1)")
    ap.add_argument("--manifest", type=Path)
    ap.add_argument("--synonyms", type=Path, default=DEFAULT_SYNONYMS)
    ap.add_argument("--out", type=Path, help="결과 JSON (레포 밖 경로 권장)")
    args = ap.parse_args(argv)

    synonyms = load_synonyms(args.synonyms)
    manifest = load_manifest(args.manifest) if args.manifest else {}
    runs = {}
    try:
        for arg in args.pred:
            label, path = parse_pred(arg)
            if not path.is_dir():
                raise FileNotFoundError(f"{path}: 결과 폴더 없음")
            runs[label] = evaluate_run(args.gold, path, synonyms, manifest)
    except FileNotFoundError as e:
        print(f"오류: {e}", file=sys.stderr)
        return 1

    for label, r in runs.items():
        for w in r["warnings"]:
            print(f"경고 [{label}] {w}", file=sys.stderr)

    groups = group_stats(runs)
    print_report(runs, groups, bool(manifest))

    if args.out:
        data = {
            "meta": {
                "gold": str(args.gold),
                "preds": {label: arg for label, arg in zip(runs, args.pred)},
                "manifest": str(args.manifest) if args.manifest else None,
                "synonyms": str(args.synonyms),
                "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            },
            "runs": runs,
            "groups": groups,
        }
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

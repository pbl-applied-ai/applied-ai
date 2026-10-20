"""Evidence bundle / recipe 파일을 스키마와 교차 규칙으로 검사한다.

사용법:
    python scripts/validate.py                 # examples/ 전체
    python scripts/validate.py data/gold/v001  # 특정 폴더들

폴더마다 bundle.json(필수)과 recipe.json(있으면)을 검사한다.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker

ROOT = Path(__file__).resolve().parent.parent
SCHEMAS = ROOT / "schemas"


def load(path: Path):
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def schema_errors(validator: Draft202012Validator, data, label: str) -> list[str]:
    return [
        f"{label}: {'/'.join(map(str, e.absolute_path)) or '(root)'}: {e.message}"
        for e in sorted(validator.iter_errors(data), key=lambda e: list(e.absolute_path))
    ]


def bundle_rules(bundle: dict, label: str) -> list[str]:
    errors = []
    ids = [s["id"] for s in bundle["segments"]]
    dup = {i for i in ids if ids.count(i) > 1}
    if dup:
        errors.append(f"{label}: segment id 중복: {sorted(dup)}")
    for s in bundle["segments"]:
        if "start_ms" in s and "end_ms" in s and s["end_ms"] < s["start_ms"]:
            errors.append(f"{label}: {s['id']}: end_ms < start_ms")
        prefix = s["id"].split("-")[0]
        expected = {"title": "title", "description": "desc", "asr": "asr", "ocr": "ocr"}[s["type"]]
        if prefix != expected:
            errors.append(f"{label}: {s['id']}: type={s['type']}이면 id는 '{expected}-N' 형식")
    return errors


def recipe_rules(recipe: dict, bundle: dict, label: str) -> list[str]:
    errors = []
    seg_ids = {s["id"] for s in bundle["segments"]}
    if recipe["video_id"] != bundle["video_id"]:
        errors.append(f"{label}: video_id가 bundle과 다름")

    items = [("ingredients", i, ing) for i, ing in enumerate(recipe["ingredients"])]
    items += [("steps", i, st) for i, st in enumerate(recipe["steps"])]
    for kind, i, item in items:
        missing = set(item["evidence"]) - seg_ids
        if missing:
            errors.append(f"{label}: {kind}/{i}: bundle에 없는 근거 {sorted(missing)}")

    for i, ing in enumerate(recipe["ingredients"]):
        if ing.get("name_raw") == ing["name"]:
            errors.append(f"{label}: ingredients/{i}: name_raw는 name과 다를 때만 쓴다")

    orders = [s["order"] for s in recipe["steps"]]
    if orders != list(range(1, len(orders) + 1)):
        errors.append(f"{label}: steps.order는 1부터 빈틈없이 증가해야 함 (현재 {orders})")
    return errors


def check_dir(d: Path, bundle_v, recipe_v) -> list[str]:
    bundle_path, recipe_path = d / "bundle.json", d / "recipe.json"
    if not bundle_path.exists():
        return [f"{d}: bundle.json 없음"]
    rel = d.relative_to(ROOT) if d.is_relative_to(ROOT) else d
    bundle = load(bundle_path)
    errors = schema_errors(bundle_v, bundle, f"{rel}/bundle.json")
    if errors:
        return errors
    errors += bundle_rules(bundle, f"{rel}/bundle.json")
    if recipe_path.exists():
        recipe = load(recipe_path)
        r_errors = schema_errors(recipe_v, recipe, f"{rel}/recipe.json")
        errors += r_errors or recipe_rules(recipe, bundle, f"{rel}/recipe.json")
    return errors


def main(argv: list[str]) -> int:
    bundle_v = Draft202012Validator(load(SCHEMAS / "evidence_bundle.schema.json"), format_checker=FormatChecker())
    recipe_v = Draft202012Validator(load(SCHEMAS / "recipe.schema.json"), format_checker=FormatChecker())

    targets = [Path(a).resolve() for a in argv] or sorted(p.parent for p in (ROOT / "examples").glob("*/bundle.json"))
    if not targets:
        print("검사할 폴더가 없음")
        return 1

    errors = []
    for d in targets:
        errors += check_dir(d, bundle_v, recipe_v)

    for e in errors:
        print(f"FAIL {e}")
    print(f"{len(targets)}개 폴더 검사, 오류 {len(errors)}개")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

"""Evidence bundle / recipe / user recipe 파일을 스키마(v0.2)와 교차 규칙으로 검사한다.

사용법:
    python scripts/validate.py                 # examples/ 전체
    python scripts/validate.py data/gold/v001  # 특정 폴더들

폴더마다 bundle.json(필수)과 recipe.json·user_recipe.json(있으면)을 검사한다.
v0.1 파일은 먼저 scripts/migrate_v01_v02.py로 바꾼다.
"""

from __future__ import annotations

import json
import sys
from functools import cache
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker

ROOT = Path(__file__).resolve().parent.parent
SCHEMAS = ROOT / "schemas"

SEGMENT_PREFIX = {"title": "title", "description": "desc", "comment": "comment", "asr": "asr", "ocr": "ocr"}


def load(path: Path):
    with path.open(encoding="utf-8") as f:
        return json.load(f)


@cache
def validator(name: str) -> Draft202012Validator:
    return Draft202012Validator(load(SCHEMAS / f"{name}.schema.json"), format_checker=FormatChecker())


def schema_errors(validator: Draft202012Validator, data, label: str) -> list[str]:
    return [
        f"{label}: {'/'.join(map(str, e.absolute_path)) or '(root)'}: {e.message}"
        for e in sorted(validator.iter_errors(data), key=lambda e: list(e.absolute_path))
    ]


def duplicates(values: list) -> list:
    return sorted({v for v in values if values.count(v) > 1})


def bundle_rules(bundle: dict, label: str) -> list[str]:
    errors = []
    dup = duplicates([s["id"] for s in bundle["segments"]])
    if dup:
        errors.append(f"{label}: segment id 중복: {dup}")
    for s in bundle["segments"]:
        if "start_ms" in s and "end_ms" in s and s["end_ms"] < s["start_ms"]:
            errors.append(f"{label}: {s['id']}: end_ms < start_ms")
        expected = SEGMENT_PREFIX[s["type"]]
        if s["id"].split("-")[0] != expected:
            errors.append(f"{label}: {s['id']}: type={s['type']}이면 id는 '{expected}-N' 형식")
    return errors


def item_id_rules(recipe: dict, label: str) -> list[str]:
    errors = []
    for kind in ("ingredients", "steps"):
        dup = duplicates([item["id"] for item in recipe[kind]])
        if dup:
            errors.append(f"{label}: {kind} 항목 id 중복: {dup}")
    return errors


def recipe_rules(recipe: dict, bundle: dict, label: str) -> list[str]:
    errors = item_id_rules(recipe, label)
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


def user_recipe_rules(user: dict, bundle: dict, label: str) -> list[str]:
    errors = item_id_rules(user, label)
    if user["video_id"] != bundle["video_id"]:
        errors.append(f"{label}: video_id가 bundle과 다름")
    return errors


def check_case(bundle: dict, recipe: dict | None = None, user_recipe: dict | None = None, label: str = ".") -> list[str]:
    """한 영상의 파일들을 검사한다. 스키마 오류가 있는 파일은 교차 규칙을 건너뛴다."""
    errors = schema_errors(validator("evidence_bundle"), bundle, f"{label}/bundle.json")
    if errors:
        return errors
    errors += bundle_rules(bundle, f"{label}/bundle.json")
    if recipe is not None:
        r_errors = schema_errors(validator("recipe"), recipe, f"{label}/recipe.json")
        errors += r_errors or recipe_rules(recipe, bundle, f"{label}/recipe.json")
    if user_recipe is not None:
        u_errors = schema_errors(validator("user_recipe"), user_recipe, f"{label}/user_recipe.json")
        errors += u_errors or user_recipe_rules(user_recipe, bundle, f"{label}/user_recipe.json")
    return errors


def check_dir(d: Path) -> list[str]:
    if not (d / "bundle.json").exists():
        return [f"{d}: bundle.json 없음"]
    rel = d.relative_to(ROOT) if d.is_relative_to(ROOT) else d
    optional = lambda name: load(d / name) if (d / name).exists() else None  # noqa: E731
    return check_case(load(d / "bundle.json"), optional("recipe.json"), optional("user_recipe.json"), str(rel))


def main(argv: list[str]) -> int:
    targets = [Path(a).resolve() for a in argv] or sorted(p.parent for p in (ROOT / "examples").glob("*/bundle.json"))
    if not targets:
        print("검사할 폴더가 없음")
        return 1

    errors = []
    for d in targets:
        errors += check_dir(d)

    for e in errors:
        print(f"FAIL {e}")
    print(f"{len(targets)}개 폴더 검사, 오류 {len(errors)}개")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

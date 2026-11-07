"""스키마 v0.1 파일을 v0.2로 바꾼다 (KAN-9, #3 H).

사용법:
    python scripts/migrate_v01_v02.py examples/example-001 data/gold/v001 ...

폴더마다 bundle.json·recipe.json을 바꾼다. 내용은 고치지 않는다.
- recipe: 재료·단계에 배열 순서대로 ing-N·step-N을 붙이고, 한쪽만 비어 있으면 partial: true를 붙인다.
- bundle: schema_version만 올린다.
이미 0.2인 파일은 그대로 두고, 모르는 버전이면 멈춘다. 바꾼 뒤 validate.py로 검사한다
(v0.1에서 쓰던 stages 키가 v0.2 목록에 없으면 거기서 걸린다).
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

FROM, TO = "0.1", "0.2"


class MigrationError(Exception):
    pass


def with_id(item: dict, item_id: str) -> dict:
    return {"id": item_id, **{k: v for k, v in item.items() if k != "id"}}


def migrate_recipe(recipe: dict) -> dict:
    out = {**recipe, "schema_version": TO}
    out["ingredients"] = [with_id(ing, f"ing-{i}") for i, ing in enumerate(recipe["ingredients"], 1)]
    out["steps"] = [with_id(st, f"step-{i}") for i, st in enumerate(recipe["steps"], 1)]
    if bool(out["ingredients"]) != bool(out["steps"]):
        out["partial"] = True
    return out


def migrate_bundle(bundle: dict) -> dict:
    return {**bundle, "schema_version": TO}


# ---------- 원래 줄바꿈·들여쓰기를 지키며 고치기 ----------
# 다시 직렬화하면 손으로 쓴 정답 파일의 한 줄 형식이 모두 풀려 diff가 커진다.
# 그래서 원문에서 위치만 찾아 글자를 끼워 넣고, 결과가 convert()와 같은지 확인한다.

def locate(text: str) -> tuple[dict[str, int], dict[str, list[int]]]:
    """최상위 키의 위치, 최상위 ingredients·steps 배열 안 객체의 '{' 위치."""
    keys: dict[str, int] = {}
    items: dict[str, list[int]] = {"ingredients": [], "steps": []}
    stack: list[dict] = []
    i = 0
    while i < len(text):
        c = text[i]
        if c == '"':
            j = i + 1
            while text[j] != '"':
                j += 2 if text[j] == "\\" else 1
            top = stack[-1] if stack else None
            if top and top["type"] == "obj" and top["expect_key"]:
                top["key"], top["expect_key"] = json.loads(text[i : j + 1]), False
                if len(stack) == 1:
                    keys[top["key"]] = i
            i = j + 1
            continue
        if c in "{[":
            if c == "{" and len(stack) == 2 and stack[1]["type"] == "arr" and stack[0]["key"] in items:
                items[stack[0]["key"]].append(i)
            stack.append({"type": "obj" if c == "{" else "arr", "key": None, "expect_key": c == "{"})
        elif c in "}]":
            stack.pop()
        elif c == "," and stack and stack[-1]["type"] == "obj":
            stack[-1]["expect_key"] = True
        i += 1
    return keys, items


def edit_text(text: str, recipe: bool) -> str:
    keys, items = locate(text)
    edits: list[tuple[int, int, str]] = []  # (시작, 끝, 새 글자)
    m = re.compile(r'"schema_version"\s*:\s*"0\.1"').match(text, keys["schema_version"])
    edits.append((m.start(), m.end(), f'"schema_version": "{TO}"'))
    if recipe:
        for kind, prefix in (("ingredients", "ing"), ("steps", "step")):
            for n, pos in enumerate(items[kind], 1):
                ws = re.compile(r"\s*").match(text, pos + 1).group()
                edits.append((pos + 1, pos + 1, f'{ws}"id": "{prefix}-{n}",'))
        if bool(items["ingredients"]) != bool(items["steps"]):
            pos = keys["ingredients"]
            ws = text[:pos][len(text[:pos].rstrip()) :]
            edits.append((pos, pos, f'"partial": true,{ws}'))
    for start, end, new in sorted(edits, reverse=True):
        text = text[:start] + new + text[end:]
    return text


def migrate_file(path: Path, convert) -> bool:
    text = path.read_bytes().decode("utf-8")  # 줄 끝(CRLF/LF)도 그대로 둔다
    data = json.loads(text)
    version = data.get("schema_version")
    if version == TO:
        return False
    if version != FROM:
        raise MigrationError(f"{path}: 모르는 schema_version {version!r} ({FROM}만 바꾼다)")
    expected = convert(data)
    new = edit_text(text, convert is migrate_recipe)
    if json.loads(new) != expected:  # 원문 형식이 예상과 달라 끼워 넣기가 틀렸으면 다시 직렬화한다
        new = json.dumps(expected, ensure_ascii=False, indent=2) + "\n"
    path.write_text(new, encoding="utf-8", newline="")
    return True


def migrate_dir(d: Path) -> list[Path]:
    """바꾼 파일 목록. 버전을 먼저 다 확인하고 나서 쓴다(중간에 멈춰 반만 바뀌지 않게)."""
    files = [(d / "bundle.json", migrate_bundle), (d / "recipe.json", migrate_recipe)]
    files = [(p, f) for p, f in files if p.exists()]
    for p, _ in files:
        version = json.loads(p.read_text(encoding="utf-8")).get("schema_version")
        if version not in (FROM, TO):
            raise MigrationError(f"{p}: 모르는 schema_version {version!r} ({FROM}만 바꾼다)")
    return [p for p, convert in files if migrate_file(p, convert)]


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__)
        return 1
    try:
        for a in argv:
            changed = migrate_dir(Path(a))
            print(f"{a}: {', '.join(p.name for p in changed) or '바꿀 것 없음'}")
    except MigrationError as e:
        print(f"FAIL {e}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

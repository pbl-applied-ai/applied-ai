# applied-ai

요리 숏폼 링크 → 근거가 붙은 텍스트 레시피 → 내 레시피북.

## 처음 설정

```bash
git config core.hooksPath .githooks      # main 직접 push 방지 훅 켜기 (각자 1회)
pip install -r requirements-dev.txt
python scripts/validate.py               # 스키마·예시 검사 (CI의 check와 동일)
```

## 구조

| 경로 | 내용 |
|---|---|
| `schemas/evidence_bundle.schema.json` | 추출 파이프라인 1~4단계 출력 = 구조화 모델 입력 |
| `schemas/recipe.schema.json` | 구조화 결과(RecipeDraft)와 정답 레시피의 공통 형식 |
| `docs/labeling-guide.md` | 정답 레시피 만드는 규칙 |
| `examples/` | 폴더마다 `bundle.json` + `recipe.json` 한 쌍 |
| `scripts/validate.py` | 스키마 + 교차 규칙(근거 id 존재 등) 검사 |

## 협업 규칙

기능 브랜치 → PR → 작성자 외 1명 승인 → `check` 통과 → Squash merge. main 직접 push·강제 push 금지.

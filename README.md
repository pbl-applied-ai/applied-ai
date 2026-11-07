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
| `schemas/user_recipe.schema.json` | 사용자가 레시피북에 저장한 레시피(DB `user_recipes`) |
| `docs/labeling-guide.md` | 정답 레시피 만드는 규칙 |
| `examples/` | 폴더마다 `bundle.json` + `recipe.json` 한 쌍 |
| `scripts/validate.py` | 스키마(v0.2) + 교차 규칙(근거 id 존재, 항목 id 중복 등) 검사. 폴더에 `user_recipe.json`이 있으면 같이 본다 |
| `scripts/migrate_v01_v02.py` | v0.1 파일을 v0.2로 바꾼다(항목 id·버전만, 내용은 그대로). 레포 밖 정답 폴더는 각자 `python scripts/migrate_v01_v02.py <폴더...>` 뒤 `validate.py`로 확인 |
| `scripts/evaluate.py` | 정답과 파이프라인 결과 비교(사용법은 파일 머리말). 테스트: `python -m unittest discover -s scripts/tests` |
| `web/` | 웹 화면(Next.js). 실행 방법은 `web/README.md` |

## 협업 규칙

기능 브랜치 → PR → 작성자 외 1명 승인 → `check` 통과 → Squash merge. main 직접 push·강제 push 금지.

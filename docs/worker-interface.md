# 워커 ↔ 파이프라인 호출 방식 v0.2

작성: 전수빈 · 2026-10-24 · 선규 합의용
수정일: 2026-10-24
변경: #14 리뷰 반영. 예시를 가짜 영상 ID로 교체, 캐시 키에 파이프라인 버전 추가, error_code와 재시도 여부 필드 구분, 자막 403·LLM 응답 잘림 분류 변경. [결정 필요] 6개를 선규 답대로 확정(Node 워커, `internal` 별도 테이블, 단계마다 stage 기록, `internal` 코드 추가와 `schema_error` 통합, 자막 없을 때 설명란으로 진행, 한쪽만 있는 결과는 사용자가 채워 저장).
관련 문서: [개발 계획](dev-plan.md)의 jobs 표 · [UX 플로우](ux-flow.md) · `schemas/`

> **[후속]** 은 이 문서 밖에서 고칠 부분이다. 구현은 별도 PR로 한다.

## 1. 요약

- 워커는 Node로 만들고 `pipeline/`의 `runJob(input, { onStage })`를 직접 import한다. 워커는 jobs를 가져오고 저장만 한다.
- `runJob`은 예외를 던지지 않고 항상 **결과 객체 하나**(`succeeded` 또는 `failed`)를 돌려준다. 실패 분류(`error_code`)는 파이프라인이 정한다.
- 성공 결과는 팀 스키마 v0.1의 `bundle`(근거 묶음)·`recipe`(RecipeDraft)와 내부 전체 결과를 함께 준다.
- `stage`는 실제로 시작한 단계마다 기록하고, 건너뛴 단계는 이유를 남긴다.

## 2. 호출 방식

Node 워커가 `runJob`을 직접 import한다. 런타임이 하나라 직렬화·프로세스 관리가 필요 없고, 파이프라인의 외부 의존성 0도 유지된다. 이 레포에는 재사용할 Python 워커가 없어서 subprocess 방식은 쓰지 않는다.

jobs의 claim·complete·fail은 Supabase RPC로 한다. 동시 claim 방지는 DB에서 하고 pgTAP으로 검증한다(선규).

## 3. 입력

```json
{
  "job_id": "uuid",
  "source_url": "https://www.youtube.com/shorts/Smpl0Gochu1",
  "options": { "languages": ["ko", "en"] }
}
```

예시의 영상 ID는 테스트 fixture의 가짜 ID다. 실제 영상 ID와 원문은 공개 레포에 넣지 않는다.

- 워커는 처리 전에 `canonicalKey(source_url)`로 `canonical_key`(예: `youtube:Smpl0Gochu1`)를 구한다. 링크를 해석할 수 없으면 `null`이고, `runJob`이 `unsupported_source`로 실패시킨다.
- **캐시:** 같은 `canonical_key`와 같은 `extractor_version`의 성공 run이 있으면 `runJob`을 부르지 않고 재사용한다. `extractor_version`은 `extractorVersion()`이 돌려준다(아래 4번). 이 중 하나라도 다르면 다시 처리한다.
- API 키·모델 설정은 입력에 넣지 않고 워커 환경 변수로만 준다(`OPENAI_API_KEY`, `LLM_MODEL` 등).
- 업로드 입력(`upload_ref`)은 업로드 경로가 생기면 추가한다.

## 4. 출력

### 성공

```json
{
  "status": "succeeded",
  "canonical_key": "youtube:Smpl0Gochu1",
  "extractor_version": {
    "pipeline": "0.1.0+3f2a9c1",
    "collector": "youtube-timedtext",
    "prompt": "recipe-extract-v6",
    "model": "openai:gpt-4.1"
  },
  "bundle": { "...": "schemas/evidence_bundle.schema.json v0.1" },
  "recipe": { "...": "schemas/recipe.schema.json v0.1" },
  "internal": { "...": "파이프라인 전체 결과: 분량 내부 상태, 손질법, 팁, 항목 ID, 근거 시각" },
  "metrics": {
    "stages": [
      { "stage": "collect", "state": "done", "ms": 320 },
      { "stage": "asr", "state": "skipped", "reason": "timed_captions_available" },
      { "stage": "ocr", "state": "skipped", "reason": "not_implemented" },
      { "stage": "structure", "state": "done", "ms": 3700 },
      { "stage": "finalize", "state": "done", "ms": 4 }
    ],
    "usage": { "input_tokens": 2400, "output_tokens": 680 }
  },
  "warnings": []
}
```

- **`extractor_version.pipeline`**: `pipeline/package.json`의 버전 + 커밋 SHA(배포 시 `GIT_SHA` 환경 변수로 넣음). #12처럼 후처리(`resolve`)만 바뀌어도 SHA가 달라져 예전 결과를 재사용하지 않는다. SHA가 없는 로컬 실행은 `0.1.0+dev`이고 캐시에 저장하지 않는다.
- `bundle`·`recipe`는 #13의 어댑터(`toEvidenceBundle`, `toTeamRecipe`) 결과 그대로다. run(추출 결과)으로 저장하고 고치지 않는다.
- `internal`은 run과 분리한 **별도 테이블**에 두고 서버에서만 읽는다. 평가·디버깅용이고 화면에는 쓰지 않는다.
- `metrics`는 실행 기록(처리 시간·비용) 집계에 쓴다. 저장 위치는 선규가 실행 기록 쪽에서 정한다.

### 실패

```json
{
  "status": "failed",
  "canonical_key": "youtube:Smpl0Gochu1",
  "stage": "collect",
  "error_code": "unavailable",
  "reason": "no_captions_no_description",
  "retry": false,
  "message": "<원문 오류 메시지>",
  "partial": null,
  "metrics": { "stages": [{ "stage": "collect", "state": "failed", "ms": 340 }] }
}
```

- **`error_code`**: 사용자에게 보여 줄 **안내 종류**. 개발 계획 jobs 표의 값이고 UX 실패 안내와 1:1이다. 화면 문구는 프론트가 `error_code`로 고른다.
- **`retry`**: 워커가 **자동으로 다시 시도할지** 여부. `error_code`가 `retryable`(사용자에게 "다시 시도" 안내)이어도 자동 재시도 여부는 이 필드로만 판단한다. v0.1의 `retryable` 필드 이름이 error_code 값과 같아 헷갈려서 바꿨다.
- `reason`은 더 자세한 내부 원인(아래 6번 표). 집계·디버깅용이다.
- `message`는 원문 오류. 서버 로그나 접근 제한 컬럼에만 남기고 사용자에게 보여 주지 않는다(영상 ID·내부 정보 포함).
- `partial`은 `insufficient`일 때 찾은 만큼의 결과(`internal`과 같은 형태). 없으면 `null`.

## 5. stage

| stage | 화면 표시 | 지금 동작 |
|---|---|---|
| `collect` | 영상 정보 가져오는 중 | YouTube 자막·설명·제목 수집 |
| `asr` | 음성 듣는 중 | 미구현. 시간 있는 자막이 있으면 `skipped`(`timed_captions_available`) |
| `ocr` | 화면 글자 읽는 중 | 미구현. `skipped`(`not_implemented`) |
| `structure` | 레시피 정리 중 | LLM 구조화 |
| `finalize` | (표시 안 함) | 근거 검증·분량 상태·팀 스키마 변환 |

- `onStage({ stage, state, reason?, ms? })`를 단계 시작(`started`)·끝(`done`/`skipped`/`failed`)마다 부른다. 워커는 `started`가 올 때마다 `jobs.stage`를 DB에 쓴다. 지금은 사실상 `collect`·`structure` 두 번이고, ASR·OCR이 생기면 그만큼 늘어난다.
- 건너뛴 단계는 `jobs.stage`에 쓰지 않는다. 화면에는 실제로 실행한 단계만 지나간다.

## 6. error_code 대응표

지금 파이프라인 코드가 실제로 내는 오류 기준이다. `retry` ○는 워커 자동 재시도 대상이다.

| 상황 | stage | error_code | reason | retry | 화면 안내 |
|---|---|---|---|---|---|
| YouTube 링크가 아님(Instagram 등) | collect | `unsupported_source` | `not_youtube` | ✕ | 파일 업로드 |
| 플레이어 HTTP 5xx·429, 네트워크 오류, 시간 초과 | collect | `retryable` | `collect_network` | ○ | 다시 시도 |
| 재생 불가(비공개·삭제·로그인 필요, `playability≠OK`) | collect | `unavailable` | `not_playable` | ✕ | 파일 업로드 |
| 자막 트랙 내려받기 HTTP 429·5xx | collect | `retryable` | `caption_transient` | ○ | 다시 시도 |
| 자막 트랙 내려받기 HTTP 403 등 그 밖의 4xx | collect | `unavailable` | `caption_blocked` | ✕ | 파일 업로드 |
| 자막 없음, 설명란에 레시피 있음 | — | (성공) | — | — | "설명란만 보고 만든 레시피예요" 안내 |
| 자막 없음, 설명란에도 레시피 없음 | collect | `unavailable` | `no_captions_no_description` | ✕ | 파일 업로드 |
| LLM 시간 초과(120초), 5xx, 429, JSON 아닌 응답 | structure | `retryable` | `llm_transient` | ○ | 다시 시도 |
| LLM 응답이 토큰 한도에서 잘림 | structure | `internal` | `llm_cut_off` | ✕ | 다시 시도 |
| LLM 거절(refusal), 키 없음, 4xx | structure | `internal` | `llm_refused` / `llm_config` | ✕ | 다시 시도 |
| 모델이 요리 영상이 아니라고 판단 | finalize | `not_a_recipe` | `model_not_a_recipe` | ✕ | 다른 영상 |
| 재료·단계 둘 다 0개 | finalize | `insufficient` | `empty_recipe` | ✕ | 파일 업로드 (`partial` 없음) |
| 재료나 단계 한쪽만 0개 | finalize | `insufficient` | `partial_recipe` | ✕ | 찾은 만큼 보기 |
| 팀 스키마 변환 결과가 규칙에 안 맞음 | finalize | `internal` | `team_schema_invalid` | ✕ | 다시 시도 |
| 그 밖의 예외(버그) | 해당 stage | `internal` | `unexpected` | ✕ | 다시 시도 |

- **`internal`**: 키 없음·LLM 거절·응답 잘림·스키마 위반·버그처럼 우리 쪽 문제. v0.1의 `schema_error`를 여기에 합친다. 화면 안내는 "다시 시도"와 같고, 집계에서 사용자 쪽 문제(`retryable`·`unavailable`)와 구분된다. 같은 입력을 다시 돌려도 같은 결과일 가능성이 커서 자동 재시도하지 않는다.
- **자동 재시도**: `retry` ○만 최대 2번. 간격과 다음 실행 시각은 jobs의 `next_run_at`으로 DB에서 관리한다(선규). 그래도 실패하면 `failed`로 기록하고 화면은 "다시 시도"를 보여 준다.
- **자막 없는 영상**: 설명란만으로 레시피가 나오면 성공으로 처리하고, UX v0.4(#9)의 "설명란만 보고 만든 레시피예요" 안내를 띄운다. 설명란에도 레시피가 없을 때만 `unavailable`이다.
- **한쪽만 있는 결과(`partial_recipe`)**: 팀 스키마는 바꾸지 않는다. "찾은 만큼 보기"로 확인·수정 화면을 열고, 사용자가 빠진 쪽(재료 또는 단계)을 1개 이상 직접 추가해야 저장된다. 추가한 항목은 "직접 입력"으로 표시된다.

**[후속]** `internal` 추가·`schema_error` 통합에 맞춰 [개발 계획](dev-plan.md) jobs 표와 [UX 플로우](ux-flow.md) 실패 표를 고친다(문서 버전 올림).

## 7. 파이프라인 쪽 할 일 (수빈)

- 오류를 문자열이 아니라 `PipelineError { stage, error_code, reason, retry }`로 던지게 바꾸고, `runJob`이 결과 객체로 바꾼다. 지금은 오류 메시지 문자열로만 구분할 수 있다.
- `fetchTranscript`가 실패 원인을 구분하게 한다. 지금은 재생 불가(`LOGIN_REQUIRED`), 자막 없음, 자막 HTTP 403, 플레이어 HTTP 503이 모두 같은 `No usable captions` 오류로 끝나고, 네트워크 오류는 `TypeError: fetch failed`로 그대로 올라온다(2026-10-24 가짜 응답으로 확인).
- 자막이 없어도 설명란을 반환하게 수집 경계를 나눈다. 지금은 자막이 없으면 설명란을 반환하기 전에 실패한다.
- YouTube 요청에 시간 제한을 넣는다. 지금은 LLM 호출(120초)에만 있다.
- `runJob`, `canonicalKey`, `extractorVersion`을 내보내고, 6번 표의 경우마다 네트워크 없는 테스트를 둔다.

## 8. 선규 쪽 할 일

- jobs 테이블: `canonical_key`, `stage`, `status`, `error_code`, `reason`, `retry`, `attempts`, `next_run_at`, `run_id`. `message`는 서버 로그나 접근 제한 컬럼에만.
- run 저장: `bundle`·`recipe`·`extractor_version`·`metrics`, 캐시 조회(`canonical_key` + `extractor_version`). `internal`은 별도 테이블, 서버 전용 접근.
- claim·complete·fail Supabase RPC와 pgTAP 검증.

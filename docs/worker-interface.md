# 워커 ↔ 파이프라인 호출 방식 v0.1 (제안)

작성: 전수빈 · 2026-10-24 · 선규 합의용
변경: 최초 작성. KAN-6. 입력·출력·stage·error_code 제안.
관련 문서: [개발 계획](dev-plan.md)의 jobs 표 · [UX 플로우](ux-flow.md) · `schemas/`

> **[결정 필요]** 는 선규와 정할 부분이다. 합의되면 v0.2로 올리고 구현은 별도 PR로 한다.

## 1. 요약

- 워커는 jobs를 가져오고 저장만 한다. 영상 처리는 `pipeline/`의 `runJob(input, { onStage })` 한 함수가 한다.
- `runJob`은 예외를 던지지 않고 항상 **결과 객체 하나**(`succeeded` 또는 `failed`)를 돌려준다. 실패 분류(`error_code`)는 파이프라인이 정한다.
- 성공 결과는 팀 스키마 v0.1의 `bundle`(근거 묶음)·`recipe`(RecipeDraft)와 내부 전체 결과를 함께 준다.
- `stage`는 실제로 실행한 단계만 보고하고, 건너뛴 단계는 이유를 남긴다.

## 2. 호출 방식

| 안 | 방식 | 장점 | 단점 |
|---|---|---|---|
| **A (추천)** | Node 워커가 `runJob`을 직접 import | 런타임 하나, 직렬화 없음, 파이프라인 외부 의존성 0 유지 | 예전 Python 워커 코드는 못 씀 |
| B | Python 워커가 `node pipeline/src/job.mjs`를 subprocess로 실행. 입력은 stdin JSON, 진행은 stdout 한 줄씩(NDJSON), 마지막 줄이 결과 | 예전 워커 구조(claim → process → complete/fail) 재사용 | 프로세스 관리·타임아웃·인코딩 처리 추가 |

어느 쪽이든 `runJob`의 입력·출력은 같다. B를 고르면 CLI 래퍼만 하나 더 만든다.

**[결정 필요]** 워커 언어(A/B). jobs claim·complete·fail을 Supabase RPC로 할지도 같이 정한다.

## 3. 입력

```json
{
  "job_id": "uuid",
  "source_url": "https://www.youtube.com/shorts/APHvK7_R7oc",
  "options": { "languages": ["ko", "en"] }
}
```

- 워커는 처리 전에 `canonicalKey(source_url)`로 `canonical_key`(예: `youtube:APHvK7_R7oc`)를 구한다. 링크를 해석할 수 없으면 `null`이고, `runJob`이 `unsupported_source`로 실패시킨다.
- **캐시:** 같은 `canonical_key`와 같은 `extractor_version`의 성공 run이 있으면 `runJob`을 부르지 않고 재사용한다. `extractor_version`은 `extractorVersion()`이 돌려준다(아래 4번).
- API 키·모델 설정은 입력에 넣지 않고 워커 환경 변수로만 준다(`OPENAI_API_KEY`, `LLM_MODEL` 등).
- 업로드 입력(`upload_ref`)은 업로드 경로가 생기면 추가한다.

## 4. 출력

### 성공

```json
{
  "status": "succeeded",
  "canonical_key": "youtube:APHvK7_R7oc",
  "extractor_version": { "collector": "youtube-timedtext@<버전>", "prompt": "recipe-extract-v6", "model": "openai:gpt-4.1" },
  "bundle": { "...": "schemas/evidence_bundle.schema.json v0.1" },
  "recipe": { "...": "schemas/recipe.schema.json v0.1" },
  "internal": { "...": "파이프라인 전체 결과(result.json): 분량 내부 상태, 손질법, 팁, 항목 ID, 근거 시각" },
  "metrics": {
    "stages": [
      { "stage": "collect", "state": "done", "ms": 320 },
      { "stage": "asr", "state": "skipped", "reason": "timed_captions_available" },
      { "stage": "ocr", "state": "skipped", "reason": "not_implemented" },
      { "stage": "structure", "state": "done", "ms": 3738 },
      { "stage": "finalize", "state": "done", "ms": 4 }
    ],
    "usage": { "input_tokens": 2422, "output_tokens": 676 }
  },
  "warnings": []
}
```

- `bundle`·`recipe`는 PR #13의 어댑터(`toEvidenceBundle`, `toTeamRecipe`) 결과 그대로다. run(추출 결과)으로 저장하고 고치지 않는다.
- `internal`은 평가·디버깅용이다. 화면에는 쓰지 않는다.
- `metrics`는 실행 기록(처리 시간·비용) 집계에 쓴다. 선규가 실행 기록 쪽에서 저장 위치를 정한다.

**[결정 필요]** `internal`을 run과 같이 저장할지, 별도 테이블·스토리지에 둘지. 항목 ID가 스키마 v0.2에 들어가면 `recipe`만으로 수정 전후 연결이 되고, `internal` 의존이 줄어든다.

### 실패

```json
{
  "status": "failed",
  "canonical_key": "youtube:JNXHKtDBF48",
  "stage": "collect",
  "error_code": "insufficient",
  "reason": "no_captions",
  "retryable": false,
  "message": "No usable captions for JNXHKtDBF48 (ANDROID: playability=OK, no caption tracks; ...)",
  "partial": null,
  "metrics": { "stages": [{ "stage": "collect", "state": "failed", "ms": 339 }] }
}
```

- `error_code`는 개발 계획 jobs 표의 값이고 UX 실패 안내와 1:1이다. 화면 문구는 프론트가 `error_code`로 고른다.
- `reason`은 더 자세한 내부 원인(아래 6번 표). 집계·디버깅용이다.
- `message`는 원문 오류. 로그에만 남기고 사용자에게 보여 주지 않는다(영상 ID·내부 정보 포함).
- `partial`은 `insufficient`일 때 찾은 만큼의 결과(`internal`과 같은 형태). 없으면 `null`.

## 5. stage

| stage | 화면 표시 | 지금 동작 |
|---|---|---|
| `collect` | 영상 정보 가져오는 중 | YouTube 자막·설명·제목 수집 |
| `asr` | 음성 듣는 중 | 미구현. 시간 있는 자막이 있으면 `skipped`(`timed_captions_available`) |
| `ocr` | 화면 글자 읽는 중 | 미구현. `skipped`(`not_implemented`) |
| `structure` | 레시피 정리 중 | LLM 구조화 |
| `finalize` | (표시 안 함) | 근거 검증·분량 상태·팀 스키마 변환·검증 |

- `onStage({ stage, state, reason?, ms? })`를 단계 시작(`started`)·끝(`done`/`skipped`/`failed`)마다 부른다. 워커는 `started`가 올 때 `jobs.stage`를 갱신한다.
- 건너뛴 단계는 `jobs.stage`에 쓰지 않는다. 화면에는 실제 실행한 단계만 지나간다.
- `finalize`는 수 ms라 화면 단계로 보여 주지 않는다.

**[결정 필요]** `jobs.stage`를 매 단계 DB에 쓸지(폴링 3~4회 추가), `collect`·`structure` 두 번만 쓸지.

## 6. error_code 대응표

지금 파이프라인 코드가 실제로 내는 오류 기준이다.

| 상황 | stage | error_code | reason | retryable | 화면 안내 |
|---|---|---|---|---|---|
| YouTube 링크가 아님(Instagram 등) | collect | `unsupported_source` | `not_youtube` | ✕ | 파일 업로드 |
| 플레이어 HTTP 5xx·429, 네트워크 오류, 시간 초과 | collect | `retryable` | `collect_network` | ○ | 다시 시도 |
| 재생 불가(비공개·삭제·로그인 필요, `playability≠OK`) | collect | `unavailable` | `not_playable` | ✕ | 파일 업로드 |
| 재생은 되는데 자막 트랙 없음 | collect | `insufficient` | `no_captions` | ✕ | 파일 업로드 (`partial` 없음) |
| 자막 트랙은 있는데 내려받기 실패(HTTP 403 등) | collect | `retryable` | `caption_download` | ○ | 다시 시도 |
| LLM 시간 초과(120초), 5xx, 429, JSON 아닌 응답 | structure | `retryable` | `llm_transient` | ○ | 다시 시도 |
| LLM 응답이 토큰 한도에서 잘림 | structure | `schema_error` | `llm_cut_off` | ✕ | 다시 시도 |
| LLM 거절(refusal), 키 없음, 4xx | structure | **`internal`** (제안) | `llm_config` / `llm_refused` | ✕ | 잠시 후 다시 |
| 모델이 요리 영상이 아니라고 판단 | finalize | `not_a_recipe` | `model_not_a_recipe` | ✕ | 다른 영상 |
| 재료·단계 둘 다 0개 | finalize | `insufficient` | `empty_recipe` | ✕ | 찾은 만큼 보기 (`partial` 없으면 업로드) |
| 재료나 단계 한쪽만 0개 | finalize | `insufficient` | `partial_recipe` | ✕ | 찾은 만큼 보기 |
| 팀 스키마 검증 실패 | finalize | `schema_error` | `team_schema_invalid` | ✕ | 다시 시도 |
| 그 밖의 예외(버그) | 해당 stage | **`internal`** (제안) | `unexpected` | ✕ | 잠시 후 다시 |

- `retryable`이면 워커가 최대 2번까지 다시 시도한다(30초·2분 뒤). 그래도 실패하면 `failed`로 기록하고 화면은 "다시 시도"를 보여 준다.
- `insufficient`는 `partial`이 있으면 "찾은 만큼 보기", 없으면 업로드 안내로 간다.

**[결정 필요]**
1. 우리 쪽 오류(설정·버그·거절)용 `internal` 코드 추가. 지금 6개 코드에는 자리가 없어서 `retryable`이나 `schema_error`로 숨기게 된다.
2. 자막 없는 영상을 `insufficient`(`no_captions`)로 둘지, `unavailable`로 둘지. 화면 안내는 둘 다 업로드라 결과는 같고, 집계에서 구분된다.
3. 재료나 단계 한쪽만 있는 결과를 레시피북에 저장할 수 있게 할지. 지금 팀 스키마는 둘 다 1개 이상이어야 해서 `recipe`를 만들 수 없다.

## 7. 파이프라인 쪽 할 일 (합의 후 구현)

- 오류를 문자열이 아니라 `PipelineError { stage, error_code, reason, retryable }`로 던지게 바꾸고, `runJob`이 결과 객체로 바꾼다. 지금은 오류 메시지 문자열로만 구분할 수 있다.
- `fetchTranscript`가 실패 원인을 구분하게 한다. 지금은 재생 불가(`LOGIN_REQUIRED`), 자막 없음, 자막 HTTP 403, 플레이어 HTTP 503이 모두 같은 `No usable captions` 오류로 끝나고, 네트워크 오류는 `TypeError: fetch failed`로 그대로 올라온다(2026-10-24 가짜 응답으로 확인).
- YouTube 요청에 시간 제한을 넣는다. 지금은 LLM 호출(120초)에만 있다.
- `runJob`, `canonicalKey`, `extractorVersion`을 내보내고, 성공·실패 사례마다 네트워크 없는 테스트를 둔다(위 6번 표 기준).
- 안 B를 고르면 `pipeline/src/job.mjs` CLI 래퍼를 추가한다.

## 8. 선규 쪽 할 일 (제안)

- jobs 테이블: `canonical_key`, `stage`, `status`, `error_code`, `reason`, `retryable`, `attempts`, `run_id`. `message`는 서버 로그나 접근 제한 컬럼에만.
- run 저장: `bundle`·`recipe`·`extractor_version`·`metrics`, 캐시 조회(`canonical_key` + `extractor_version`).
- 재시도 정책을 워커에 둘지 DB(다음 실행 시각)에 둘지.

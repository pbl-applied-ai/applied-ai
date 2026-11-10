# 워커 ↔ 파이프라인 호출 방식 v0.8

작성: 전수빈 · 2026-10-24 · 선규 합의용
수정일: 2026-11-10
변경(v0.8, KAN-50): 개발용 릴스 12편 실측으로 `no_speech` 판단을 고침. Instagram은 캡션이 한국어면 음성 인식 언어를 한국어로 지정, 흔한 헛인식 문구 구간 제거, 한글이 대부분이면 다른 언어로 잡혀도 말소리로 봄, 확신이 매우 낮은 짧은 글자뿐이면 말소리 없음.
변경(v0.7): 영상 파일 업로드는 로그인한 사람만(`create_upload_job` anon 권한 회수, `uploads` 올리기 정책 authenticated만). 업로드는 캐시를 안 써서 건마다 비용이 나가기 때문(#32 배포 조건).
변경(v0.6, KAN-53): Instagram 수집기(`collectInstagram`), `canonical_key` `instagram:<코드>`, 실패 `reason` 7개 추가(`vendor_transient`·`vendor_quota`·`vendor_config`·`ig_not_found`·`ig_blocked`·`ig_not_video`, `no_media_no_caption`). `APIFY_TOKEN`·`SCRAPECREATORS_API_KEY`가 둘 다 없으면 지금처럼 `not_youtube`로 끝난다. 일시 오류로 말소리를 못 읽은 결과는 캐시에서 다시 쓰지 않는다(`speech: "lost"`).
변경(v0.5, KAN-50): `no_speech` 판단 보강. 음악만 있는 영상에서 whisper가 엉뚱한 언어로 짧은 글을 만드는 경우를 잡는다.
변경(v0.4, KAN-49): 영상 파일 업로드 입력(`upload_path`)과 업로드용 음성 인식(`asr` 단계), 업로드 실패 `reason` 6개 추가(`upload_missing`·`upload_too_large`·`upload_unreadable`·`no_speech`·`asr_transient`·`asr_config`). 업로드 job은 [다시 시도] 대신 [다른 파일 올리기].
변경(v0.3): #14 2차 리뷰 반영. #17·#18·#19 코드에서 정해진 것에 맞춤: 화면은 `reason`을 먼저 보고 안내를 고른다(`reason`도 화면 계약), 한쪽만 있는 결과는 partial run으로 저장하고 캐시에서 뺀다, 캐시는 워커에서 확인한다. 파이프라인 버전을 `pipeline/` 폴더 트리 해시로 바꾸고, 워커가 죽었을 때의 lease 규칙, 같은 영상 동시 요청, LLM 429 분류, watch·youtu.be 링크 처리를 정함. [개발 계획](dev-plan.md) jobs 표도 같이 고침.
관련 문서: [개발 계획](dev-plan.md)의 jobs 표 · [UX 플로우](ux-flow.md) · `schemas/` · `web/src/lib/api/labels.ts`(실패 안내) · `supabase/migrations/`(#18)

> **[후속]** 은 이 문서 밖에서 고칠 부분이다. 구현은 별도 PR로 한다.

## 1. 요약

- 워커는 Node로 만들고 `pipeline/`의 `runJob(input, { onStage })`를 직접 import한다. 워커는 jobs를 가져오고 저장만 한다.
- `runJob`은 예외를 던지지 않고 항상 **결과 객체 하나**(`succeeded` 또는 `failed`)를 돌려준다. 실패 분류(`error_code`·`reason`)는 파이프라인이 정한다.
- 성공 결과는 팀 스키마 v0.1의 `bundle`(근거 묶음)·`recipe`(RecipeDraft)와 내부 전체 결과를 함께 준다.
- `stage`는 실제로 시작한 단계마다 기록하고, 건너뛴 단계는 이유를 남긴다.
- 화면의 실패 안내는 `reason`을 먼저 보고, 없으면 `error_code`로 고른다. 그래서 `reason` 값도 화면과의 계약이다(4번).

## 2. 호출 방식

Node 워커가 `runJob`을 직접 import한다. 런타임이 하나라 직렬화·프로세스 관리가 필요 없고, 파이프라인의 외부 의존성 0도 유지된다. 이 레포에는 재사용할 Python 워커가 없어서 subprocess 방식은 쓰지 않는다.

jobs의 claim·complete·fail은 Supabase RPC로 한다. 동시 claim 방지는 DB에서 하고 pgTAP으로 검증한다(선규).

### 처리 중에 워커가 죽을 때 (lease)

- `claim_next_job`은 job을 `running`으로 바꾸면서 `locked_until = now() + 10분`을 쓴다. 10분은 수집·LLM(120초 제한)·재시도 한 번을 넉넉히 넘는 시간이다.
- `claim_next_job`은 `queued`뿐 아니라 **`locked_until`이 지난 `running`** job도 다시 가져간다. 이때도 `attempts`를 1 올린다.
- `attempts`가 3(처음 1번 + 자동 재시도 2번)을 넘으면 다시 잡지 않고 `failed`·`internal`·`worker_lost`로 끝낸다. 화면은 "다시 시도"다.
- complete·fail은 자기가 잡은 job(`status = 'running'`이고 `attempts`가 claim 때 값과 같을 때)만 갱신한다. lease가 끝나 다른 워커가 다시 잡은 job을 늦게 끝난 워커가 덮어쓰지 않게 하기 위해서다.
- **[후속]** #18: `jobs.locked_until` 컬럼, `claim_next_job` 조건, 정렬 기준을 인덱스와 같은 `next_run_at`으로 맞추기.

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
- API 키·모델 설정은 입력에 넣지 않고 워커 환경 변수로만 준다(`OPENAI_API_KEY`, `LLM_MODEL` 등).

### 업로드 입력 (KAN-49)

- 화면이 비공개 버킷 `uploads`에 `incoming/<uuid>.<mp4|mov|webm|m4v>`로 파일을 올리고 `create_upload_job(경로)`를 부른다. **로그인한 사람만** 올리고 job을 만든다(업로드는 캐시를 안 써서 건마다 비용이 나가기 때문, 11/9). 올리기만 되고 읽기·지우기는 안 된다. 25MB까지(음성 인식 API 한도).
- job의 `source_url`은 `upload:<uuid>`, 파일 위치는 `jobs.upload_path`(화면에는 열지 않음). `canonical_key`도 `upload:<uuid>`라 캐시를 쓰지 않는다.
- 워커는 claim한 job에 `upload_path`가 있으면 service_role로 파일을 읽어 `runJob`의 `input.upload`(`{ bytes, filename, mime }`)로 넘긴다. job이 끝나면(성공·최종 실패) 파일을 지운다. 자동 재시도로 다시 큐에 들어가면 남겨 둔다. 파일을 읽다가 Storage 오류(키·요청 오류의 400 포함)가 나면 `collect_network`(자동 재시도)로 실패시키고, 이때는 최종 실패여도 파일을 지우지 않는다.
- 음성 인식 API는 파일 이름으로 형식을 보고 mov·m4v를 받지 않는다. 워커는 mov·m4v를 `upload.mp4`로 이름 붙여 보낸다(같은 ISO-BMFF 계열).
- 업로드는 자막·설명란이 없어서 음성 인식(`whisper-1`, 시각 있는 구간)이 유일한 근거다. 링크 영상의 직접 음성 인식·자막과의 비교는 KAN-50에서 정한다.
- **[후속]** job을 만들지 않고 남은 파일과 `worker_lost`로 끝난 job의 파일 정리, 로그인 사용자 하루 업로드 상한.

### 링크 범위

- 화면(S2)은 Shorts 링크만 받는다(UX v0.4, #15).
- 워커는 일반 YouTube 링크(`watch`·`youtu.be`)도 그대로 처리한다. `create_job` RPC를 직접 부르는 경우까지 막을 이유가 없고, `canonical_key`는 영상 ID 기준이라 같은 영상이면 Shorts 링크와 캐시를 같이 쓴다. 긴 영상 길이 제한은 MVP 이후 후보(UX v0.4 9절)와 함께 정한다.

### 캐시

- **확인 위치는 워커다.** job을 claim한 뒤, `runJob`을 부르기 전에 같은 `canonical_key` + 같은 `extractor_version`의 **성공 run**(`partial = false`)이 있으면 LLM을 부르지 않고 그 run으로 바로 complete한다. 조회와 저장은 같은 버전 값을 쓴다(`jobVersion`).
- **Instagram 말소리를 일시 오류로 못 읽은 결과**(음성·영상 다운로드 5xx·429·시간 초과, 영상 음성 인식 일시 오류)는 캡션 기반으로 보여 주되, `extractor_version`에 `speech: "lost"`를 붙여 저장해서 다시 쓰지 않는다. 같은 릴스를 다시 넣으면 새로 처리한다.
- 그래서 이미 처리된 영상도 처리 중 화면(S3)이 잠깐(폴링 1~2번) 보였다가 결과로 넘어간다. MVP는 이것으로 충분하다.
- API(`create_job`)에서 확인해 S3를 아예 건너뛰는 건 MVP 이후로 둔다. 그때는 워커가 시작할 때 현재 `extractor_version`을 설정 테이블에 써 두고 `create_job`이 그 값을 읽는다. API 서버가 워커 환경 변수를 따로 알 필요가 없게 하기 위해서다.
- **같은 영상 동시 요청**: 두 사람이 거의 동시에 같은 영상을 넣으면 둘 다 캐시를 못 찾아 LLM이 두 번 돈다. MVP에서는 허용한다(비용 한 번 더). 줄여야 하면 claim할 때 같은 `canonical_key`의 `running` job이 있으면 `next_run_at`을 미뤄 기다리게 한다.

## 4. 출력

### 성공

```json
{
  "status": "succeeded",
  "canonical_key": "youtube:Smpl0Gochu1",
  "extractor_version": {
    "pipeline": "0.1.0+9b1e04d",
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

- **`extractor_version.pipeline`**: `pipeline/package.json`의 버전 + **`pipeline/` 폴더의 트리 해시** 앞 7자(`git rev-parse HEAD:pipeline`, 배포 때 `PIPELINE_TREE` 환경 변수로 넣음). 모노레포라 레포 전체 커밋 SHA를 쓰면 `web/`·`docs/`만 바뀌어도 값이 바뀌어 캐시가 전부 무효가 된다. 트리 해시는 #12처럼 `pipeline/` 안의 후처리(`resolve`)가 바뀔 때만 달라진다. 값이 없는 로컬 실행은 `0.1.0+dev`이고 캐시에 저장하지 않는다.
- `bundle`·`recipe`는 #13의 어댑터(`toEvidenceBundle`, `toTeamRecipe`) 결과 그대로다. run(추출 결과)으로 저장하고 고치지 않는다.
- `internal`은 run과 분리한 **별도 테이블**(`run_internals`)에 두고 서버에서만 읽는다. 평가·디버깅용이고 화면에는 쓰지 않는다.
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

- **`error_code`**: 안내의 큰 분류. 개발 계획 jobs 표의 값이다.
- **`reason`**: 세부 원인(아래 6번 표). 화면은 **`reason`을 먼저 보고, 없거나 모르는 값이면 `error_code`로** 안내를 고른다(`web/src/lib/api/labels.ts`의 `failGuide`). 둘 다 모르면 "잠시 문제가 생겼어요"(일시 오류)로 안내한다.
  - 그래서 `reason`은 집계·디버깅용만이 아니라 **화면 계약의 일부**다. 6번 표의 `reason` 값을 바꾸거나 지우거나 새 안내가 필요한 값을 더할 때는 `labels.ts`의 `BY_REASON`과 같은 PR에서 고친다.
  - 지금 화면이 따로 보는 값: `not_playable`, `caption_blocked`, `no_captions`, `no_captions_no_description`, `partial_recipe`, `empty_recipe`, `no_speech`, `upload_too_large`, `upload_unreadable`, `upload_missing`.
  - 업로드한 파일이 실패하면 [영상 파일로 넣기]와 [다시 시도] 대신 [다른 파일 올리기]를 보여 준다(UX 플로우 S3). 원본이 job이 끝나면 지워져서 다시 시도할 수 없다.
- **`retry`**: 워커가 **자동으로 다시 시도할지** 여부. `error_code`가 `retryable`(사용자에게 "다시 시도" 안내)이어도 자동 재시도 여부는 이 필드로만 판단한다.
- `message`는 원문 오류. 서버 로그나 접근 제한 컬럼에만 남기고 사용자에게 보여 주지 않는다(영상 ID·내부 정보 포함).
- **`partial`**: `partial_recipe`일 때 찾은 만큼의 결과. 성공과 같은 모양(`bundle`·`recipe`·`internal`)이고, 없으면 `null`이다. 저장 방법은 아래.

### 한쪽만 있는 결과 (partial run)

- 워커는 `partial`을 **run으로 저장**하고(`runs.partial = true`), 실패 job의 `run_id`가 그 run을 가리킨다. `internal`은 성공 run처럼 `run_internals`에 둔다.
- 화면은 `get_job`의 `run_id`로 "찾은 만큼 보기"를 열고, 확인·수정 화면(S4)은 `get_run`으로 이 run의 `recipe`를 읽는다. 사용자가 빠진 쪽(재료 또는 단계)을 1개 이상 직접 추가해야 저장된다.
- partial run의 `recipe`는 재료나 단계 한쪽이 비어 있다. 여기에는 `partial: true`가 붙고, 팀 스키마(v0.2)는 이때만 한쪽이 0개여도 받는다. 나머지 규칙(필드·타입·근거)은 그대로 검사한다.
- **캐시 조회는 `partial = false`인 run만 본다.** 안 그러면 partial run이 성공 run처럼 재사용된다.
- **[후속]** #18: `runs.partial` 컬럼, `runs_cache_idx`를 `where partial = false` 부분 인덱스로, `jobs_failed_has_error` 제약은 그대로 두고 실패 job의 `run_id`는 `partial_recipe`일 때만 채운다.

## 5. stage

| stage | 화면 표시 | 지금 동작 |
|---|---|---|
| `collect` | 영상 정보 가져오는 중 | YouTube 자막·설명·제목 수집 |
| `asr` | 음성 듣는 중 | 업로드만 실행(음성 인식). 링크는 `skipped`(`timed_captions_available` / `not_implemented`) |
| `ocr` | 화면 글자 읽는 중 | 미구현. `skipped`(`not_implemented`) |
| `structure` | 레시피 정리 중 | LLM 구조화 |
| `finalize` | (표시 안 함, 앞 단계 문구 유지) | 근거 검증·분량 상태·팀 스키마 변환 |

- `onStage({ stage, state, reason?, ms? })`를 단계 시작(`started`)·끝(`done`/`skipped`/`failed`)마다 부른다. 워커는 `started`가 올 때마다 `jobs.stage`를 DB에 쓴다. 지금은 사실상 `collect`·`structure` 두 번이고, ASR·OCR이 생기면 그만큼 늘어난다.
- 건너뛴 단계는 `jobs.stage`에 쓰지 않는다. 화면에는 실제로 실행한 단계만 지나간다.

## 6. error_code·reason 대응표

지금 파이프라인 코드가 실제로 내는 오류 기준이다. `retry` ○는 워커 자동 재시도 대상이다. 화면 안내는 `labels.ts`의 실패 안내 7종(Figma 문구표 수정안) 기준이다.

| 상황 | stage | error_code | reason | retry | 화면 안내 |
|---|---|---|---|---|---|
| YouTube 링크가 아님(Instagram 등) | collect | `unsupported_source` | `not_youtube` | ✕ | 링크로 가져올 수 없어요 → 파일 업로드 / 다른 링크 |
| 플레이어 HTTP 5xx·429, 네트워크 오류, 시간 초과 | collect | `retryable` | `collect_network` | ○ | 잠시 문제가 생겼어요 → 다시 시도 / 다른 링크 |
| 재생 불가(비공개·삭제·로그인 필요, `playability≠OK`) | collect | `unavailable` | `not_playable` | ✕ | 이 영상은 열 수 없어요 → 파일 업로드 / 다른 링크 |
| 자막 트랙 내려받기 HTTP 429·5xx | collect | `retryable` | `caption_transient` | ○ | 잠시 문제가 생겼어요 → 다시 시도 / 다른 링크 |
| 자막 트랙 내려받기 HTTP 403 등 그 밖의 4xx | collect | `unavailable` | `caption_blocked` | ✕ | 이 영상은 열 수 없어요 → 파일 업로드 / 다른 링크 |
| 자막 없음, 설명란에 레시피 있음 | — | (성공) | — | — | "설명란만 보고 만든 레시피예요" 안내 |
| 자막 없음, 설명란에도 레시피 없음 | collect | `unavailable` | `no_captions_no_description` | ✕ | 자막이 없어서 읽을 수 없어요 → 다른 링크 / 파일 업로드 |
| LLM 시간 초과(120초), 5xx, 429, JSON 아닌 응답 | structure | `retryable` | `llm_transient` | ○ | 잠시 문제가 생겼어요 → 다시 시도 / 다른 링크 |
| LLM 응답이 토큰 한도에서 잘림 | structure | `internal` | `llm_cut_off` | ✕ | 서비스에 문제가 생겼어요 → 다시 시도 / 레시피북 |
| LLM 거절(refusal), 키 없음, **429를 뺀** 4xx | structure | `internal` | `llm_refused` / `llm_config` | ✕ | 서비스에 문제가 생겼어요 → 다시 시도 / 레시피북 |
| 업로드 job인데 파일이 없음(Storage 404, 또는 400에 `not_found` 본문) | collect | `unavailable` | `upload_missing` | ✕ | 영상 파일을 읽을 수 없어요 → 다른 파일 올리기 / 다른 링크 |
| 업로드 파일이 25MB 초과 | asr | `unavailable` | `upload_too_large` | ✕ | 파일이 너무 커요 → 다른 파일 올리기 / 다른 링크 |
| 음성 인식이 파일을 못 읽음(HTTP 400: 깨진 파일·소리 없음) | asr | `unavailable` | `upload_unreadable` | ✕ | 영상 파일을 읽을 수 없어요 → 다른 파일 올리기 / 다른 링크 |
| 음성 인식 결과에 말소리가 없음(글자 없음, whisper가 무음으로 본 구간·흔한 헛인식 문구뿐, 한국어·영어·한글이 아닌데 글자가 초당 2자 미만, 또는 whisper 확신이 매우 낮은 짧은 글자뿐) | asr | `unavailable` | `no_speech` | ✕ | 영상에서 말소리를 찾지 못했어요 → 다른 파일 올리기 / 다른 링크 |
| Instagram: Apify 5xx·429·시간 초과·네트워크 오류이고 ScrapeCreators도 실패, 또는 캡션이 없는데 음성·영상 다운로드가 일시 오류 | collect | `retryable` | `vendor_transient` | ○ | 잠시 문제가 생겼어요 → 다시 시도 / 다른 링크 |
| Instagram: Apify 결과 없음 + ScrapeCreators 404 (삭제·비공개·없는 주소) | collect | `unavailable` | `ig_not_found` | ✕ | 이 영상은 열 수 없어요 → 파일 업로드 / 다른 링크 |
| Instagram: ScrapeCreators 403 (접근 제한) | collect | `unavailable` | `ig_blocked` | ✕ | 이 영상은 열 수 없어요 → 파일 업로드 / 다른 링크 |
| Instagram: 업체 크레딧 부족(402), 키 문제(그 밖의 4xx) | collect | `internal` | `vendor_quota` / `vendor_config` | ✕ | 서비스에 문제가 생겼어요 → 다시 시도 / 레시피북 |
| Instagram: 영상이 없는 게시물(사진·슬라이드) | collect | `unsupported_source` | `ig_not_video` | ✕ | 릴스 영상만 가져올 수 있어요 → 다른 링크 / 파일 업로드 |
| Instagram: 말소리도 캡션도 없음, 또는 캡션에 레시피 없고 말소리 없음 | asr / finalize | `unavailable` | `no_media_no_caption` | ✕ | 이 영상에서 레시피를 읽을 수 없어요 → 다른 링크 / 파일 업로드 |
| 음성 인식 HTTP 429·5xx, 네트워크 오류, 시간 초과 | asr | `retryable` | `asr_transient` | ○ | 잠시 문제가 생겼어요 → 다른 파일 올리기 / 다른 링크 |
| 음성 인식 키 없음, 429를 뺀 그 밖의 4xx | asr | `internal` | `asr_config` | ✕ | 서비스에 문제가 생겼어요 → 다른 파일 올리기 / 레시피북 |
| 모델이 요리 영상이 아니라고 판단 | finalize | `not_a_recipe` | `model_not_a_recipe` | ✕ | 요리 영상이 아닌 것 같아요 → 다른 링크 |
| 재료·단계 둘 다 0개 | finalize | `insufficient` | `empty_recipe` | ✕ | 레시피를 찾지 못했어요 → 다른 링크 / 파일 업로드 (`partial` 없음) |
| 재료나 단계 한쪽만 0개 | finalize | `insufficient` | `partial_recipe` | ✕ | 찾은 정보가 적어요 → 찾은 만큼 보기 / 다른 링크 |
| 팀 스키마 변환 결과가 규칙에 안 맞음 | finalize | `internal` | `team_schema_invalid` | ✕ | 서비스에 문제가 생겼어요 → 다시 시도 / 레시피북 |
| 처리 중 워커가 멈춰 lease가 끝났고 `attempts`가 3을 넘음(2번) | 해당 stage | `internal` | `worker_lost` | ✕ | 서비스에 문제가 생겼어요 → 다시 시도 / 레시피북 |
| 그 밖의 예외(버그) | 해당 stage | `internal` | `unexpected` | ✕ | 서비스에 문제가 생겼어요 → 다시 시도 / 레시피북 |

- **`internal`**: 키 없음·LLM 거절·응답 잘림·스키마 위반·버그처럼 우리 쪽 문제. v0.1의 `schema_error`를 여기에 합쳤다. 집계에서 사용자 쪽 문제(`retryable`·`unavailable`)와 구분된다. 같은 입력을 다시 돌려도 같은 결과일 가능성이 커서 자동 재시도하지 않는다.
- **LLM 429**는 위쪽 `llm_transient`(재시도)로 간다. `internal`의 "4xx"는 429를 뺀 나머지다.
- 화면에 아직 없는 버튼(업로드 경로가 없을 때 [영상 파일로 넣기], 비로그인일 때 [레시피북으로])은 화면이 빼고 보여 준다. 남는 버튼이 없으면 [다른 링크 넣기]를 붙인다(#19).
- **자동 재시도**: `retry` ○만 최대 2번. 간격과 다음 실행 시각은 jobs의 `next_run_at`으로 DB에서 관리한다(선규). 그래도 실패하면 `failed`로 기록하고 화면은 "다시 시도"를 보여 준다. 화면의 [다시 시도]는 같은 링크로 **새 job**을 만든다.
- **자막 없는 영상**: 설명란만으로 레시피가 나오면 성공으로 처리하고, UX v0.4(#9)의 "설명란만 보고 만든 레시피예요" 안내를 띄운다. 설명란에도 레시피가 없을 때만 `unavailable`이다.
- **자막 없음의 error_code**: Figma 문구표는 `insufficient`(`no_captions`)로 적혀 있지만 이 문서는 `unavailable`(`no_captions_no_description`)이다. 화면은 `reason`으로 골라서 어느 쪽이든 같은 문구가 나온다. 파이프라인은 이 표대로 낸다.

**[후속]** [UX 플로우](ux-flow.md) 실패 표의 `schema_error` → `internal`은 #9(UX v0.4)에서 같이 고친다. [개발 계획](dev-plan.md) jobs 표는 이 PR에서 고쳤다.

## 7. 파이프라인 쪽 할 일 (수빈)

- 오류를 문자열이 아니라 `PipelineError { stage, error_code, reason, retry }`로 던지게 바꾸고, `runJob`이 결과 객체로 바꾼다. 지금은 오류 메시지 문자열로만 구분할 수 있다.
- `fetchTranscript`가 실패 원인을 구분하게 한다. 지금은 재생 불가(`LOGIN_REQUIRED`), 자막 없음, 자막 HTTP 403, 플레이어 HTTP 503이 모두 같은 `No usable captions` 오류로 끝나고, 네트워크 오류는 `TypeError: fetch failed`로 그대로 올라온다(2026-10-24 가짜 응답으로 확인).
- 자막이 없어도 설명란을 반환하게 수집 경계를 나눈다. 지금은 자막이 없으면 설명란을 반환하기 전에 실패한다.
- YouTube 요청에 시간 제한을 넣는다. 지금은 LLM 호출(120초)에만 있다.
- `partial_recipe`일 때 `partial`에 `bundle`·`recipe`·`internal`을 채운다. `recipe`에는 `partial: true`를 붙인다(스키마 v0.2).
- `extractorVersion()`이 `PIPELINE_TREE`(없으면 `dev`)를 쓰게 한다.
- `runJob`, `canonicalKey`, `extractorVersion`을 내보내고, 6번 표의 경우마다 네트워크 없는 테스트를 둔다.

## 8. 선규 쪽 할 일

- jobs 테이블: `canonical_key`, `stage`, `status`, `error_code`, `reason`, `retry`, `attempts`, `next_run_at`, `locked_until`, `run_id`. `message`는 서버 로그나 접근 제한 컬럼에만.
- run 저장: `bundle`·`recipe`·`extractor_version`·`metrics`·`partial`, 캐시 조회(`canonical_key` + `extractor_version`, `partial = false`만). `internal`은 별도 테이블, 서버 전용 접근.
- claim·complete·fail Supabase RPC(2번 lease 규칙 포함)와 pgTAP 검증.

# 웹 API 모듈 (목)

선규 API(Supabase)가 붙기 전에 화면을 끝까지 만들기 위한 타입·목 데이터·편집 함수. 화면은 `index.ts`만 import한다. 통합 때 `index.ts`의 `api` 한 줄만 Supabase 구현으로 바꾼다.

## 위치

`web/src/lib/api` (PR #17의 `shared/api`를 옮김). 링크 형식 검사는 이 모듈의 `url.ts` 대신 `@/lib/shorts`(`checkShortsUrl`)를 쓴다. MVP는 Shorts 링크만 받는다(docs/ux-flow.md S2).

```ts
'use client';
import { api, STAGE_LABEL, failGuide, toEditable } from '@/lib/api';
import { checkShortsUrl } from '@/lib/shorts';
```

목은 브라우저 `localStorage`를 쓰므로 클라이언트 컴포넌트에서만 부른다.

## 파일

| 파일 | 내용 |
|---|---|
| `types.ts` | `RecipeApi`(함수 목록), Job·Run·UserRecipe 등 타입 |
| `mock.ts` | 목 구현. 링크별 시나리오(`MOCK_LINKS`) |
| `labels.ts` | 처리 단계 문구, 실패 안내 7종(Figma 문구표 수정안 13-111), `failGuide(job)` |
| `editable.ts` | 확인·수정 화면 편집 함수(수정·추가·삭제·되돌리기·저장 가능 여부) |
| `fixtures.ts` | 목 레시피(직접 만든 가짜 fixture의 출력) |

## 화면별로 부르는 함수

| 화면 | 함수 |
|---|---|
| S2 링크 입력 | `checkShortsUrl`(`@/lib/shorts`) → `api.createJob` |
| S3 처리 중·실패 안내 | `api.getJob` 1~2초마다, `STAGE_LABEL`, 실패면 `failGuide(job)` + `ACTION_LABEL`. `partial_recipe`면 `job.runId`로 "찾은 만큼 보기" |
| S4 확인·수정 | `api.getRun`·`api.getUser` → 로그인 안 했으면 보기만, 했으면 `toEditable` → `editIngredient`·`addStep`·`revertItem` 등, `canSave` |
| S4 저장 | `api.saveRecipe` (로그인한 사람만 저장 버튼이 보인다) |
| S1 레시피북 | `api.listMyJobs`(만드는 중 카드), `api.listRecipes` |
| S5 상세 | `api.getRecipe`, `api.updateRecipe`, `api.deleteRecipe` |
| 공개 링크 `/r/<runId>` | S4와 같은 주소. 로그인 안 했으면 `api.getRun` 결과를 보기만 한다 |

## 목 시나리오

| 링크 | 결과 |
|---|---|
| `MOCK_LINKS.success` 및 그 밖의 YouTube 링크 | 약 5초 뒤 성공, 고추장 목살덮밥 |
| `MOCK_LINKS.retryable` | `retryable` → 잠시 문제가 생겼어요 |
| `MOCK_LINKS.notPlayable` | `unavailable`·`not_playable` → 이 영상은 열 수 없어요 |
| `MOCK_LINKS.noCaptions` | `unavailable`·`no_captions_no_description` → 자막이 없어서 읽을 수 없어요 |
| `MOCK_LINKS.notARecipe` | `not_a_recipe` → 요리 영상이 아닌 것 같아요 |
| `MOCK_LINKS.partialRecipe` | `insufficient`·`partial_recipe` → 찾은 정보가 적어요. `runId`가 있어 S4 부분 결과(조리 순서 0개)를 열 수 있다 |
| `MOCK_LINKS.emptyRecipe` | `insufficient`·`empty_recipe` → 레시피를 찾지 못했어요 |
| `MOCK_LINKS.internal` | `internal` → 서비스에 문제가 생겼어요 |
| `MOCK_LINKS.unsupported` | `unsupported_source` → 링크로 가져올 수 없어요(문구표에 없어 원본 문구) |

로그인은 `signInWithGoogle`을 부르면 바로 로그인된 상태로 `returnTo`를 다시 연다. 실제 구글 로그인처럼 페이지가 새로 열린다. 데이터를 지우려면 브라우저 저장소의 `mock-api-v1`을 지운다.

## 아직 정해지지 않은 것

- 항목 ID 형식(`ing-1`, `step-1`)과 `user_entered`: KAN-9(스키마 v0.2) 합의 전 임시안
- `partial_recipe`일 때 찾은 만큼의 결과: 목은 실패 job에 `runId`를 붙여 준다. 실제로 어디에 저장할지는 워커 계약(#14)에서 미정
- 자막 없음의 error_code: #14는 `unavailable`, Figma 문구표는 `insufficient`로 적혀 있다. `failGuide`는 reason으로 골라서 둘 다 같은 문구가 나온다
- 자동 재시도 중 안내(S3 처리 중 수정안): 지금 Job에 재시도 횟수가 없어 표시할 수 없다
- DB 쪽은 `supabase/migrations/` 초안(별도 PR)과 이름을 맞췄다

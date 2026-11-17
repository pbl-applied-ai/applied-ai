# 화면별 정보 v0.4 (KAN-72)

작성: 김선규 · 2026-11-14 · 수정: 2026-11-17 · 팀 검토용
기준: **확정 플로우 "applied ai 플로우 v3"**(14장, 앱 이름 pinch, 영어 화면), `web/src/lib/api/types.ts`, `supabase/migrations/`, 스키마 v0.2.
변경(v0.2): v0.1은 UX v0.7(한 화면 홈)을 기준으로 썼다. 확정 플로우 v3에 맞춰 화면 목록·정보·API를 다시 썼다. v3가 기존 결정과 다른 곳은 [3절](#3-기존-결정과-다른-곳-팀-확인)에 모았다.
변경(v0.4, 11/17): 구현(#63·후속)에 맞춤. 카테고리 붙이기는 저장 함수 인자 대신 `set_recipe_categories`(저장 뒤 이어서 부름), 재료에 `has_estimate`(로그인 전 잠금 배지, #64 시안), 추천 목록의 업로드 원본 주소는 null.
변경(v0.3, 11/16): 7절 응답 타입 추가. 3절 결정 반영(유란 11/15, 수빈 11/16: 로그인 전 추정값은 빼기 그대로, 하루 한도 10/3개 + 로그인 전 전체 상한, 서비스 OCR 켬). 4절·7절 서로 안 맞던 곳 정리, 출처 칩 우선순위, `get_run` 권한 다시 주기, Home [+] 저장 흐름(#57 수빈 리뷰).
목적: 화면마다 **무엇을 보여 주고, 어느 데이터에서, 어느 API로 가져오는지**. 없는 API·필드는 [KAN-73](#4-kan-73에서-만들-것). 유란은 이 표대로 목업으로 먼저 만들고 월요일에 실제 API로 바꾼다.

> 표기: **있음** = main에 있다 · **바꿈** = 있지만 고친다 · **없음** = 새로 만든다 · **보류 제안** = 월요일 범위에서 빼자는 제안(6절)

## 1. 확정 플로우

하단 탭 3개 **[Home / + Convert / Recipe book]**. 설정은 Home 오른쪽 위 톱니.

| # | 화면 (v3 쪽) | 하는 일 | 예전 이름 |
|---|---|---|---|
| H | Home (1) | 검색, 카테고리 칩, Trending now 카드 | S6 |
| D | Recipe 상세·공개 보기 (2) | 큰 사진, 요리 정보, 인분 조절, 재료, 저장 | 공개 보기 `/r/<runId>` |
| C | Convert (3) | 링크 붙여넣기 → 영상 미리보기 → 변환, 하루 횟수, 파일 업로드 | S2 |
| P | Converting (4) | 진행률 %, 4단계 중 몇 번째, 떠나도 됨 | S3 |
| F | 실패 (5) | 실패 이유, 파일 업로드 / 다른 링크 | S3 실패 |
| R | Review recipe (6·7) | 추정 분량 안내, 인분 조절, 재료(출처 표시·추정), 단계, 저장 | S4 |
| L | 로그인 시트 (8) | 저장할 때 아래에서 올라옴. Google / Not now | S0 |
| K | 카테고리 고르기 시트 (9) | 저장할 카테고리 여러 개, 새 카테고리 | 새 화면 |
| B | Recipe book (10·11·12) | 카테고리 칩·개수, 정렬, 카드(확인할 분량 수), 변환 중 카드 / 로그인 전 / 빈 상태 | S1 |
| T | Settings (13) | 이름, 단위, 기본 인분, 알림, 지원, 로그아웃, 계정 삭제 | 새 화면 |

```
Home ──카드──▶ D 상세 ──Save──▶ (로그인 전) L 로그인 시트 ──▶ K 카테고리 ──▶ Recipe book
  │
  └─ + Convert ─▶ C 링크·미리보기 ─▶ P 변환 중 ──성공──▶ R 확인 ──Save──▶ (L) ──▶ K ──▶ Recipe book
                                         │  └─떠나기─▶ Recipe book의 변환 중 카드
                                         └─실패──▶ F ─▶ 파일 업로드 / 다른 링크
Recipe book 카드 ─▶ 저장한 레시피(R과 같은 배치, 고치기)
```

## 2. 화면별 정보

### H Home

| 보여 줄 것 | 데이터 | API | 상태 |
|---|---|---|---|
| "What should I cook today?", 설정 톱니 | 고정 | - | 있음 |
| 검색 "Search recipes or ingredients" | 추천 레시피의 요리명·재료 이름 | 추천 목록을 받아 **웹에서 거름**(20~40편이라 서버 검색 불필요) | 없음 (추천 목록에 재료 이름 포함) |
| 카테고리 칩 All / Pasta / Dessert / Late night / Vegan | 추천 레시피의 카테고리 태그 | 추천 목록 | 없음 (3절 8번: 11/14 정한 묶음 4개와 맞추기) |
| Trending now 카드: 사진, ▶Shorts 표시, 요리명, 재료 요약("Ramen, egg, bacon, cheese"), 시간, [+] 바로 저장 | `thumbnail_url`, 플랫폼, `title`, 재료 이름 앞 3~4개, 시간 | `list_featured()` | 없음 |
| [+] 바로 저장 흐름 | `saveRecipe`는 레시피 전체가 필요해서 `getRun(runId)`를 먼저 부르고 `EditableRecipe`로 바꿔 저장. 로그인 전이면 L 로그인 시트 → K 카테고리 시트. 이미 저장했으면(`myRecipeId`) [+] 대신 저장됨 표시 | `getRun` → `saveRecipe` | 있음(웹 연결만) |
| "12K saves" | 이 run을 저장한 사람 수 | `list_featured()`의 `save_count` | 없음 (3절 6번) |
| 카드 누르면 D | `runId` | `/r/<runId>` | 있음 |

### D Recipe 상세·공개 보기 (`/r/<runId>`, 로그인 전에도 열림)

| 보여 줄 것 | 데이터 | API | 상태 |
|---|---|---|---|
| 큰 사진, 영상 길이 "▶0:21" | 썸네일 주소, `bundle.source.duration_ms` | `get_run` | **바꿈**: `get_run`은 `recipe`만 준다. `thumbnail_url`·`creator`·`duration_ms`·`platform` 추가 |
| 요리명, "YouTube Shorts · @creator" | `recipe.title`, `bundle.source.channel`, 플랫폼 | `get_run` | 바꿈 (위와 같음) |
| "Saved 12K" | 저장 수 | `get_run` + `save_count` | 없음 (3절 6번) |
| Cook time "10 min" | **없음.** 스키마·파이프라인에 조리 시간이 없다 | - | 3절 5번 |
| Servings −1+ | `recipe.servings_raw`(대부분 null → 1로 시작) | 웹 계산 | 3절 3번 |
| 재료: 이름, 분량 / "≈ 1 pack · Pinch estimate" | `amount_raw`(confirmed), `amount_estimate.text` | `get_run` | 있음. **로그인 전에는 서버가 추정값을 뺀다**(#45 그대로, 3절 1번 결정). 로그인 전 화면은 확인 안 된 분량을 빈칸으로 |
| [Save to recipe book] | - | 로그인 전이면 L, 후면 K → `saveRecipe` | 있음(카테고리는 없음) |
| "Watch original video" | `Run.sourceUrl` | `get_run` | 있음 |

### C Convert

| 보여 줄 것 | 데이터 | API | 상태 |
|---|---|---|---|
| 링크 입력, "Works with YouTube Shorts / Instagram Reels" | 입력 문자열(형식 검사는 웹) | - | 있음 |
| 붙여 넣으면 미리보기 카드: 요리 영상 제목, "@creator · 0:21" | 영상 제목·채널·길이 | **없음**: YouTube oEmbed(제목·채널, 길이 없음)를 서버 함수로 | 3절 9번 |
| "1 of 3 today" | 오늘 만든 횟수 / 하루 한도 | `create_job`이 한도 검사, `get_quota()`가 남은 횟수 | 없음 (3절 7번) |
| [Convert to recipe] | - | `createJob(url)` → P | 있음 |
| [Upload a video file instead] | 파일 | `createUploadJob(file)`(로그인 필요) | 있음 |
| 이미 변환된 영상이면 바로 R | `getJob`이 처음부터 `succeeded` | `getJob` | 있음 |

### P Converting

| 보여 줄 것 | 데이터 | API | 상태 |
|---|---|---|---|
| 제목 "Bacon egg & cheese ramen in 10 min" | 미리보기 제목(C에서 받은 것) | 웹 상태 | 미리보기 없으면 "Converting…" |
| 62%, "Step 3 of 4" + 4단계 목록 | `Job.stage`: `collect`→1 Getting the video, `asr`→2 Listening to the audio, `ocr`→3 Reading on-screen text & captions, `structure`·`finalize`→4 Writing the recipe. %는 단계로 정한 값(예: 15/40/65/90) | `getJob` 1~2초마다 | 있음 (단계 건너뛰면 ✓ 처리. 서비스는 OCR을 켠다(3절 11번). 평가 실행처럼 OCR이 꺼진 경우에만 3단계를 바로 ✓) |
| "You can leave this screen. We'll notify you…", [Keep browsing] | - | 알림은 3절 10번 | 떠나기는 있음, 알림 없음 |

### F 실패

| 보여 줄 것 | 데이터 | API | 상태 |
|---|---|---|---|
| "We couldn't open this link" + 이유, 넣은 링크 | `errorCode`·`reason`, 넣은 링크(웹이 기억) | `getJob` | 있음. 영어 문구로 `labels.ts` 바꿈 |
| [Upload the video file] / [Try another link] | 업로드로 만든 작업이면 [Upload another file] | 웹 상태 | 있음 |
| `retryable`이면 [Try again] | 같은 링크 [다시 시도] 2번까지(5절) | `createJob` | 있음 |

### R Review recipe (확인·수정)

| 보여 줄 것 | 데이터 | API | 상태 |
|---|---|---|---|
| 썸네일, 요리명, "YouTube Shorts · @creator", "Watch original · 0:21" | D와 같음 | `get_run` | 바꿈 (D와 같음) |
| "3 amounts are Pinch estimates. Check them before saving." | 쓰지 않은 추정값 수 | `estimateCount`(#53) | 있음 |
| Servings −1+ "As shown in the video" / "Scaled from 1 · estimates scale too" | `servings_raw`, 분량 숫자 읽기 | 웹 계산 | 3절 3번 |
| "13 items · 8 shown" | 재료 수, 처음엔 8개만 | 웹 | 있음 |
| 재료 줄: 이름, **출처 칩(On-screen / Voice)**, 분량 | 확정 분량이 나온 근거 종류. 근거 ID 접두어(`asr-`→Voice, `ocr-`→On-screen, `desc-`·`comment-`·`title-`→Description) 중 **분량 글자가 든 구간**. 여러 종류에 다 있으면 **On-screen > Voice > Description** 순으로 하나 | 분량 글자를 찾으려면 bundle 원문이 필요 → 서버가 `amount_source`를 계산해 `get_run`에 넣는다 | 없음 (3절 2번) |
| 추정 줄: 분홍 칸 "≈ 1 pack · Pinch est." | `amount_estimate` | `get_run` | 있음 (#53 표시만 새 디자인으로) |
| Steps "3 steps ›" (따로 펼침) | `steps` | `get_run` | 있음 |
| 고치기(이름·분량·단계) | `EditableRecipe` | 웹 상태 | 있음. 로그인 전 고치기는 3절 4번 |
| [Save to recipe book] | 로그인 전 → L → K, 후 → K | `saveRecipe` + 카테고리 | 바꿈 (카테고리) |

### L 로그인 시트 (저장할 때)

| 보여 줄 것 | 데이터 | API | 상태 |
|---|---|---|---|
| "Save it to your recipe book", 장점 3개(Recipe book / Any device / Alerts), [Continue with Google], [Not now] | - | `signInWithGoogle(returnTo)` | 있음 |
| "Your edits stay exactly as they are." | 로그인 전 고친 내용 | 로그인하러 나갔다 와도 남도록 **localStorage에 초안 저장** | 없음(웹) |
| Terms·Privacy 링크 | 정적 페이지 | - | 없음 (페이지 두 개) |

### K 카테고리 고르기 시트

| 보여 줄 것 | 데이터 | API | 상태 |
|---|---|---|---|
| 내 카테고리 목록: 이모지, 이름, 레시피 수, 체크 | `categories(id, name, emoji)` + 개수 | `list_categories()` | 없음 |
| + New category | 이름·이모지 | `create_category(name, emoji)` | 없음 |
| [Save] | 레시피 + 고른 카테고리(0개도 됨) | `save_recipe` → 이어서 `set_recipe_categories(recipe_id, category_ids)` | 있음(KAN-73 후속) |

### B Recipe book

| 보여 줄 것 | 데이터 | API | 상태 |
|---|---|---|---|
| 전체 수 "12", 칩 "All 12 / Pasta 4 / Dessert 3 …" | 카테고리별 개수 | `list_categories()` | 없음 |
| 정렬 "Recently saved ▾", 격자/목록 전환 | 저장일·수정일·이름 | 웹에서 정렬 | 있음 |
| 카드: 사진, 요리명, "10 min · YouTube Shorts", **"3 to check"** | `thumbnail_url`, `title`, 플랫폼, 아직 확인 안 한 분량 수(`unconfirmedCount`), 시간 | `list_recipes()` | **바꿈**: `sourceUrl`·플랫폼·카테고리·썸네일 추가 (4절 3번). 시간은 3절 5번 |
| 변환 중 카드: "62% Reading captions…", 요리명, "Converting · YouTube Shorts" | `Job` + 미리보기 제목 | `listMyJobs()` | 있음 (제목은 웹이 기억) |
| 로그인 전: "Sign in to see your recipe book" + "You can still convert videos without an account." | `getUser()` | - | 있음 |
| 빈 상태: "No recipes saved yet" + [Convert a video] | 목록 0개 | - | 있음 |

### T Settings

| 보여 줄 것 | 데이터 | API | 상태 |
|---|---|---|---|
| 이름, "Signed in with Google" | 구글 이름 `user_metadata.full_name` | `getUser()` | **바꿈**: `User.name` 추가 |
| Units Metric / US | 사용자 설정 | `user_settings` | 없음. 표시는 #51 `units.ts`(US → ml·g 참고값)를 쓴다 |
| Default servings −2+ | 사용자 설정 | `user_settings` | 없음 (3절 3번과 같이) |
| Recipe ready alerts | 사용자 설정 | `user_settings` | 3절 10번 |
| Send feedback / Privacy / Terms / About, Version 0.1.0 | 링크·정적 페이지, 앱 버전 | - | 없음(정적) |
| Sign out | - | `signOut()` | 있음 |
| Delete account | 내 레시피·카테고리·설정·계정 삭제 | `delete_account()`(서버 함수, auth 사용자 삭제는 service role) | 없음 |

## 3. 기존 결정과 다른 곳 (팀 확인)

v3를 확정으로 보면 아래 결정을 바꾸는 것이다. 바꿀지, v3에서 뺄지 정해야 구현할 수 있다. 제안은 월요일 연결 목표 기준.

| # | v3 | 지금 결정 | 영향 | 제안 |
|---|---|---|---|---|
| 1 | 로그인 전 공개 보기(D)에도 추정값 "≈ … · Pinch estimate" | 로그인 전에는 서버가 추정값을 뺀다(#45 `hide_estimates_public`, #31 리뷰) | 마이그레이션 되돌림 + pgTAP 009 수정 | **결정(11/16 수빈): 지금처럼 로그인했을 때만 보여 준다.** #45 그대로라 마이그레이션·pgTAP는 안 바꾼다. 로그인 전 공개 보기는 빈칸. "로그인하면 Pinch estimate를 볼 수 있어요" 안내를 넣을지는 유란이 정한다 |
| 2 | 재료마다 출처 칩 On-screen / Voice | 근거·출처는 화면에 안 보인다(UX v0.7 1절, #8 확정) | 서버가 분량 출처를 계산해 줘야 함. On-screen은 OCR이 켜져 있어야 나온다(지금 꺼짐) | **v3대로 보여 주기**, 칩 종류는 Voice / On-screen / Description 3개. OCR 기본값을 켤지는 11번 |
| 3 | 인분 조절, "estimates scale too" | 분량은 원문 그대로, 단위·숫자 안 바꿈 | 분량 숫자 읽기(한국어 "1큰술", "반 개", 영어 "1 1/2 cups")를 웹에서 해야 함. 파이프라인 `ingredients.mjs`의 읽기를 웹으로 옮겨야 함 | 조절한 값은 **화면 표시만**, 저장은 원문. "Scaled from 1" 표시 유지. "약간"·"to taste"처럼 숫자 없는 분량은 그대로. 기준 인분이 영상에 없으면 1 |
| 4 | 로그인 전에도 고치고, 저장할 때 로그인("Your edits stay") | 로그인 전에는 보기만, 고치려면 로그인(10/28 KAN-32) | 고친 초안을 localStorage에 두고 로그인 뒤 이어서 저장 | **v3대로.** 서버 변경 없음, 웹 작업만 |
| 5 | Cook time "10 min" | 스키마·파이프라인에 조리 시간 없음 | 넣으려면 프롬프트 v9 → 기본 점수·파인튜닝 다시 | **보류 제안**: 시간 자리에 영상 길이 "0:21"을 쓰거나 비움. 프롬프트는 KAN-26·58 끝난 뒤 |
| 6 | "12K saves", "Saved 12K" | 저장 수 집계 없음 | `user_recipes`를 run별로 세면 됨. 처음엔 수가 작다 | 서버는 `save_count`를 주고, 화면은 **10 미만이면 숨김**. 가짜 숫자는 쓰지 않는다 |
| 7 | "1 of 3 today" 하루 변환 한도 | 한도 없음 | `create_job`에서 사용자별 하루 개수 검사. 로그인 전은 사람 구분이 안 됨 | **결정(11/16 수빈):** 로그인 사용자 하루 **10개**(`create_job`에서 서버가 막음), 로그인 전은 이 브라우저 기준 **3개**(웹 표시). `create_job`은 `anon`도 부를 수 있어 웹 제한은 RPC 직접 호출을 못 막으므로, **로그인 전 전체 합계를 하루 50개**로 서버가 막는다(넘으면 오류). 1건 $0.03~0.04 기준 하루 $2 안쪽. 데모 전까지 |
| 8 | Home 칩 All / Pasta / Dessert / Late night / Vegan | 11/14 정한 추천 묶음 4개(땡스기빙·크리스마스·가성비·간단하고 맛있는) | 추천 목록의 카테고리 태그 | 칩을 **All / Thanksgiving / Christmas / Budget / Quick & easy**로. 시안의 Pasta 등은 예시로 본다 |
| 9 | Convert 미리보기(제목·채널·길이) | 없음 | 서버 함수로 YouTube oEmbed. 길이는 oEmbed에 없음 | 제목·채널만. 길이는 변환 뒤 |
| 10 | "We'll notify you", Alerts 설정 | 알림 없음 | 웹 푸시(서비스 워커·키) 또는 메일 | **보류 제안**: 월요일엔 Recipe book 변환 중 카드로. 문구는 "Find it in your recipe book"으로 |
| 11 | P 3단계 "Reading on-screen text", 출처 On-screen | OCR 꺼짐(#52, 평가는 OCR 끔) | 켜면 영상당 15~20초·비용 증가 | **결정(11/16 수빈): 서비스는 OCR을 켠다**(데모 워커 `OCR=on`). 평가셋 v1.0은 계속 끄고 잰다. 출처 칩 On-screen도 실제로 나온다 |
| 12 | 화면 언어 영어, 앱 이름 pinch | UX v0.7은 한국어 문구 | `labels.ts` 문구 전부 | v3대로 영어. 레시피 내용은 영상 언어 그대로 |

**11/15 확인(유란, #57):** 1·2·4·8·12번은 제안대로. 2번 칩은 Voice / On-screen / Description, `amount_source`가 없으면 칩을 숨긴다. 3번 인분 조절은 **월요일엔 보류**(화면에는 "As shown in the video"만, −/+는 다음에). 11번은 수빈 결정을 따른다.

**11/16 결정(수빈, #57):** 1번 추정값은 로그인했을 때만(#45 그대로). 7번 하루 한도 로그인 10개 / 로그인 전 브라우저 3개 + 로그인 전 전체 하루 50개. 11번 서비스 OCR 켬(평가는 끔). 나머지는 유란 정리대로.

## 4. KAN-73에서 만들 것

| # | 무엇 | 화면 | 내용 |
|---|---|---|---|
| 1 | **추천 목록** `list_featured()` | H | `[{ run_id, title, creator, platform, source_url, duration_ms, thumbnail_url, ingredient_names[], ingredient_count, step_count, categories[], save_count }]`. 팀이 `featured_runs(run_id, categories text[], position)`에 넣는다. 제목·재료는 `runs.recipe`, 채널·길이는 `runs.bundle.source` |
| 2 | **`get_run` 응답 늘리기** | D, R | `creator`, `platform`, `duration_ms`, `thumbnail_url`, `save_count`, `my_recipe_id`(로그인했고 저장했으면), 재료마다 `amount_source`(voice / on_screen / description, 3절 2번). 로그인 전에는 추정값을 뺀다(#45 그대로) |
| 3 | **`list_recipes(p_limit, p_category_id)`** | B | `id, run_id, title, ingredient_count, step_count, unconfirmed_count, source_url, platform, thumbnail_url, category_ids[], created_at, updated_at`. `runs`는 웹에서 직접 못 읽어서 RPC로 |
| 4 | **카테고리** | K, B | 테이블 `categories(id, user_id, name, emoji)`, `recipe_categories(recipe_id, category_id)` + RLS. `list_categories()`(개수 포함), `create_category`, `set_recipe_categories(p_recipe_id, p_category_ids)`(저장·수정 뒤 이어서 부름, 내 레시피·내 카테고리만). 표 트리거가 주인이 다른 연결을 막는다 |
| 5 | **이 run을 저장했는지** | D, R | 따로 RPC를 두지 않고 2번 `get_run`의 `my_recipe_id`로. 저장 버튼을 "Saved"로 |
| 6 | **사용자 설정** `user_settings(user_id, units, default_servings, alerts)` + `get/set_settings` | T | |
| 7 | **계정 삭제** `delete_account()` | T | 내 데이터 삭제 + auth 사용자 삭제(Edge Function, service role) |
| 8 | 하루 한도 | C | `create_job` 검사: 로그인 사용자 하루 10개, 로그인 전(`auth.uid()` 없음) 전체 합계 하루 50개. 넘으면 `create_job` 오류(웹은 "daily limit" 안내). `get_quota()`는 로그인 사용자의 오늘 개수·한도. 데모 전까지 |
| 9 | (3절 9번) 링크 미리보기 | C | Edge Function: YouTube oEmbed → `{ title, creator }` |
| 10 | 웹 타입 v0.2 | 전부 | `TeamRecipe` v0.2(`id`·`partial`), `Run`에 2번 필드, `RecipeSummary`에 3번 필드, `User.name` |

- 순서 제안: **1·2·3·5 → 4 → 8 → 6·7** (월요일 연결에 필요한 것 먼저, 8번은 데모 전). 9번은 보류.
- 5번은 따로 RPC를 두지 않고 2번 `get_run` 응답의 `my_recipe_id`로 합쳤다(호출 하나 줄임). 응답 타입은 [7절](#7-응답-타입-kan-73-14번).
- 모두 pgTAP 테스트 + 배포 DB 적용 목록(`supabase/README.md`)까지. 응답 타입(1·2·3·4번)은 구현 전에 유란에게 먼저 보낸다.
- 썸네일 주소: YouTube는 `https://i.ytimg.com/vi/<id>/hqdefault.jpg`를 서버가 만들어 준다. Instagram·업로드는 `null` → 요리명 글자 카드.
- 추천 레시피 데이터: 4묶음 × 5편 ≈ 20편 변환(유료 호출 약 20번, 서비스와 같게 OCR 켬). 평가셋 영상은 쓰지 않는다.

## 5. 정한 것 (11/14)

| 항목 | 정한 것 |
|---|---|
| 추천 묶음 | 땡스기빙 · 크리스마스 · 가성비 · 간단하고 맛있는, 묶음마다 5편 안팎(Home 칩은 3절 8번) |
| 썸네일 | YouTube 썸네일 주소를 그대로 띄우고 크리에이터·원본 링크를 같이 둔다. 받아 저장하지 않는다. Instagram·업로드는 글자 카드. 원작자 요청 시 내린다 |
| 실패한 변환 중 카드 | 실패 화면을 한 번 열었거나 24시간 지나면 숨김(웹) |
| 다시 시도 | 워커 자동 재시도(최대 3번)와 별개로 사용자 [Try again]은 같은 링크에 2번까지 |
| 로그인 전 작업 기억 | 최근 5개, 7일. 결과를 열면 목록에서 뺌 |

## 6. 월요일(11/16) 범위 제안

| 넣기 | 보류(데모 전 다시 봄) |
|---|---|
| H(검색은 웹 거르기), D, C(미리보기·한도 빼고), P, F, R(출처 칩 포함), L, K, B, T(이름·로그아웃·정적 링크) | Cook time(3절 5번), 인분 조절(3번), 알림(10번), 하루 한도(7번), 링크 미리보기(9번), 설정의 단위·기본 인분·계정 삭제 |

## 7. 응답 타입 (KAN-73 1~4번)

유란이 이 모양대로 목업(`mock.ts`)을 먼저 만들고, 선규가 같은 모양으로 RPC를 만든다. 웹 타입은 camelCase, RPC 응답은 snake_case이고 `supabase.ts`가 바꾼다(지금 `JobRow` → `Job`과 같은 방식). 구현하면서 바뀌면 이 절을 먼저 고친다.

### 공통

```ts
export type Platform = 'youtube' | 'instagram' | 'upload';

// 재료 분량이 나온 곳(3절 2번). 확정 분량의 글자가 든 근거 구간의 종류로 서버가 정한다.
// asr → voice, ocr → on_screen, desc·comment·title → description. 분량 글자가 여러 종류 구간에 다 있으면
// on_screen > voice > description 순으로 하나. 확정 분량이 아니면 null → 칩을 숨긴다.
export type AmountSource = 'voice' | 'on_screen' | 'description';

// Home 칩(3절 8번). 칩 글자·이모지는 웹 상수로 둔다: All / Thanksgiving / Christmas / Budget / Quick & easy
export type FeaturedCategory = 'thanksgiving' | 'christmas' | 'budget' | 'quick';

// 썸네일: YouTube는 서버가 `https://i.ytimg.com/vi/<영상 ID>/hqdefault.jpg`를 만든다. Instagram·업로드는 null → 요리명 글자 카드.
```

### 1. 추천 목록 — `listFeatured()` / RPC `list_featured()` (로그인 없이)

```ts
export interface FeaturedRecipe {
  runId: string;
  title: string;                 // recipe.title
  creator: string | null;        // bundle.source.channel. 원본 링크와 함께 항상 보여 준다
  platform: Platform;
  sourceUrl: string | null;      // 업로드면 null(추천에는 거의 없음)
  durationMs: number | null;     // bundle.source.duration_ms. 카드의 "10 min" 자리는 3절 5번 결정 전까지 영상 길이 또는 비움
  thumbnailUrl: string | null;
  ingredientNames: string[];     // 전부. 카드에는 앞 4개("Ramen, egg, bacon, cheese"), 검색은 전부
  ingredientCount: number;
  stepCount: number;
  categories: FeaturedCategory[];// 한 레시피가 여러 칩에 들어갈 수 있다
  saveCount: number;             // 저장한 사람 수. 10 미만이면 화면에서 숨김(3절 6번)
}

listFeatured(): Promise<FeaturedRecipe[]>; // Trending 순서(팀이 정한 position). 칩·검색은 웹에서 거른다
```

- #56의 `listRecommendations(): RecommendationGroup[]`는 v3 Home(칩 + Trending 한 줄)에 맞춰 이걸로 바꾼다.
- 서버: `featured_runs(run_id, categories text[], position int)`를 팀이 채운다. `list_featured()`는 `runs`와 묶어 위 필드를 돌려준다.

### 2. 레시피 상세 — `getRun(runId)` / RPC `get_run(p_run_id)` (로그인 없이, 바꿈)

```ts
export interface TeamIngredient {
  id: string;                          // 스키마 v0.2 항목 ID ('ing-1' …)
  name: string;
  name_raw?: string;
  amount_raw: string | null;
  amount_status: AmountStatus;
  amount_estimate?: { text: string; basis?: string }; // 로그인했을 때만 온다(#45 그대로, 3절 1번)
  has_estimate?: true;                 // 추정값이 있으면 로그인 전에도 온다 → 로그인 전 잠금 배지 "Sign in to see"(#64 시안)
  amount_source?: AmountSource | null; // 새 필드. 저장된 recipe가 아니라 get_run이 계산해서 붙인다
  optional?: boolean;
  evidence: string[];
}

export interface TeamStep { id: string; order: number; text: string; evidence: string[] }

export interface TeamRecipe {
  schema_version: '0.2';
  video_id: string;
  title: string;
  servings_raw?: string | null;
  partial?: boolean;
  ingredients: TeamIngredient[];
  steps: TeamStep[];
}

export interface Run {
  id: string;
  sourceUrl: string;
  recipe: TeamRecipe;
  partial: boolean;
  createdAt: string;
  // 새 필드
  platform: Platform;
  creator: string | null;
  durationMs: number | null;
  thumbnailUrl: string | null;
  saveCount: number;
  myRecipeId: string | null;           // 로그인했고 이 run을 저장했으면 내 레시피 ID → 버튼 "Saved"(4절 5번)
}
```

- `get_run`의 반환 열이 바뀌어서 `create or replace`가 안 되고 함수를 지우고 다시 만든다. 다시 만든 뒤 `revoke execute ... from public` + `grant execute on function public.get_run(uuid) to anon, authenticated`를 다시 준다(지우면 권한도 같이 사라진다). 공개 링크·S4가 같이 쓰므로 같은 PR에서 `supabase.ts`를 맞춘다.

### 3. 레시피북 목록 — `listRecipes(options)` / RPC `list_recipes(p_limit, p_category_id)` (로그인 필요)

```ts
export interface RecipeSummary {
  id: string;
  runId: string;
  title: string;
  ingredientCount: number;
  stepCount: number;          // 새 필드
  unconfirmedCount: number;   // "N to check": 분량이 비어 있는 재료 수(지금 editable.ts unconfirmedCount와 같은 뜻)
  sourceUrl: string;          // 새 필드. 업로드는 'upload:<id>'
  platform: Platform;         // 새 필드
  thumbnailUrl: string | null;// 새 필드
  categoryIds: string[];      // 새 필드
  createdAt: string;
  updatedAt: string;          // 새 필드. 정렬용
}

listRecipes(options?: { limit?: number; categoryId?: string }): Promise<RecipeSummary[]>; // 최근 저장 순
```

### 4. 카테고리 — 로그인 필요

```ts
export interface Category {
  id: string;
  name: string;            // 1~30자, 내 카테고리 안에서 대소문자 무시하고 겹치지 않음
  emoji: string | null;
  recipeCount: number;     // 칩 "Pasta 4", 시트 "4 recipes"
  createdAt: string;
}

listCategories(): Promise<Category[]>;                                  // RPC list_categories()
createCategory(input: { name: string; emoji?: string | null }): Promise<Category>; // RPC create_category(p_name, p_emoji). 같은 이름이면 오류
saveRecipe(draft: EditableRecipe, options?: { categoryIds?: string[] }): Promise<{ id: string }>; // save_recipe → set_recipe_categories(id, categoryIds)
updateRecipe(id: string, draft: EditableRecipe, options?: { categoryIds?: string[] }): Promise<void>; // update_recipe → categoryIds가 있으면 set_recipe_categories. undefined면 카테고리 그대로
```

- 카테고리 이름 바꾸기·지우기는 v3에 없어서 이번엔 만들지 않는다.
- 사용자 한 명당 카테고리 최대 20개.

### 같이 바뀌는 것

```ts
export interface User { id: string; email: string | null; name: string | null } // name: 구글 user_metadata.full_name
```

### 목업 예시

```json
{
  "runId": "00000000-0000-0000-0000-00000000f001",
  "title": "Bacon egg & cheese ramen",
  "creator": "@sample.kitchen",
  "platform": "youtube",
  "sourceUrl": "https://www.youtube.com/shorts/Smpl0Ramen1",
  "durationMs": 21000,
  "thumbnailUrl": "https://i.ytimg.com/vi/Smpl0Ramen1/hqdefault.jpg",
  "ingredientNames": ["ramen noodles", "egg yolk", "bacon", "cheese", "sriracha", "mayonnaise", "half and half", "water"],
  "ingredientCount": 8,
  "stepCount": 3,
  "categories": ["quick"],
  "saveCount": 0
}
```

목업은 가짜 영상 ID(`Smpl0…`)만 쓴다. 실제 영상의 제목·자막을 넣지 않는다.

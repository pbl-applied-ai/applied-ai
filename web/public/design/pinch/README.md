# Pinch 화면 시안 설명 v0.5

작성: 전수빈 · 2026-11-13 · 백엔드·프론트 피드백용 · 수정: 2026-11-17
변경: v0.5 — #66 리뷰(선규) 반영. [BE] 질문을 #64 리뷰 답(#57·#63에서 정한 것)으로 바꿈, 출처 태그를 amount_source 기준(On-screen / Voice / Description)으로 고침, "N to check" 뜻을 "아직 분량이 빈 재료 수"로 맞춤.
변경: v0.4 — #64 리뷰(선규) 반영. 남의 영상 썸네일 사진 12장을 빼고 회색 상자로 바꿈, 대표 레시피를 실제 추출 결과(T-001) 대신 지어낸 레시피 "Garlic butter noodles"로 바꿈, 실제 영상 주소도 지어낸 주소로 바꿈. [BE] 질문 답은 #64 선규 리뷰에 있어.
변경: v0.3 — 시안을 저장소 `web/public/design/pinch/`로 옮김(버셀 미리보기 `/design/pinch/index.html`에서 열림), 경로 표기 수정.
변경: v0.2 — 디자인 확정(11/16). 플로우 v3(#57) 결정대로 로그인 전에는 Pinch estimate를 잠금 표시(06·07·08), 로그인 시트 문구 변경, 14번에 잠금 배지 추가.
변경: v0.1 — 피그마에 올린 14개 화면(모바일 웹)에 대한 설명 첫 작성.

피그마 화면만 봐도 흐름은 보일 텐데, 화면에 안 드러나는 동작이나 데이터 얘기는 여기 적어 둘게. 각 화면에 **[BE]**, **[FE]** 표시해 둔 부분 위주로 봐 주고, 안 되거나 비싼 거 있으면 말해 줘.

## 0. 먼저 알아 둘 것

- **앱 이름은 Pinch**로 정했어. 부제는 "Reels to recipes".
- **모바일 웹**이야. 앱 설치 없이 브라우저로 들어오는 걸 기준으로 그렸어. 화면 폭은 375px이고, 위에 있는 건 브라우저 주소창(pinch.app)이야.
- 화면 글은 **전부 영어**야(11/13 결정).
- **로그인은 저장할 때만** 받아. 들어오자마자 로그인하라고 하지 않고, 링크 넣기 → 변환 → 결과 확인·수정까지는 로그인 없이 돼. [Save to recipe book]을 누르는 순간에 구글 로그인 바텀시트가 떠(08번). `docs/ux-flow.md` v0.4에도 반영했어.
- **Pinch estimate**가 우리 차별점이야. 영상에 양이 안 나와서 AI가 추정한 값은 핑크 점선 배지(≈ 1 pack · Pinch estimate)로 표시하고, 영상에서 나온 값과 구분해서 보여줘(KAN-52).
- **추정값은 로그인한 사람한테만 보여줘**(#57 v3 결정, #45 `hide_estimates_public`). 로그인 전에는 같은 자리에 "🔒 Sign in to see" 배지만 보이고, 배너도 "3 amounts aren't in the video. Sign in to see Pinch estimates."로 바뀌어. 추정값이 로그인할 이유가 되는 구조야.
- 디자인은 이 시안으로 **확정**됐어(11/16).
- 시안의 사진 자리는 **회색 상자**야. 남의 영상 이미지는 저장소에 올리지 않아(CLAUDE.md). 대표 레시피 "Garlic butter noodles"와 다른 레시피 이름·재료·분량·저장 수(12K saves)·영상 주소는 전부 시안용으로 지어낸 값이고 실제 영상에서 나온 게 아니야.
- 카테고리 아이콘은 지금 이모지로 임시로 넣어 둔 거야. 나중에 일러스트로 바꿀 거야.

## 1. 디자인 기준 (FE)

| 항목 | 값 |
|---|---|
| 바탕 / 카드 | `#F7F6F2` / `#FFFFFF` |
| 핑크 (로고·Pinch estimate·선택 상태) | `#F48FB8`, 연한 바탕 `#FDE3EE`, 글자 `#9C2F5B` |
| 오렌지 (숫자 강조·진행률) | `#FFA53D` |
| 라임 (완료·켜짐 상태에만 조금) | `#9BDB4D`, 글자 `#1F3A0A` |
| 글자 / 테두리 | 짙은 갈색 `#3B1F1A`, 흐린 글자 `#8A7A72`, 구분선 `#E6E0D7` |
| 주요 버튼 | 검정 `#111111` 알약 모양(화면당 하나) |
| 글꼴 | 로고·큰 숫자·스티커 = **Bagel Fat One**, 나머지 = **DM Sans** (둘 다 구글 폰트) |

- 스티커는 굵은 갈색 테두리(2px)를 두른 알약 모양이야. 기울이지 않고 수평으로 둬.
- 하단 탭은 떠 있는 흰색 알약 모양이고, 가운데 Convert 버튼만 핑크 원이야.
- HTML 시안(`web/public/design/pinch/index.html`)에 CSS가 다 있으니까 값은 거기서 그대로 가져가도 돼.

## 2. 화면별 설명

### 01 Home
- 검색, 카테고리(All / Pasta / Dessert / Late night / Vegan), Trending now 카드로 구성돼 있어.
- **[BE] 정함:** Trending은 운영자가 직접 골라(`featured_runs.position` 순서). 저장 수 순으로 정렬하지 않아. 홈 추천은 Should라서 데모에서 빠질 수도 있어.
- **[BE] 정함:** Home 검색은 추천 목록 안에서만 찾아(웹에서 거름). 레시피북 검색은 v3에 없어.

### 02 Recipe detail
- 영상 대표 사진, 조리 시간 / 인분 / 영상 길이, 재료, 저장 버튼이 있어.
- **[FE]** 인분 −/+를 누르면 재료 양이 바로 다시 계산돼. 추정값도 같이 바뀌고, "a pinch"처럼 숫자가 아닌 양은 그대로 둬.

### 03 Convert
- 링크를 붙여넣으면 영상 제목·썸네일·길이를 미리 보여주고, "Link looks good ✓"를 띄운 다음에 변환을 시작해.
- **[BE] 보류:** 변환 전 미리보기 메타데이터(제목·썸네일·길이)는 보류야. oEmbed로는 제목·채널만 오고 길이는 안 와. 월요일 범위 밖이야.
- **[BE] 정함:** 오른쪽 위 "1 of 3 today"는 하루 변환 한도야. 로그인하면 하루 10개, 로그인 전에는 3개(로그인 전 사용자 전체로는 하루 50개)고, 캐시에서 바로 나온 결과는 안 세. 시안은 로그인 전 상태라 3개로 그렸어. 데모 전에 넣어.
- 링크가 안 될 때를 위해 [Upload a video file instead]도 남겨 뒀어.

### 04 Converting
- 단계 4개: Getting the video → Listening to the audio → Reading on-screen text & captions → Writing the recipe. 진행률(62%)도 같이 보여줘.
- **[BE] 정함:** 이 4단계는 `jobs.stage`(collect · asr · ocr · structure/finalize)랑 1:1로 맞아. 퍼센트는 단계마다 정해 둔 값을 써.
- 이 화면을 나가도 변환은 계속돼. 레시피북에 "변환 중" 카드로 남고(10번), 끝나면 알림을 줘. **[BE/FE]** 알림을 웹 푸시로 할지 이메일로 할지, 데모에서는 뺄지 정해야 해.

### 05 Convert failed
- 비공개·삭제·다운로드 막힘으로 영상을 못 가져왔을 때 나오는 화면이야. [Upload the video file], [Try another link]를 보여줘.
- **[BE] 정함:** 실패 이유는 이미 `error_code` + `reason`으로 내려와. 이걸 보고 문구를 상황에 맞게 바꾸면 돼.

### 06 Review recipe
- 변환 결과를 저장하기 전에 확인하는 화면이야. 이 화면은 **로그인 전 상태**로 그렸어(처음 쓰는 사람은 여기까지 로그인 없이 와).
- 맨 위 배너: 로그인 전 "3 amounts aren't in the video. Sign in to see Pinch estimates. **Sign in**" / 로그인 후 "3 amounts are Pinch estimates. Check them before saving."
- 재료마다 **어디서 나온 값인지 작은 태그**를 붙였어.
  - `On-screen` = 화면 글자(OCR), `Voice` = 말소리(ASR), `Description` = 설명란·고정 댓글, `0:04` 같은 시각 = 영상 위치
  - **[BE] 정함:** 칩은 `amount_source`(on_screen · voice · description)를 그대로 보여줘. 고정 댓글은 근거 타입이 `comment`로 따로 있지만 칩은 Description으로 보여.
- **Pinch estimate** 줄은 핑크로 칠해서 눈에 띄게 했어. 영상에 양이 없던 재료(`amount_status: unconfirmed`)에 AI 추정값을 붙인 거야.
  - 로그인 전에는 값 대신 "🔒 Sign in to see" 배지가 나와. 배지나 배너의 Sign in을 누르면 08번 로그인 시트가 떠.
  - **[BE] 정함:** 추정값은 `amount_estimate`에 담아(#45). 사용자가 직접 쓴 값은 `user_entered`로 구분해.
  - **[BE] 정함:** 로그인 전 응답에는 추정값 숫자를 아예 빼고 "추정값 있음" 표시(`has_estimate`)만 내려줘(#63, `hide_estimates_public`). 화면에서만 가리면 개발자 도구로 보이니까.
- 재료가 많으면 일부만 보여줘("13 items · 8 shown"). 단계(Steps)는 접혀 있다가 누르면 펼쳐져.
- **[FE]** 각 값은 눌러서 바로 고칠 수 있어(인라인 편집).

### 07 Review · 2 servings
- 06에서 인분을 바꾼 상태야(로그인 전). "Scaled from 1" 안내가 붙고, 잠긴 추정값 줄은 그대로 잠금이야.
- 로그인 후에는 안내가 "Scaled from 1 · estimates scale too"로 바뀌고 추정값도 같이 늘어나.

### 08 Sign in on save (bottom sheet)
- 로그인 안 한 상태에서 [Save to recipe book]이나 잠긴 추정값을 누르면 아래에서 시트가 올라와. 내용은 로고, "Save it to your recipe book", "Sign in to save it and see Pinch estimates for the 3 missing amounts.", [Continue with Google], [Not now]야.
- 로그인하고 돌아오면 잠금이 풀리고 추정값이 보여. 저장을 눌러서 왔으면 바로 09번(카테고리 선택)으로 이어져.
- **[BE/FE] 제일 중요한 부분**이야. 구글 로그인을 하고 돌아왔을 때 **고치던 내용이 그대로 저장돼야 해.** OAuth로 페이지를 이동했다 돌아와도 수정한 내용이 안 날아가게, 로컬에 임시 저장하거나 run_id 기준으로 서버에 초안을 두는 방법이 필요해.
- [Not now]를 누르면 시트만 닫히고 06번 화면에 그대로 남아.

### 09 Save to category
- 로그인한 상태에서 저장하면 카테고리를 고르는 시트가 떠. 여러 개 고를 수 있고, 새 카테고리도 만들 수 있어.
- **[BE] 정함:** 레시피 하나가 카테고리 여러 개에 들어가(다대다). 카테고리는 사용자마다 따로고, 카테고리를 하나도 안 고르고 저장해도 돼(#63 표, 다음 PR RPC).

### 10 Recipe book
- 카테고리 칩(개수 표시), 정렬(Recently saved), 2열 카드 목록이야.
- 카드 왼쪽 위 "3 to check"는 아직 분량이 빈 재료 수야. **[BE] 정함:** 레시피별 `unconfirmed_count`(#63)를 그대로 써. 저장할 때 안 쓴 추정값은 버리니까 숫자는 확인 안 한 추정값 개수랑 같아.
- 점선 카드는 변환 중인 작업이야(진행률 + 현재 단계). 누르면 04번으로 가.

### 11 Recipe book · signed out
- 로그인 안 하고 레시피북 탭을 누르면 나오는 화면이야. 안내 문구랑 구글 버튼만 있어. 변환은 로그인 없이 된다는 것도 같이 적어 뒀어.

### 12 Empty recipe book
- 로그인은 했는데 저장한 레시피가 하나도 없을 때야. [Convert a video]로 03번에 가.

### 13 Settings
- 프로필(구글 계정), 단위(Metric / US), 기본 인분, 변환 완료 알림, 피드백·약관, 로그아웃, 계정 삭제가 있어.
- **[BE] 보류:** 단위 바꾸기(Metric/US)는 보류야. 단위는 영상 원문 그대로 두고 참고값만 같이 보여줘.
- **[BE] 보류:** 계정 삭제는 레시피북 데이터까지 같이 지우게 만들 때 넣어.

### 14 Category stickers
- 화면이 아니라 부품 모음이야. 카테고리 아이콘 선택/기본 상태, 스티커 배지(12K saves / Saved! / N to check), Pinch estimate 배지, 로그인 전 잠금 배지(🔒 Sign in to see)를 모아 뒀어.

## 3. 특히 피드백 받고 싶은 것

**백엔드**
아직 안 정한 건 두 개야. 나머지 [BE] 질문은 #64 리뷰에서 정해져서 위에 "정함"·"보류"로 적어 뒀어.
1. 08번 로그인하고 돌아왔을 때 수정 내용 유지 방법
2. 04번 변환 완료 알림을 웹 푸시로 할지 이메일로 할지, 데모에서 뺄지

**프론트**
1. 바텀시트 2개(08, 09)랑 떠 있는 하단 탭이 모바일 브라우저(iOS Safari 주소창이 줄었다 늘었다 하는 것)에서 문제없는지
2. Bagel Fat One / DM Sans 웹폰트 로딩
3. 실제 화면에서 썸네일을 음식 위주로 자르는 방법(object-position 등, 이미지는 저장하지 않고 원본 주소로 보여 줌, #57)
4. 인분 바꿀 때 재계산이랑 인라인 편집을 어디서 처리할지

## 4. 파일 위치

- 피그마: 화면 14개(01~14, 플로우 순서대로)
- HTML 시안: `web/public/design/pinch/index.html` (배포 주소에서는 `/design/pinch/index.html`, 색·간격 값은 여기 CSS에 다 있어)
- 피그마용 SVG: 저장소에는 안 올림(수빈 로컬에 있음, 필요하면 말해 줘)
- 로그인 흐름: `docs/ux-flow.md` v0.4

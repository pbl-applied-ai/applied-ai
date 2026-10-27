# web

숏폼 레시피 웹 화면(Next.js App Router, TypeScript, Tailwind). 모바일 화면 기준이고, 색·폰트 다듬기는 미드 데모 후에 한다.

- 런타임: Node.js 22 이상
- 화면 기준 문서: `docs/ux-flow.md`, 와이어프레임(KAN-39 반영)

## 실행

```bash
cd web
npm install
npm run dev   # http://localhost:3000
```

검사:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## API

화면은 `@/lib/api`만 쓴다. 지금은 목(`src/lib/api/mock.ts`)이고, KAN-22 통합 때 `src/lib/api/index.ts`의 `api` 한 줄만 Supabase 구현으로 바꾼다. 타입·함수 목록·목 시나리오는 [`src/lib/api/README.md`](src/lib/api/README.md).

목에서 실패 화면 보기: 아래 영상 ID로 Shorts 링크를 넣는다(예: `youtube.com/shorts/MockNotRcp1`). 그 밖의 링크는 약 5초 뒤 성공한다.

| 영상 ID | 결과 |
|---|---|
| `MockFlaky01` | `retryable` → [다시 시도] [다른 링크] |
| `MockPrivat1`·`MockNoCap01` | `unavailable` → [다른 링크] |
| `MockNotRcp1` | `not_a_recipe` → [다른 링크] |
| `MockPartl01` | `insufficient` + 결과 있음 → [찾은 만큼 보기] [다른 링크] |
| `MockEmpty01` | `insufficient` + 결과 없음 → [다른 링크] |
| `MockIntrn01` | `internal` → [다시 시도] [다른 링크] |

## 화면

| 경로 | 화면 | 상태 |
|---|---|---|
| `/` | S2 링크 입력(첫 화면, 로그인 없음) | KAN-28 |
| `/jobs/[id]` | S3 처리 중: 1.5초마다 job 조회, 지금 단계 한 줄, 실패 안내 | KAN-29 |
| `/runs/[runId]` | S4 결과 확인·수정 | 임시 화면. KAN-30에서 구현 |
| `/book` | S1 레시피북 | 임시 화면. KAN-31·KAN-24에서 구현 |

문구 규칙은 `src/lib/job-display.ts`(테스트: `job-display.test.ts`). 단계 문구는 #14, 실패 안내는 `docs/ux-flow.md` S3 기준이다.

Shorts 링크 검사는 `src/lib/shorts.ts`(테스트: `shorts.test.ts`). 일반 YouTube `watch`·`youtu.be` 링크는 MVP에서 받지 않는다.

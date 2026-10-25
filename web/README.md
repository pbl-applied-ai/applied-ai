# web

숏폼 레시피 웹 화면(Next.js App Router, TypeScript, Tailwind). 모바일 화면 기준이고, 색·폰트 다듬기는 미드 데모 후에 한다.

- 런타임: Node.js 22 이상
- 화면 기준 문서: `docs/ux-flow.md`, 와이어프레임(KAN-39 반영)

## 실행

```bash
cd web
npm install
cp .env.example .env.local   # 기본은 mock 모드
npm run dev                  # http://localhost:3000
```

검사:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## API 모드

화면은 `@/lib/api`만 쓴다. `NEXT_PUBLIC_API_MODE`로 바꾼다.

| 값 | 동작 |
|---|---|
| `mock` (기본) | 가짜 jobs. 만든 지 2.5초 뒤 `structure`, 6초 뒤 `succeeded` |
| `real` | `NEXT_PUBLIC_API_BASE_URL`의 `POST /jobs`, `GET /jobs/:id` 호출 (KAN-22) |

jobs 필드(`status`, `stage`, `error_code`, `run_id`)는 `src/lib/api/types.ts`에 있다. API가 확정되면 이 파일부터 맞춘다.

## 화면

| 경로 | 화면 | 상태 |
|---|---|---|
| `/` | S2 링크 입력(첫 화면, 로그인 없음) | KAN-28 |
| `/jobs/[id]` | S3 처리 중 | 임시 화면. KAN-29에서 구현 |
| `/book` | S1 레시피북 | 임시 화면. KAN-31·KAN-24에서 구현 |

Shorts 링크 검사는 `src/lib/shorts.ts`(테스트: `shorts.test.ts`). 일반 YouTube `watch`·`youtu.be` 링크는 MVP에서 받지 않는다.

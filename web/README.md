# web

숏폼 레시피 웹 화면(Next.js App Router, TypeScript, Tailwind). 모바일 화면 기준이고, 색·폰트 다듬기는 미드 데모 후에 한다.

- 런타임: Node.js 22 이상
- 화면 기준 문서: `docs/ux-flow.md`, 와이어프레임(KAN-39 반영)

## 실행

```bash
cd web
npm install
cp .env.example .env.local   # 지금은 목 API라 비어 있어도 됨
npm run dev                  # http://localhost:3000
```

검사:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## API

화면은 `@/lib/api`만 쓴다(PR #17 목 모듈, 설명은 `src/lib/api/README.md`). 지금은 목(`createMockApi`, 브라우저 localStorage `mock-api-v1`)이고, KAN-22 통합 때 `src/lib/api/index.ts`의 `api` 한 줄만 Supabase 구현으로 바꾼다.

목 시나리오는 `MOCK_LINKS`(예: `youtube.com/shorts/MockNotRcp1` → 요리 영상 아님, `MockPartl01` → 찾은 만큼 보기, `MockNoCap01` → 자막 없음). 그 밖의 Shorts 링크는 약 5초 뒤 성공한다.

## 화면

| 경로 | 화면 | 상태 |
|---|---|---|
| `/` | S2 링크 입력(첫 화면, 로그인 없음) | KAN-28 |
| `/jobs/[id]` | S3 처리 중: 1.5초마다 job 조회, 지금 단계 한 줄, 실패 안내 | KAN-29 |
| `/r/[runId]` | S4 확인·수정(인라인 편집, 직접 입력·되돌리기, 부분 결과) · 공개 링크 | KAN-30 (공개 링크 읽기 전용은 KAN-32) |
| `/login` | S0 로그인(저장할 때만, 목 로그인) → 돌아오면 자동 저장 | KAN-31 최소 동작 |
| `/recipes/[id]` | S5 레시피 상세 | 임시 화면. KAN-48에서 구현 |
| `/book` | S1 레시피북 | 임시 화면. KAN-31·KAN-24에서 구현 |

문구는 `src/lib/api/labels.ts`(Figma 실패 안내 문구표 7종), 화면 상황에 맞는 버튼 고르기는 `src/lib/job-display.ts`(테스트 있음).

Shorts 링크 검사는 `src/lib/shorts.ts`(테스트: `shorts.test.ts`). 일반 YouTube `watch`·`youtu.be` 링크는 MVP에서 받지 않는다.

# supabase

레시피북 DB(KAN-21). 마이그레이션은 `migrations/`, pgTAP 테스트는 `tests/`에 있다. 설계 기준은 [워커 호출 방식](../docs/worker-interface.md).

## 로컬에서 테스트

Docker가 실행 중이어야 한다. Supabase CLI는 따로 설치하지 않고 `npx`로 쓴다.

```bash
npx supabase@2.118.0 db start    # 로컬 Postgres + migrations 적용
npx supabase@2.118.0 test db     # supabase/tests/*.test.sql 실행 (CI의 pgtap과 같음)
npx supabase@2.118.0 db reset    # 마이그레이션을 고친 뒤 처음부터 다시 적용
npx supabase@2.118.0 stop
```

## 규칙

- 새 테이블은 RLS를 켜고 pgTAP 테스트를 같이 넣는다(`tests/001`이 RLS 꺼진 테이블을 잡는다).
- 새 함수는 `revoke execute ... from public, anon, authenticated` 뒤 필요한 역할에만 연다. 로그인 없이·로그인해서 부를 수 있는 함수 목록은 `tests/001`에 고정돼 있어서, RPC를 더하면 같은 PR에서 그 목록도 고친다.
- main에 들어간 마이그레이션 파일은 고치지 않고 새 파일로 바꾼다.
- 원격 프로젝트에 연결하는 명령(`supabase link`, `db push`)은 쓰지 않는다. 배포 방법은 KAN-22에서 정한다.

## 구글 로그인·레시피북 켜기 (KAN-23·24)

코드는 `NEXT_PUBLIC_RECIPE_BOOK_ENABLED`로 꺼 두었다. 켜는 순서:

1. 배포 DB에 밀린 마이그레이션을 순서대로 적용. 마지막이 `20261109120000_upload_login_only.sql`(업로드 로그인 필요)이고, 그 앞에 아직 안 들어간 `20261031120000_upload_path.sql`도 있다
2. Google Cloud에서 OAuth 클라이언트(웹) 만들기. 승인된 리디렉션 URI는 `https://<프로젝트>.supabase.co/auth/v1/callback`
3. Supabase 대시보드 Authentication → Providers → Google에 클라이언트 ID·비밀번호 넣기
4. Authentication → URL Configuration의 Site URL과 Redirect URLs에 `https://<사이트>/auth/callback` 넣기 (로컬은 `http://localhost:3000/auth/callback`)
5. Vercel에 `NEXT_PUBLIC_RECIPE_BOOK_ENABLED=true`를 넣고 다시 배포
6. 노트북 워커를 새 코드로 다시 켠 뒤 Vercel에 `NEXT_PUBLIC_UPLOAD_ENABLED=true`. 옛 워커가 업로드 job을 잡으면 `not_youtube`로 실패해서 이 순서로 한다(#32 리뷰). 업로드는 로그인한 사람만 되니 5번이 먼저다
7. 실제 구글 계정으로 로그인부터 저장까지 끝까지 확인. Vercel 미리보기 주소는 Redirect URLs에 없어서 로그인이 안 된다

클라이언트 비밀번호는 레포·`.env`에 넣지 않는다.

// 화면은 여기서만 import한다: import { api, STAGE_LABEL, toEditable } from '@/lib/api';
// Supabase 주소·anon 키가 없으면 전부 목. 있으면 링크 넣기·처리 중·결과는 실제 API로 부른다.
// 로그인·저장·레시피북은 NEXT_PUBLIC_RECIPE_BOOK_ENABLED=true일 때만 실제로 부른다(KAN-23·24). 화면 코드는 그대로 둔다.
import { createMockApi } from './mock';
import { createSupabaseApi } from './supabase';
import type { RecipeApi } from './types';

// NEXT_PUBLIC_ 값은 빌드 때 그대로 박히므로 process.env.이름 형태로 적는다
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// 업로드는 로그인한 사람만 된다(20261109 마이그레이션). 그래서 로그인(레시피북)이 켜져 있어야 켤 수 있다.
const RECIPE_BOOK_ENABLED = process.env.NEXT_PUBLIC_RECIPE_BOOK_ENABLED === 'true';

// 영상 파일 업로드(KAN-49). 배포 DB에 uploads 버킷·create_upload_job이 들어가기 전에는 끈다(#32 리뷰).
// 목 모드는 항상 켜고, Supabase를 쓰면 NEXT_PUBLIC_UPLOAD_ENABLED=true이고 로그인이 켜져 있을 때만 켠다.
export const UPLOAD_ENABLED =
  !(SUPABASE_URL && SUPABASE_ANON_KEY) || (process.env.NEXT_PUBLIC_UPLOAD_ENABLED === 'true' && RECIPE_BOOK_ENABLED);

export const api: RecipeApi =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createSupabaseApi(createMockApi(), {
        url: SUPABASE_URL,
        anonKey: SUPABASE_ANON_KEY,
        // 배포 DB에 저장 RPC가 들어가고 구글 로그인을 설정하기 전에는 끈다. 꺼져 있으면 지금처럼 목 레시피북이다.
        recipeBook: RECIPE_BOOK_ENABLED,
      })
    : createMockApi();

export * from './types';
export * from './labels';
export * from './editable';
export { MOCK_LINKS } from './mock';

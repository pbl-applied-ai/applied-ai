// 화면은 여기서만 import한다: import { api, STAGE_LABEL, toEditable } from '@/lib/api';
// Supabase 주소·anon 키가 있으면 로그인 없이 쓰는 3개(createJob·getJob·getRun)만 실제 API로 부른다(데모용 최소 연결).
// 없으면 전부 목. 나머지 함수는 KAN-22~24에서 Supabase로 옮긴다. 화면 코드는 그대로 둔다.
import { createMockApi } from './mock';
import { createSupabaseApi } from './supabase';
import type { RecipeApi } from './types';

// NEXT_PUBLIC_ 값은 빌드 때 그대로 박히므로 process.env.이름 형태로 적는다
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const api: RecipeApi =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createSupabaseApi(createMockApi(), { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY })
    : createMockApi();

export * from './types';
export * from './labels';
export * from './editable';
export * from './pending-save';
export { MOCK_LINKS } from './mock';

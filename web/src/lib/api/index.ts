// 화면은 여기서만 import한다: import { api, STAGE_LABEL, toEditable } from '@/lib/api';
// 통합(KAN-22) 때 아래 한 줄을 Supabase 구현으로 바꾼다. 화면 코드는 그대로 둔다.
import { createMockApi } from './mock';
import type { RecipeApi } from './types';

export const api: RecipeApi = createMockApi();

export * from './types';
export * from './labels';
export * from './url';
export * from './editable';
export * from './pending-save';
export { MOCK_LINKS } from './mock';

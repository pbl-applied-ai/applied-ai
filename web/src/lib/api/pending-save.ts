// 저장 → 구글 로그인 → 돌아와서 자동 저장.
// 구글 로그인은 페이지를 떠났다 돌아오므로 S4에서 고친 내용을 sessionStorage에 잠깐 맡겨 둔다.
//
// S4 [레시피북에 저장]:
//   const user = await api.getUser();
//   if (!user) { stashPendingSave(draft); await api.signInWithGoogle(location.pathname); return; }
//   await api.saveRecipe(draft);
// S4가 다시 열릴 때(로그인 후 돌아옴):
//   const pending = takePendingSave(runId);
//   if (pending && (await api.getUser())) { const { id } = await api.saveRecipe(pending); router.push(`/recipes/${id}`); }
import type { EditableRecipe } from './types';

const KEY = 'pending-save';
const MAX_AGE_MS = 30 * 60 * 1000; // 30분 지나면 버린다

export function stashPendingSave(draft: EditableRecipe): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ savedAt: Date.now(), draft }));
  } catch {
    // 시크릿 창 등에서 막히면 저장만 못 이어 갈 뿐 화면은 그대로 동작한다
  }
}

// runId가 같을 때만 꺼내고, 꺼내면 지운다(두 번 저장 방지)
export function takePendingSave(runId: string): EditableRecipe | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const { savedAt, draft } = JSON.parse(raw) as { savedAt: number; draft: EditableRecipe };
    if (draft.runId !== runId) return null;
    sessionStorage.removeItem(KEY);
    return Date.now() - savedAt < MAX_AGE_MS ? draft : null;
  } catch {
    return null;
  }
}

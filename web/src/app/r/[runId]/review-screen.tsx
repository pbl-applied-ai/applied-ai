"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { RecipeEditor } from "@/components/recipe-editor";
import { type EditableRecipe, type Run, api, canSave, stashPendingSave, takePendingSave, toEditable } from "@/lib/api";
import { rememberSavedRun } from "@/lib/book-hidden";
import { useUnsavedWarning } from "@/lib/use-unsaved-warning";

type Load = { kind: "loading" } | { kind: "missing" } | { kind: "ready"; run: Run };

const SAVE_FAILED = "저장하지 못했어요. 고친 내용은 그대로 있어요. 다시 저장해 주세요.";

export function ReviewScreen() {
  const { runId } = useParams<{ runId: string }>();
  const router = useRouter();
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [draft, setDraft] = useState<EditableRecipe | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  useUnsavedWarning(dirty && !saving);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const run = await api.getRun(runId);
      if (cancelled) return;
      if (!run) {
        setLoad({ kind: "missing" });
        return;
      }
      // 로그인하고 돌아온 경우: 맡겨 둔 수정 내용으로 이어서 저장한다(KAN-31)
      const pending = takePendingSave(run.id);
      setLoad({ kind: "ready", run });
      setDraft(pending ?? toEditable(run));
      if (pending && (await api.getUser())) {
        setSaving(true);
        try {
          const { id } = await api.saveRecipe(pending);
          rememberSavedRun(pending.runId);
          if (!cancelled) router.replace(`/recipes/${encodeURIComponent(id)}`);
        } catch {
          if (!cancelled) {
            setSaving(false);
            setSaveError(SAVE_FAILED);
          }
        }
      }
    })().catch(() => !cancelled && setLoad({ kind: "missing" }));
    return () => {
      cancelled = true;
    };
  }, [runId, router]);

  if (load.kind === "loading" || (load.kind === "ready" && !draft)) {
    return <div className="flex flex-1 items-center justify-center text-sm text-muted">불러오는 중…</div>;
  }

  if (load.kind === "missing" || !draft) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
        <p role="alert" className="text-lg font-bold">
          레시피를 찾을 수 없어요
        </p>
        <p className="text-sm text-muted">주소가 바뀌었거나 없어진 결과예요.</p>
        <Link href="/" className="mt-4 text-sm text-link underline">
          다른 링크 넣기
        </Link>
      </div>
    );
  }

  async function save() {
    if (!draft || !canSave(draft) || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const user = await api.getUser();
      if (!user) {
        // 로그인 화면(S0)으로 갔다가 돌아오면 위 useEffect가 이어서 저장한다
        stashPendingSave(draft);
        router.push(`/login?next=${encodeURIComponent(`/r/${runId}`)}`);
        return;
      }
      const { id } = await api.saveRecipe(draft);
      rememberSavedRun(draft.runId);
      setDirty(false);
      router.push(`/recipes/${encodeURIComponent(id)}`);
    } catch {
      setSaving(false);
      setSaveError(SAVE_FAILED);
    }
  }

  return (
    <RecipeEditor
      run={load.run}
      draft={draft}
      onChange={(next) => {
        setDraft(next);
        setDirty(true);
        setSaveError(null);
      }}
      onSave={save}
      saving={saving}
      saveError={saveError}
      saveLabel="레시피북에 저장"
    />
  );
}

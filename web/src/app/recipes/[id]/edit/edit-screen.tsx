"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { RecipeEditor } from "@/components/recipe-editor";
import { type EditableRecipe, type Run, api, canSave } from "@/lib/api";
import { useRequireUser } from "@/lib/use-require-user";
import { useUnsavedWarning } from "@/lib/use-unsaved-warning";

type Load = { kind: "loading" } | { kind: "missing" } | { kind: "ready"; run: Run };

export function EditScreen() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const user = useRequireUser(`/recipes/${id}/edit`);
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [draft, setDraft] = useState<EditableRecipe | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  useUnsavedWarning(dirty && !saving);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const recipe = await api.getRecipe(id);
      // 되돌리기는 추출 결과(run)의 같은 ID 항목으로 돌아가므로 run도 함께 읽는다
      const run = recipe ? await api.getRun(recipe.runId) : null;
      if (cancelled) return;
      if (!recipe || !run) {
        setLoad({ kind: "missing" });
        return;
      }
      setDraft({
        runId: recipe.runId,
        title: recipe.title,
        servingsRaw: recipe.servingsRaw,
        ingredients: recipe.ingredients,
        steps: recipe.steps,
      });
      setLoad({ kind: "ready", run });
    })().catch(() => !cancelled && setLoad({ kind: "missing" }));
    return () => {
      cancelled = true;
    };
  }, [id, user]);

  if (load.kind === "missing") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
        <p role="alert" className="text-lg font-bold">
          레시피를 찾을 수 없어요
        </p>
        <Link href="/book" className="mt-4 text-sm text-link underline">
          레시피북으로
        </Link>
      </div>
    );
  }
  if (load.kind === "loading" || !draft) {
    return <div className="flex flex-1 items-center justify-center text-sm text-muted">불러오는 중…</div>;
  }

  async function save() {
    if (!draft || !canSave(draft) || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await api.updateRecipe(id, draft);
      setDirty(false);
      router.replace(`/recipes/${encodeURIComponent(id)}`);
    } catch {
      setSaving(false);
      setSaveError("저장하지 못했어요. 고친 내용은 그대로 있어요. 다시 저장해 주세요.");
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
      saveLabel="수정 내용 저장"
    />
  );
}

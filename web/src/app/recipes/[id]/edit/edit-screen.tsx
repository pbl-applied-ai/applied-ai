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
          We can&apos;t find this recipe
        </p>
        <Link href="/book" className="mt-4 text-sm text-muted underline underline-offset-4">
          Back to recipe book
        </Link>
      </div>
    );
  }
  if (load.kind === "loading" || !draft) {
    return <div className="flex flex-1 items-center justify-center text-sm text-muted">Loading…</div>;
  }

  async function save() {
    if (!draft || !canSave(draft) || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await api.updateRecipe(id, draft);
      setDirty(false);
      router.replace(`/recipes/${encodeURIComponent(id)}`);
      setSaving(false); // 화면 상태가 남아 있어도(cacheComponents) "저장하는 중…"에 멈추지 않게
    } catch {
      setSaving(false);
      setSaveError("Couldn't save. Your edits are still here. Please try saving again.");
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
      saveLabel="Save changes"
    />
  );
}

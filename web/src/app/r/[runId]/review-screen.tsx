"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  type EditableRecipe,
  type Run,
  addIngredient,
  addStep,
  api,
  canSave,
  editIngredient,
  editStep,
  moveStep,
  removeIngredient,
  removeStep,
  revertItem,
  stashPendingSave,
  takePendingSave,
  toEditable,
} from "@/lib/api";
import { isDescriptionOnly, missingParts, saveBlocker } from "@/lib/review";
import { useUnsavedWarning } from "@/lib/use-unsaved-warning";
import { AddIngredientForm, AddStepForm, IngredientRow, StepRow } from "./rows";

type Load = { kind: "loading" } | { kind: "missing" } | { kind: "ready"; run: Run };

export function ReviewScreen() {
  const { runId } = useParams<{ runId: string }>();
  const router = useRouter();
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [draft, setDraft] = useState<EditableRecipe | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
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
          if (!cancelled) router.replace(`/recipes/${encodeURIComponent(id)}`);
        } catch {
          if (!cancelled) {
            setSaving(false);
            setSaveError("저장하지 못했어요. 고친 내용은 그대로 있어요. 다시 저장해 주세요.");
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

  const run = load.run;
  const missing = missingParts(run);
  const blocker = saveBlocker(draft);
  const update = (next: EditableRecipe) => {
    setDraft(next);
    setDirty(true);
    setSaveError(null);
  };

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
      setDirty(false);
      router.push(`/recipes/${encodeURIComponent(id)}`);
    } catch {
      setSaving(false);
      setSaveError("저장하지 못했어요. 고친 내용은 그대로 있어요. 다시 저장해 주세요.");
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <section className="flex flex-col gap-1.5 px-5 pt-3">
        <label htmlFor="title" className="text-xs text-muted">
          요리명
        </label>
        <input
          id="title"
          value={draft.title}
          onChange={(e) => update({ ...draft, title: e.target.value })}
          className="border-b-[1.5px] border-line pt-1 pb-2 text-2xl font-bold outline-link"
        />
        {isDescriptionOnly(run) && <p className="mt-1 text-[13px] text-muted">ⓘ 영상 설명란만 보고 만든 레시피예요.</p>}
        {(missing.steps || missing.ingredients) && (
          <p className="mt-2 rounded-xl bg-subtle px-3.5 py-3 text-[13px] leading-relaxed">
            ⓘ 영상에서 {missing.steps ? "조리 순서" : "재료"}를 찾지 못했어요.
            <br />
            아래에서 직접 추가하면 저장할 수 있어요.
          </p>
        )}
        <p className="mt-1 text-[13px] text-muted">틀린 곳은 눌러서 바로 고칠 수 있어요.</p>
      </section>

      <section className="flex flex-col px-5 pt-6" aria-labelledby="ing-title">
        <h2 id="ing-title" className="mb-2 text-lg font-bold">
          재료 {draft.ingredients.length}
        </h2>
        {draft.ingredients.length === 0 && (
          <p className="rounded-xl border-[1.5px] border-dashed border-line-strong bg-subtle px-4 py-5 text-center text-sm text-muted">
            영상에서 찾은 재료가 없어요.
          </p>
        )}
        {draft.ingredients.map((ing) => (
          <IngredientRow
            key={ing.id}
            item={ing}
            editing={editing === ing.id}
            onStartEdit={() => setEditing(ing.id)}
            onCancel={() => setEditing(null)}
            onSave={(patch) => {
              update(editIngredient(draft, ing.id, patch));
              setEditing(null);
            }}
            onRevert={() => update(revertItem(draft, run, ing.id))}
            onRemove={() => {
              update(removeIngredient(draft, ing.id));
              setEditing(null);
            }}
          />
        ))}
        <AddIngredientForm onAdd={(name, amount) => update(addIngredient(draft, name, amount))} />
      </section>

      <section className="flex flex-col px-5 pt-8" aria-labelledby="step-title">
        <h2 id="step-title" className="mb-2 text-lg font-bold">
          조리 순서 {draft.steps.length}
        </h2>
        {draft.steps.length === 0 && (
          <p className="rounded-xl border-[1.5px] border-dashed border-line-strong bg-subtle px-4 py-5 text-center text-sm text-muted">
            영상에서 찾은 조리 순서가 없어요.
          </p>
        )}
        {draft.steps.map((step, i) => (
          <StepRow
            key={step.id}
            item={step}
            order={i + 1}
            isFirst={i === 0}
            isLast={i === draft.steps.length - 1}
            editing={editing === step.id}
            onStartEdit={() => setEditing(step.id)}
            onCancel={() => setEditing(null)}
            onSave={(text) => {
              if (text !== step.text) update(editStep(draft, step.id, text));
              setEditing(null);
            }}
            onRevert={() => update(revertItem(draft, run, step.id))}
            onRemove={() => {
              update(removeStep(draft, step.id));
              setEditing(null);
            }}
            onMove={(offset) => update(moveStep(draft, step.id, offset))}
          />
        ))}
        <AddStepForm label={draft.steps.length === 0 ? "+ 첫 단계 추가" : "+ 단계 추가"} onAdd={(text) => update(addStep(draft, text))} />
      </section>

      <footer className="mt-auto flex flex-col gap-2.5 px-5 pt-8 pb-8">
        <p className="text-center text-xs leading-relaxed text-muted">
          고친 내용은 원래 결과와 함께 보관되어
          <br />
          추출 품질을 높이는 데 쓰여요.
        </p>
        <button
          type="button"
          onClick={save}
          disabled={!canSave(draft) || saving}
          className="h-13 rounded-xl bg-foreground text-base font-bold text-background disabled:bg-disabled disabled:text-muted"
        >
          {saving ? "저장하는 중…" : "레시피북에 저장"}
        </button>
        {blocker && <p className="text-center text-xs text-muted">{blocker}</p>}
        {saveError && (
          <p role="alert" className="text-center text-[13px] text-danger">
            {saveError}
          </p>
        )}
      </footer>
    </div>
  );
}

"use client";

// S4 확인·수정 편집 영역. 결과 확인(/r/[runId])과 저장한 레시피 수정(/recipes/[id]/edit)이 같이 쓴다.
import { useState } from "react";
import {
  type EditableRecipe,
  type Run,
  addIngredient,
  addStep,
  canSave,
  editIngredient,
  editStep,
  moveStep,
  removeIngredient,
  removeStep,
  revertItem,
} from "@/lib/api";
import { isDescriptionOnly, missingParts, saveBlocker } from "@/lib/review";
import { AddIngredientForm, AddStepForm, IngredientRow, StepRow } from "./recipe-rows";

export function RecipeEditor({
  run,
  draft,
  onChange,
  onSave,
  saving,
  saveError,
  saveLabel,
}: {
  run: Run;
  draft: EditableRecipe;
  onChange: (next: EditableRecipe) => void;
  onSave: () => void;
  saving: boolean;
  saveError: string | null;
  saveLabel: string;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const missing = missingParts(run);
  const blocker = saveBlocker(draft);
  const done = (next: EditableRecipe) => {
    onChange(next);
    setEditing(null);
  };

  return (
    <div className="flex flex-1 flex-col">
      <section className="flex flex-col gap-1.5 px-5 pt-3">
        <label htmlFor="title" className="text-xs text-muted">
          요리명
        </label>
        <input
          id="title"
          value={draft.title}
          onChange={(e) => onChange({ ...draft, title: e.target.value })}
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
            onSave={(patch) => done(editIngredient(draft, ing.id, patch))}
            onRevert={() => onChange(revertItem(draft, run, ing.id))}
            onRemove={() => done(removeIngredient(draft, ing.id))}
          />
        ))}
        <AddIngredientForm onAdd={(name, amount) => onChange(addIngredient(draft, name, amount))} />
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
            onSave={(text) => done(text === step.text ? draft : editStep(draft, step.id, text))}
            onRevert={() => onChange(revertItem(draft, run, step.id))}
            onRemove={() => done(removeStep(draft, step.id))}
            onMove={(offset) => onChange(moveStep(draft, step.id, offset))}
          />
        ))}
        <AddStepForm label={draft.steps.length === 0 ? "+ 첫 단계 추가" : "+ 단계 추가"} onAdd={(text) => onChange(addStep(draft, text))} />
      </section>

      <footer className="mt-auto flex flex-col gap-2.5 px-5 pt-8 pb-8">
        <p className="text-center text-xs leading-relaxed text-muted">
          고친 내용은 원래 결과와 함께 보관되어
          <br />
          추출 품질을 높이는 데 쓰여요.
        </p>
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave(draft) || saving}
          className="h-13 rounded-xl bg-foreground text-base font-bold text-background disabled:bg-disabled disabled:text-muted"
        >
          {saving ? "저장하는 중…" : saveLabel}
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

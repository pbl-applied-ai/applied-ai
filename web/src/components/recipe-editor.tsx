"use client";

// S4 확인·수정 편집 영역. 결과 확인(/r/[runId])과 저장한 레시피 수정(/recipes/[id]/edit)이 같이 쓴다.
import { useState } from "react";
import {
  type EditableRecipe,
  type Run,
  acceptAllEstimates,
  addIngredient,
  addStep,
  canSave,
  editIngredient,
  editStep,
  estimateCount,
  moveStep,
  removeIngredient,
  removeStep,
  revertItem,
} from "@/lib/api";
import { descriptionNotice, missingParts, saveBlocker } from "@/lib/review";
import { SourceMeta, SourceThumb } from "./recipe-source";
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
  const notice = descriptionNotice(run);
  const blocker = saveBlocker(draft);
  const estimates = estimateCount(draft);
  const done = (next: EditableRecipe) => {
    onChange(next);
    setEditing(null);
  };

  return (
    <div className="flex flex-1 flex-col">
      <section className="flex flex-col gap-1.5 px-5 pt-1">
        <div className="flex gap-3">
          <SourceThumb run={run} />
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
            <label htmlFor="title" className="sr-only">
              Recipe name
            </label>
            <input
              id="title"
              value={draft.title}
              onChange={(e) => onChange({ ...draft, title: e.target.value })}
              className="w-full border-b-[1.5px] border-transparent bg-transparent pb-0.5 text-xl leading-tight font-bold outline-none focus:border-pink"
            />
            <SourceMeta run={run} />
          </div>
        </div>
        {notice && <p className="mt-1 text-[13px] text-muted">ⓘ {notice}</p>}
        {(missing.steps || missing.ingredients) && (
          <p className="mt-2 rounded-2xl bg-pink-tint px-3.5 py-3 text-[13px] leading-relaxed text-pink-ink">
            ⓘ We couldn&apos;t find the {missing.steps ? "steps" : "ingredients"} in the video.
            <br />
            Add them below and you can save.
          </p>
        )}
        {estimates > 0 && (
          <p className="mt-2 flex gap-2.5 rounded-2xl bg-pink-tint px-3.5 py-3 text-[13px] leading-snug text-pink-ink">
            <span className="text-lg leading-none" aria-hidden="true">
              🤏
            </span>
            <span>
              <b>
                {estimates} {estimates === 1 ? "amount is a Pinch estimate" : "amounts are Pinch estimates"}.
              </b>{" "}
              Check {estimates === 1 ? "it" : "them"} before saving.
            </span>
          </p>
        )}
        <p className="mt-1 text-[13px] text-muted">Tap anything that looks off to fix it.</p>
      </section>

      <section className="flex flex-col px-5 pt-6" aria-labelledby="ing-title">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 id="ing-title" className="flex items-baseline gap-2 text-lg font-bold">
            Ingredients <span className="text-xs font-medium text-muted">{draft.ingredients.length} items</span>
          </h2>
          {estimates > 0 && (
            <button
              type="button"
              onClick={() => done(acceptAllEstimates(draft))}
              className="min-h-9 rounded-full border-[1.5px] border-foreground bg-card px-3 text-[13px] font-bold"
            >
              Use all {estimates} {estimates === 1 ? "estimate" : "estimates"}
            </button>
          )}
        </div>
        {draft.ingredients.length === 0 && (
          <p className="rounded-[22px] border-[1.5px] border-dashed border-[#cfc6ba] bg-card px-4 py-5 text-center text-sm text-muted">
            No ingredients found in the video.
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
          Steps <span className="text-xs font-medium text-muted">{draft.steps.length}</span>
        </h2>
        {draft.steps.length === 0 && (
          <p className="rounded-[22px] border-[1.5px] border-dashed border-[#cfc6ba] bg-card px-4 py-5 text-center text-sm text-muted">
            No steps found in the video.
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
        <AddStepForm label={draft.steps.length === 0 ? "+ Add the first step" : "+ Add step"} onAdd={(text) => onChange(addStep(draft, text))} />
      </section>

      <footer className="mt-auto flex flex-col gap-2.5 px-5 pt-8 pb-8">
        <p className="text-center text-xs leading-relaxed text-muted">
          We keep your edits next to the original result
          <br />
          to make Pinch more accurate.
        </p>
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave(draft) || saving}
          className="btn-primary"
        >
          {saving ? "Saving…" : saveLabel}
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

"use client";

// 재료·조리 순서를 읽기 전용으로 보여 주는 영역. 저장한 레시피 상세(/recipes/[id])와 로그인 전 결과 화면(/r/[runId])이 쓴다.
import type { EditableRecipe } from "@/lib/api";
import { useState } from "react";
import { amountView } from "@/lib/review";
import { BATCH_STEPS, parseServings, scaleAmount, servingsLabel } from "@/lib/scale";
import { metricHint } from "@/lib/units";
import { SourceChip } from "./recipe-source";

const stepButton =
  "flex size-9 items-center justify-center rounded-full border-2 border-foreground bg-card text-lg leading-none font-bold disabled:border-line disabled:text-muted";

// 몇 인분 조절(+/−). 영상에 인분이 있으면 그 인분에서, 없으면 1배에서 시작한다. 화면에서만 바꾸고 저장된 분량은 그대로다.
function useScale(servingsRaw: string | null | undefined) {
  const base = parseServings(servingsRaw);
  const [count, setCount] = useState(base?.count ?? 1);
  const [batch, setBatch] = useState(1);
  if (base) {
    return {
      factor: count / base.count,
      label: servingsLabel(count, base.unit),
      canLess: count > 1,
      canMore: count < 50,
      less: () => setCount((c) => Math.max(1, c - 1)),
      more: () => setCount((c) => Math.min(50, c + 1)),
      reset: () => setCount(base.count),
      note: `Scaled from ${servingsLabel(base.count, base.unit)} in the video`,
    };
  }
  const i = BATCH_STEPS.indexOf(batch as (typeof BATCH_STEPS)[number]);
  return {
    factor: batch,
    label: `${batch}× batch`,
    canLess: i > 0,
    canMore: i < BATCH_STEPS.length - 1,
    less: () => setBatch(BATCH_STEPS[Math.max(0, i - 1)]),
    more: () => setBatch(BATCH_STEPS[Math.min(BATCH_STEPS.length - 1, i + 1)]),
    reset: () => setBatch(1),
    note: "Scaled from the amounts in the video",
  };
}

function ServingsStepper({ scale }: { scale: ReturnType<typeof useScale> }) {
  return (
    <div className="mb-2 flex flex-col gap-1">
      <div className="flex items-center gap-3">
        <button type="button" onClick={scale.less} disabled={!scale.canLess} aria-label="Fewer servings" className={stepButton}>
          −
        </button>
        <span className="min-w-24 text-center text-[15px] font-bold" aria-live="polite">
          {scale.label}
        </span>
        <button type="button" onClick={scale.more} disabled={!scale.canMore} aria-label="More servings" className={stepButton}>
          +
        </button>
        {scale.factor !== 1 && (
          <button type="button" onClick={scale.reset} className="min-h-9 px-1 text-xs text-muted underline underline-offset-2">
            Reset
          </button>
        )}
      </div>
      {scale.factor !== 1 && <p className="text-[11px] text-muted">{scale.note}. Amounts without a number stay the same. Steps keep the video&apos;s amounts.</p>}
    </div>
  );
}

// locked: 로그인 전 결과 화면. 추정값이 있는 재료(has_estimate)에만 "Sign in to see" 잠금 배지를 보여 준다(플로우 v3 #57, #68).
// 추정값이 없는 재료는 로그인해도 볼 게 없으니 "Not in the video".
export function RecipeView({
  recipe,
  locked = false,
}: {
  recipe: Pick<EditableRecipe, "ingredients" | "steps"> & { servingsRaw?: string | null };
  locked?: boolean;
}) {
  const scale = useScale(recipe.servingsRaw);
  return (
    <>
      <section className="flex flex-col px-5 pt-7" aria-labelledby="d-ing">
        <h2 id="d-ing" className="mb-2 flex items-baseline justify-between text-lg font-bold">
          Ingredients <span className="text-xs font-medium text-muted">{recipe.ingredients.length} items</span>
        </h2>
        {recipe.ingredients.length > 0 && <ServingsStepper scale={scale} />}
        {recipe.ingredients.length === 0 && <p className="border-t border-line py-3.5 text-sm text-muted">No ingredients found in the video.</p>}
        {recipe.ingredients.map((ing) => {
          const view = amountView(ing);
          const text = view.kind === "confirmed" || view.kind === "user" ? scaleAmount(view.text, scale.factor) : null;
          const hint = text == null ? null : metricHint(text, ing.name);
          // 바꾼 분량은 영상이 말한 값이 아니라서 출처 칩을 숨기고 원래 값을 작게 보여 준다(#83 리뷰)
          const scaled = text != null && view.kind !== "missing" && view.kind !== "estimate" && text !== view.text;
          return (
            <div key={ing.id} className="flex min-h-12 items-center justify-between gap-3 border-t border-line">
              <span className="text-base font-medium">{ing.name}</span>
              {view.kind === "confirmed" && (
                <span className="flex items-center gap-2">
                  {!scaled && <SourceChip source={ing.amount_source} />}
                  <span className="flex flex-col items-end">
                    <span className="text-[15px] font-bold">{text}</span>
                    {hint && <span className="text-[11px] text-muted">{hint}</span>}
                    {scaled && <span className="text-[11px] text-muted">Video: {view.text}</span>}
                  </span>
                </span>
              )}
              {/* 읽기 전용 화면에는 추정값이 오지 않는다(저장할 때 빼고, 로그인 전에는 서버가 뺀다) */}
              {(view.kind === "missing" || view.kind === "estimate") &&
                (locked && ing.has_estimate ? (
                  <span className="est">🔒 Sign in to see</span>
                ) : (
                  <span className="shrink-0 text-[13px] whitespace-nowrap text-muted">Not in the video</span>
                ))}
              {view.kind === "user" && (
                <span className="flex flex-col items-end">
                  <span className="text-[15px] font-bold">{text}</span>
                  {hint && <span className="text-[11px] text-muted">{hint}</span>}
                  {scaled ? (
                    <span className="text-[11px] text-muted">You entered: {view.text}</span>
                  ) : (
                    <span className="src-chip mt-0.5">You entered</span>
                  )}
                </span>
              )}
            </div>
          );
        })}
      </section>

      <section className="flex flex-col px-5 pt-7 pb-10" aria-labelledby="d-step">
        <h2 id="d-step" className="mb-2 text-lg font-bold">
          Steps
        </h2>
        {recipe.steps.length === 0 && <p className="border-t border-line py-3.5 text-sm text-muted">No steps found in the video.</p>}
        {recipe.steps.map((step, i) => (
          <div key={step.id} className="flex gap-3 border-t border-line py-3.5">
            <span className="flex size-[26px] shrink-0 items-center justify-center rounded-full border-2 border-foreground bg-pink text-[13px] font-bold text-foreground">
              {i + 1}
            </span>
            <span className="text-[15px] leading-relaxed">{step.text}</span>
          </div>
        ))}
      </section>
    </>
  );
}

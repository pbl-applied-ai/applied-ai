// 재료·조리 순서를 읽기 전용으로 보여 주는 영역. 저장한 레시피 상세(/recipes/[id])와 로그인 전 결과 화면(/r/[runId])이 쓴다.
import type { EditableRecipe } from "@/lib/api";
import { amountView } from "@/lib/review";
import { metricHint } from "@/lib/units";
import { SourceChip } from "./recipe-source";

// locked: 로그인 전 결과 화면. 영상에 없는 분량은 추정값 대신 "Sign in to see" 잠금 배지를 보여 준다(플로우 v3, #57).
export function RecipeView({ recipe, locked = false }: { recipe: Pick<EditableRecipe, "ingredients" | "steps">; locked?: boolean }) {
  return (
    <>
      <section className="flex flex-col px-5 pt-7" aria-labelledby="d-ing">
        <h2 id="d-ing" className="mb-2 flex items-baseline justify-between text-lg font-bold">
          Ingredients <span className="text-xs font-medium text-muted">{recipe.ingredients.length} items</span>
        </h2>
        {recipe.ingredients.length === 0 && <p className="border-t border-line py-3.5 text-sm text-muted">No ingredients found in the video.</p>}
        {recipe.ingredients.map((ing) => {
          const view = amountView(ing);
          const hint = view.kind === "missing" || view.kind === "estimate" ? null : metricHint(view.text, ing.name);
          return (
            <div key={ing.id} className="flex min-h-12 items-center justify-between gap-3 border-t border-line">
              <span className="text-base font-medium">{ing.name}</span>
              {view.kind === "confirmed" && (
                <span className="flex items-center gap-2">
                  <SourceChip source={ing.amount_source} />
                  <span className="flex flex-col items-end">
                    <span className="text-[15px] font-bold">{view.text}</span>
                    {hint && <span className="text-[11px] text-muted">{hint}</span>}
                  </span>
                </span>
              )}
              {/* 읽기 전용 화면에는 추정값이 오지 않는다(저장할 때 빼고, 로그인 전에는 서버가 뺀다) */}
              {(view.kind === "missing" || view.kind === "estimate") &&
                (locked ? (
                  <span className="est">🔒 Sign in to see</span>
                ) : (
                  <span className="shrink-0 text-[13px] whitespace-nowrap text-muted">Not in the video</span>
                ))}
              {view.kind === "user" && (
                <span className="flex flex-col items-end">
                  <span className="text-[15px] font-bold">{view.text}</span>
                  {hint && <span className="text-[11px] text-muted">{hint}</span>}
                  <span className="src-chip mt-0.5">You entered</span>
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

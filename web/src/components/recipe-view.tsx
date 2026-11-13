// 재료·조리 순서를 읽기 전용으로 보여 주는 영역. 저장한 레시피 상세(/recipes/[id])와 로그인 전 결과 화면(/r/[runId])이 쓴다.
import type { EditableRecipe } from "@/lib/api";
import { amountView } from "@/lib/review";
import { metricHint } from "@/lib/units";

export function RecipeView({ recipe }: { recipe: Pick<EditableRecipe, "ingredients" | "steps"> }) {
  return (
    <>
      <section className="flex flex-col px-5 pt-7" aria-labelledby="d-ing">
        <h2 id="d-ing" className="mb-2 text-lg font-bold">
          재료 {recipe.ingredients.length}
        </h2>
        {recipe.ingredients.length === 0 && <p className="border-t border-[#ecece8] py-3.5 text-sm text-muted">영상에서 찾은 재료가 없어요.</p>}
        {recipe.ingredients.map((ing) => {
          const view = amountView(ing);
          const hint = view.kind === "missing" || view.kind === "estimate" ? null : metricHint(view.text, ing.name);
          return (
            <div key={ing.id} className="flex min-h-12 items-center justify-between gap-3 border-t border-[#ecece8]">
              <span className="text-base font-medium">{ing.name}</span>
              {view.kind === "confirmed" && (
                <span className="flex flex-col items-end">
                  <span className="text-[15px]">{view.text}</span>
                  {hint && <span className="text-[11px] text-muted">{hint}</span>}
                </span>
              )}
              {/* 읽기 전용 화면에는 추정값이 오지 않지만(저장할 때 빼고, 로그인 전에는 서버가 뺀다) 와도 빈칸으로 둔다 */}
              {(view.kind === "missing" || view.kind === "estimate") && <span className="text-[13px] text-muted">영상에서 확인 안 됨</span>}
              {view.kind === "user" && (
                <span className="flex flex-col items-end">
                  <span className="text-[15px]">{view.text}</span>
                  {hint && <span className="text-[11px] text-muted">{hint}</span>}
                  <span className="text-[11px] font-medium text-[#174a94]">직접 입력</span>
                </span>
              )}
            </div>
          );
        })}
      </section>

      <section className="flex flex-col px-5 pt-7 pb-10" aria-labelledby="d-step">
        <h2 id="d-step" className="mb-2 text-lg font-bold">
          조리 순서
        </h2>
        {recipe.steps.length === 0 && <p className="border-t border-[#ecece8] py-3.5 text-sm text-muted">영상에서 찾은 조리 순서가 없어요.</p>}
        {recipe.steps.map((step, i) => (
          <div key={step.id} className="flex gap-3 border-t border-[#ecece8] py-3.5">
            <span className="flex size-[26px] shrink-0 items-center justify-center rounded-full bg-foreground text-[13px] font-bold text-background">
              {i + 1}
            </span>
            <span className="text-[15px] leading-relaxed">{step.text}</span>
          </div>
        ))}
      </section>
    </>
  );
}

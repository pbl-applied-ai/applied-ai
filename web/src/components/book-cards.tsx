// 홈(S6)과 레시피북(S1)이 같이 쓰는 카드: "만드는 중" 카드, 저장한 레시피 카드.
import Link from "next/link";
import type { RecipeSummary } from "@/lib/api";
import { type JobCard, shortDate } from "@/lib/book";

export function JobCardList({ cards, onHide }: { cards: JobCard[]; onHide: (jobId: string) => void }) {
  return cards.map((card) => (
    <div
      key={card.jobId}
      className={`flex items-center rounded-xl border ${
        card.kind === "failed" ? "border-line-strong bg-background" : "border-dashed border-[#8a8a85] bg-[#fafaf8]"
      }`}
    >
      <Link href={card.href} className={`flex min-w-0 flex-1 items-center gap-3 py-3.5 pl-4 ${card.kind === "failed" ? "pr-1" : "pr-4"}`}>
        {card.kind === "working" ? (
          <span className="size-10 shrink-0 animate-spin rounded-full border-[3px] border-disabled border-t-link" aria-hidden="true" />
        ) : (
          <span
            className={`flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
              card.kind === "failed" ? "bg-subtle text-muted" : "bg-foreground text-background"
            }`}
            aria-hidden="true"
          >
            {card.kind === "failed" ? "!" : "✓"}
          </span>
        )}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[15px] font-bold">{card.title}</span>
          <span className="text-[13px] text-muted">{card.detail}</span>
        </span>
        {card.kind !== "failed" && (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5c5c5c" strokeWidth="2" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
        )}
      </Link>
      {/* 실패 카드는 지울 방법이 없으면 계속 쌓이므로 [닫기]를 둔다 */}
      {card.kind === "failed" && (
        <button
          type="button"
          aria-label="실패 카드 닫기"
          onClick={() => onHide(card.jobId)}
          className="mr-1 flex size-11 shrink-0 items-center justify-center rounded-full"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5c5c5c" strokeWidth="2" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      )}
    </div>
  ));
}

export function RecipeCard({ recipe }: { recipe: RecipeSummary }) {
  return (
    <Link href={`/recipes/${encodeURIComponent(recipe.id)}`} className="flex gap-3 rounded-xl border border-line p-3.5">
      <span className="size-16 shrink-0 rounded-lg bg-[#e9e9e5]" aria-hidden="true" />
      <span className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
        <span className="truncate text-base font-bold">{recipe.title}</span>
        <span className="text-[13px] text-muted">
          재료 {recipe.ingredientCount} · {shortDate(recipe.createdAt)} 저장
        </span>
      </span>
    </Link>
  );
}

// 홈(S6)과 레시피북(S1)이 같이 쓰는 카드: "만드는 중" 카드, 저장한 레시피 카드.
import Link from "next/link";
import type { RecipeSummary } from "@/lib/api";
import { type JobCard, shortDate } from "@/lib/book";
import { Thumb } from "./thumb";

export function JobCardList({ cards, onHide }: { cards: JobCard[]; onHide: (jobId: string) => void }) {
  return cards.map((card) => (
    <div
      key={card.jobId}
      className={`flex items-center rounded-[22px] border ${
        card.kind === "failed" ? "border-danger/40 bg-card" : "border-[1.5px] border-dashed border-pink bg-pink-tint"
      }`}
    >
      <Link href={card.href} className={`flex min-w-0 flex-1 items-center gap-3 py-3.5 pl-4 ${card.kind === "failed" ? "pr-1" : "pr-4"}`}>
        {card.kind === "working" ? (
          <span className="size-10 shrink-0 animate-spin rounded-full border-[3px] border-card border-t-pink" aria-hidden="true" />
        ) : (
          <span
            className={`flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
              card.kind === "failed" ? "bg-danger-tint text-danger" : "border-2 border-lime-ink bg-lime text-lime-ink"
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
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8a7a72" strokeWidth="2" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
        )}
      </Link>
      {/* 실패 카드는 지울 방법이 없으면 계속 쌓이므로 [닫기]를 둔다 */}
      {card.kind === "failed" && (
        <button
          type="button"
          aria-label="Dismiss failed card"
          onClick={() => onHide(card.jobId)}
          className="mr-1 flex size-11 shrink-0 items-center justify-center rounded-full"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8a7a72" strokeWidth="2" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      )}
    </div>
  ));
}

export function RecipeCard({ recipe }: { recipe: RecipeSummary }) {
  return (
    <Link href={`/recipes/${encodeURIComponent(recipe.id)}`} className="flex gap-3 rounded-[22px] bg-card p-3">
      <Thumb src={recipe.thumbnailUrl} className="size-16 shrink-0 rounded-2xl" />
      <span className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
        <span className="truncate text-base font-bold">{recipe.title}</span>
        <span className="text-[13px] text-muted">
          {recipe.ingredientCount} ingredients · saved {shortDate(recipe.createdAt)}
        </span>
      </span>
    </Link>
  );
}

/** 레시피북 2열 카드(시안 06). 분량을 확인할 재료가 있으면 "N to check" 스티커를 붙인다. */
export function RecipeGridCard({ recipe }: { recipe: RecipeSummary }) {
  return (
    <Link href={`/recipes/${encodeURIComponent(recipe.id)}`} className="flex min-w-0 flex-col">
      <span className="relative block">
        <Thumb src={recipe.thumbnailUrl} className="h-[150px] w-full rounded-[20px]" />
        {recipe.unconfirmedCount > 0 && (
          <span className="sticker absolute top-2 left-2 bg-pink px-2 text-[11px]">{recipe.unconfirmedCount} to check</span>
        )}
      </span>
      <span className="mt-2 line-clamp-2 text-sm leading-snug font-bold">{recipe.title}</span>
      <span className="text-[11px] text-muted">
        {recipe.ingredientCount} ingredients · saved {shortDate(recipe.createdAt)}
      </span>
    </Link>
  );
}

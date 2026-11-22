"use client";

// 홈 추천 카드 한 장(Trending·주제별 줄·특집 페이지가 같이 쓴다). 누르면 공개 보기 /r/<runId>.
// 사진은 5절 썸네일 규칙: 썸네일이 없으면(Instagram) 요리명 글자 카드(색 블록 + 플랫폼 표시)로 그린다.
import Link from "next/link";
import { Thumb } from "@/components/thumb";
import type { RecommendationCard } from "@/lib/api";
import { saveCountText } from "@/lib/featured";

const BLOCK_COLORS = ["bg-pink-tint", "bg-lime-tint", "bg-orange-tint"] as const;

export function platformSticker(card: Pick<RecommendationCard, "platform">): string {
  return card.platform === "instagram" ? "◎ Reels" : "▶ Shorts";
}

/** 사진 자리. 썸네일이 있으면 사진, 없으면 요리명을 크게 쓴 색 블록 */
export function RecipePhoto({ card, className, colorIndex = 0 }: { card: RecommendationCard; className: string; colorIndex?: number }) {
  if (card.thumbnailUrl) return <Thumb src={card.thumbnailUrl} className={className} />;
  return (
    <span className={`flex items-end p-4 ${BLOCK_COLORS[colorIndex % BLOCK_COLORS.length]} ${className}`} aria-hidden="true">
      <span className="font-display line-clamp-4 text-[22px] leading-tight">{card.title}</span>
    </span>
  );
}

export function RecipeTile({ card, badge, colorIndex = 0 }: { card: RecommendationCard; badge?: string; colorIndex?: number }) {
  const corner = badge ?? saveCountText(card.saveCount);
  return (
    <li className="w-[226px] shrink-0 snap-start">
      <Link href={`/r/${encodeURIComponent(card.runId)}`} className="flex flex-col gap-2">
        <span className="relative block">
          <RecipePhoto card={card} colorIndex={colorIndex} className="h-[214px] w-full rounded-[20px]" />
          <span className="sticker absolute top-3 left-3 bg-card text-xs">{platformSticker(card)}</span>
          {corner && <span className="sticker absolute right-3 bottom-3 bg-orange text-sm">{corner}</span>}
        </span>
        <span className="flex items-start justify-between gap-2">
          <span className="flex min-w-0 flex-col">
            <span className="line-clamp-2 text-[17px] leading-snug font-bold">{card.title}</span>
            <span className="mt-0.5 truncate text-xs text-muted">
              {card.creator ? `${card.creator} · ` : ""}
              {card.ingredientCount} ingredients
            </span>
          </span>
          <span className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-ink text-xl text-white" aria-hidden="true">
            +
          </span>
        </span>
      </Link>
    </li>
  );
}

/** 옆으로 넘기는 카드 줄 */
export function RecipeRow({ id, title, cards, badges }: { id: string; title: string; cards: RecommendationCard[]; badges?: Record<string, string> }) {
  return (
    <section aria-labelledby={id} className="flex flex-col pt-6">
      <h2 id={id} className="px-6 text-xl font-bold">
        {title}
      </h2>
      <ul className="mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-6 px-6 pb-1 [scrollbar-width:none]">
        {cards.map((card, i) => (
          <RecipeTile key={card.runId} card={card} colorIndex={i} badge={badges?.[card.runId]} />
        ))}
      </ul>
    </section>
  );
}

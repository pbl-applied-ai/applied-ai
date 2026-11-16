"use client";

// H Home (docs/screen-data.md #57 2절 H). 로그인 전·후 같은 홈이다.
// 검색 → 카테고리 칩 → Trending now 추천 카드. 링크 넣기는 하단 탭 [+ Convert], 만드는 중 카드는 Recipe book으로 옮겼다.
// 설정 톱니(T Settings)·카드 [+] 바로 저장(K 카테고리 시트)은 그 화면을 만들 때 붙인다.
import Link from "next/link";
import { useEffect, useState } from "react";
import { TabBar } from "@/components/tab-bar";
import { type FeaturedCategory, type FeaturedRecipe, api } from "@/lib/api";
import {
  FEATURED_CHIPS,
  PLATFORM_LABEL,
  durationText,
  filterFeatured,
  ingredientSummary,
  saveCountText,
} from "@/lib/featured";

export function HomeScreen() {
  const [featured, setFeatured] = useState<FeaturedRecipe[] | null>(null); // null = 불러오는 중
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<FeaturedCategory | "all">("all");

  useEffect(() => {
    let alive = true;
    // 추천을 못 불러오면 빈 목록처럼 보여 준다. 링크 넣기는 탭에서 그대로 된다
    api.listFeatured().then(
      (list) => alive && setFeatured(list),
      () => alive && setFeatured([]),
    );
    return () => {
      alive = false;
    };
  }, []);

  const shown = featured ? filterFeatured(featured, query, category) : [];
  const hasFeatured = featured !== null && featured.length > 0;

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center px-5 pt-4 pb-2">
        <span className="rounded-xl border-2 border-foreground px-2.5 py-0.5 text-xl font-bold tracking-tight">pinch</span>
      </header>

      <h1 className="px-5 pt-4 text-[28px] leading-tight font-bold">What should I cook today?</h1>

      {hasFeatured && (
        <>
          <form role="search" onSubmit={(e) => e.preventDefault()} className="px-5 pt-5">
            <label htmlFor="search" className="sr-only">
              Search recipes or ingredients
            </label>
            <div className="flex h-13 items-center rounded-full border border-line-strong pr-1.5 pl-4 focus-within:border-foreground">
              <input
                id="search"
                type="search"
                autoComplete="off"
                placeholder="Search recipes or ingredients"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none"
              />
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-foreground text-background" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <circle cx="11" cy="11" r="6.5" />
                  <path d="M16 16l4 4" />
                </svg>
              </span>
            </div>
          </form>

          <ul aria-label="Categories" className="flex gap-3 overflow-x-auto px-5 pt-5 [scrollbar-width:none]">
            {FEATURED_CHIPS.map((chip) => {
              const active = chip.id === category;
              return (
                <li key={chip.id} className="shrink-0">
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => setCategory(chip.id)}
                    className="flex w-[72px] flex-col items-center gap-1.5 text-xs"
                  >
                    <span
                      className={`flex size-14 items-center justify-center rounded-full text-2xl ${
                        active ? "border-2 border-foreground bg-subtle" : "border border-line bg-subtle"
                      }`}
                      aria-hidden="true"
                    >
                      {chip.emoji}
                    </span>
                    <span className={active ? "font-bold" : "text-muted"}>{chip.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <section aria-labelledby="trending" className="flex flex-col pt-7 pb-8">
        <h2 id="trending" className="px-5 text-lg font-bold">
          Trending now
        </h2>
        {featured === null && <p className="px-5 py-10 text-center text-sm text-muted">Loading…</p>}
        {featured !== null && !hasFeatured && (
          <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
            <p className="text-sm text-muted">Trending recipes are coming soon.</p>
            <Link href="/convert" className="flex h-12 items-center rounded-full bg-foreground px-6 text-[15px] font-bold text-background">
              Convert a video
            </Link>
          </div>
        )}
        {hasFeatured && shown.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-muted">No recipes match. Try another word.</p>
        )}
        {shown.length > 0 && (
          <ul className="mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-5 px-5 pb-1 [scrollbar-width:none]">
            {shown.map((r) => (
              <li key={r.runId} className="w-[72%] shrink-0 snap-start">
                <FeaturedCard recipe={r} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <TabBar />
    </main>
  );
}

function FeaturedCard({ recipe: r }: { recipe: FeaturedRecipe }) {
  const saves = saveCountText(r.saveCount);
  const meta = [ingredientSummary(r), durationText(r.durationMs)].filter(Boolean).join(" · ");
  return (
    <Link href={`/r/${encodeURIComponent(r.runId)}`} className="flex flex-col gap-2">
      <span className="relative block aspect-square w-full overflow-hidden rounded-3xl bg-subtle">
        {r.thumbnailUrl ? (
          // 썸네일은 받아 저장하지 않고 원래 주소를 그대로 띄운다(#57 5절)
          // eslint-disable-next-line @next/next/no-img-element
          <img src={r.thumbnailUrl} alt="" className="size-full object-cover" />
        ) : (
          // 썸네일이 없으면(Instagram·업로드·목업) 요리명 글자 카드
          <span className="flex size-full items-center justify-center p-6 text-center text-xl leading-snug font-bold text-muted">
            {r.title}
          </span>
        )}
        <span className="absolute top-3 left-3 rounded-full border border-foreground bg-background px-2.5 py-0.5 text-xs font-bold">
          ▶ {PLATFORM_LABEL[r.platform]}
        </span>
        {saves && (
          <span className="absolute right-3 bottom-3 rounded-full border border-foreground bg-background px-2.5 py-0.5 text-xs font-bold">
            {saves}
          </span>
        )}
      </span>
      <span className="line-clamp-2 text-lg leading-snug font-bold">{r.title}</span>
      <span className="flex flex-col text-[13px] text-muted">
        {meta && <span className="truncate">{meta}</span>}
        <span className="truncate">@{r.creator}</span>
      </span>
    </Link>
  );
}

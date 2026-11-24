"use client";

// S6 한 화면 홈(Pinch 시안 01). 로그인 전·후 같은 홈을 쓴다.
// 위에서부터 로고·설정 → 제목 → 검색 → 취향 칩 → 시즌 특집 → Trending → 주제별 줄 → "만드는 중" 카드 → 내 최근 레시피.
// 11/24 홈 A안: 칩은 필터다. All이면 시즌 특집·Trending·주제별 줄이 다 보이고, 칩(또는 검색)을 쓰면 편집 영역을 숨기고
// 거른 레시피만 보여 준다. 시즌·원팟 같은 묶음은 칩이 아니라 갈아 끼우는 편집 영역(content/home.ts)이다.
// 링크 넣기는 하단 탭 가운데 Convert(/convert)로 옮겼다.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { JobCardList, RecipeCard } from "@/components/book-cards";
import { Logo } from "@/components/logo";
import { TabBar } from "@/components/tab-bar";
import { RecipeRow } from "@/components/recipe-tile";
import { HOME_EDITORIAL } from "@/content/home";
import { type Job, type RecipeSummary, type RecommendationGroup, type User, api } from "@/lib/api";
import { jobCards } from "@/lib/book";
import { FEATURED_CHIPS, type FeaturedChipId } from "@/lib/featured";
import { resolveEditorial } from "@/lib/home-editorial";
import { IssueHero } from "./issue-hero";
import { type BookHidden, hideJob, readBookHidden } from "@/lib/book-hidden";
import { recentJobIds } from "@/lib/recent-jobs";

const POLL_MS = 3000;
const RECENT_COUNT = 3;
// All 홈의 Trending 줄에 적어도 보여 줄 카드 수
const TRENDING_MIN = 4;
// 로그인 전 실패 카드 [닫기]는 이 브라우저에만 남긴다
const GUEST = "guest";

interface Mine {
  jobs: Job[];
  recipes: RecipeSummary[];
  hidden: BookHidden;
}

export function HomeScreen() {
  const [user, setUser] = useState<User | null | undefined>(undefined); // undefined = 아직 모름
  const [mine, setMine] = useState<Mine | null>(null);
  const [groups, setGroups] = useState<RecommendationGroup[]>([]);
  const [today, setToday] = useState<Date | null>(null); // 특집 기한 비교용. 미리 렌더링 때는 읽지 않는다
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<FeaturedChipId>("all");

  useEffect(() => {
    let alive = true;
    api.getUser().then(
      (u) => alive && setUser(u),
      () => alive && setUser(null),
    );
    // 추천을 못 불러오면 묶음 칸만 숨긴다. 홈의 다른 부분은 그대로 쓴다
    api.listRecommendations().then(
      (g) => {
        if (!alive) return;
        setGroups(g);
        setToday(new Date());
      },
      () => {},
    );
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (user === undefined) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const next: Mine = user
          ? { ...(await loadSignedIn()), hidden: readBookHidden(user.id) }
          : { jobs: await loadGuestJobs(), recipes: [], hidden: readBookHidden(GUEST) };
        if (cancelled) return;
        setMine(next);
        if (next.jobs.some((j) => j.status === "queued" || j.status === "running")) timer = setTimeout(refresh, POLL_MS);
      } catch {
        // 못 불러오면 카드·최근 레시피 없이 홈을 보여 준다
        if (!cancelled) setMine({ jobs: [], recipes: [], hidden: readBookHidden(user?.id ?? GUEST) });
      }
    }
    refresh();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [user]);

  // 시즌 특집·주제별 줄(content/home.ts). 칩·검색과 상관없이 고정이다(screen-data H).
  const editorial = useMemo(
    () => (today ? resolveEditorial(HOME_EDITORIAL, groups, today) : { issue: null, shelves: [], usedRunIds: new Set<string>() }),
    [groups, today],
  );

  // 검색은 추천 목록 안에서만 거른다(웹에서, #64 리뷰). 요리명·크리에이터로 찾는다.
  // All: Trending은 편집 영역에 나온 레시피를 빼고 보여 주되, 모자라면 편집 영역 레시피로 채워 줄이 비지 않게 한다.
  // 칩·검색: 편집 영역 레시피까지 모두에서 찾고, 줄 제목을 칩 이름("Vegan")이나 "Results"로 바꾼다.
  const filtering = query.trim() !== "" || category !== "all";
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (filtering) {
      const chip = FEATURED_CHIPS.find((c) => c.id === category);
      return groups
        .map((g) => ({
          ...g,
          title: category === "all" ? "Results" : (chip?.label ?? g.title),
          cards: g.cards.filter(
            (c) =>
              (category === "all" || (c.categories ?? []).includes(category)) &&
              (!q || c.title.toLowerCase().includes(q) || c.creator.toLowerCase().includes(q)),
          ),
        }))
        .filter((g) => g.cards.length > 0);
    }
    return groups
      .map((g) => {
        const fresh = g.cards.filter((c) => !editorial.usedRunIds.has(c.runId));
        const fill = fresh.length >= TRENDING_MIN ? [] : g.cards.filter((c) => editorial.usedRunIds.has(c.runId));
        return { ...g, cards: [...fresh, ...fill].slice(0, Math.max(TRENDING_MIN, fresh.length)) };
      })
      .filter((g) => g.cards.length > 0);
  }, [groups, query, category, editorial, filtering]);

  const cards = mine ? jobCards(mine.jobs, mine.recipes, mine.hidden) : [];
  const recent = mine?.recipes.slice(0, RECENT_COUNT) ?? [];

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between px-6 pt-4">
        <Logo />
        <Link href="/settings" aria-label="Settings" className="flex size-10 items-center justify-center rounded-full border border-line bg-card">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
          </svg>
        </Link>
      </header>

      <section className="px-6 pt-5">
        <h1 className="text-[28px] leading-[1.15] font-bold">What should I cook today?</h1>
        <label className="mt-4 flex h-12 items-center justify-between gap-2 rounded-full border border-line bg-card pr-1.5 pl-[18px] focus-within:border-foreground">
          <span className="sr-only">Search recipes</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search recipes or ingredients"
            className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
          />
          <span className="flex size-[38px] shrink-0 items-center justify-center rounded-full bg-ink text-white" aria-hidden="true">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
          </span>
        </label>
      </section>

      <nav aria-label="Categories" className="mt-5 flex justify-between gap-1 overflow-x-auto px-6 [scrollbar-width:none]">
        {FEATURED_CHIPS.map((c) => {
          const on = category === c.id;
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={on}
              onClick={() => setCategory(c.id)}
              className="flex shrink-0 flex-col items-center gap-1.5 text-[11.5px] font-medium"
            >
              <span
                className={`flex size-14 items-center justify-center rounded-full border-2 text-[26px] ${
                  on ? "border-foreground bg-pink-tint" : "border-transparent bg-card"
                }`}
                aria-hidden="true"
              >
                {c.emoji}
              </span>
              {c.label}
            </button>
          );
        })}
      </nav>

      {!filtering && editorial.issue && <IssueHero issue={editorial.issue} />}
      {shown.map((group) => (
        <RecipeRow key={group.id} id={`reco-${group.id}`} title={group.title} cards={group.cards} />
      ))}
      {filtering && shown.length === 0 && groups.length > 0 && (
        <p className="px-6 pt-6 text-sm text-muted">No recipes match. Try another word or category.</p>
      )}
      {!filtering &&
        editorial.shelves.map((shelf, i) => <RecipeRow key={shelf.title} id={`shelf-${i}`} title={shelf.title} cards={shelf.cards} />)}

      {cards.length > 0 && (
        <section aria-label="Recipes in progress" className="flex flex-col gap-3 px-6 pt-8">
          <JobCardList
            cards={cards}
            onHide={(jobId) => {
              const owner = user?.id ?? GUEST;
              hideJob(owner, jobId);
              setMine((m) => m && { ...m, hidden: readBookHidden(owner) });
            }}
          />
        </section>
      )}

      <section aria-labelledby="recent" className="flex flex-col gap-3 px-6 pt-8 pb-4">
        <div className="flex items-center justify-between">
          <h2 id="recent" className="text-xl font-bold">
            Your recent recipes
          </h2>
          {recent.length > 0 && (
            <Link href="/book" className="flex min-h-11 items-center px-1 text-sm font-medium text-muted">
              See all
            </Link>
          )}
        </div>
        {recent.length > 0 ? (
          recent.map((r) => <RecipeCard key={r.id} recipe={r} />)
        ) : (
          <Link href="/convert" className="flex items-center justify-between rounded-[22px] bg-card px-4 py-4 text-sm">
            <span className="text-muted">Recipes you save show up here.</span>
            <span className="font-bold">Convert a video ›</span>
          </Link>
        )}
      </section>

      <TabBar />
    </main>
  );
}

async function loadSignedIn(): Promise<Pick<Mine, "jobs" | "recipes">> {
  const [jobs, recipes] = await Promise.all([api.listMyJobs(), api.listRecipes()]);
  return { jobs, recipes };
}

/** 로그인 전: 이 브라우저에서 만든 작업. 찾을 수 없는 작업은 뺀다 */
async function loadGuestJobs(): Promise<Job[]> {
  const jobs = await Promise.all(recentJobIds().map((id) => api.getJob(id).catch(() => null)));
  return jobs.filter((j): j is Job => j !== null);
}

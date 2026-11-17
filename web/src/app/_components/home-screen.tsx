"use client";

// S6 한 화면 홈(docs/ux-flow.md). 로그인 전·후 같은 홈을 쓴다.
// 위에서부터 링크 입력 → "만드는 중" 카드 → 추천 레시피 묶음 → 내 최근 레시피.
import Link from "next/link";
import { useEffect, useState } from "react";
import { JobCardList, RecipeCard } from "@/components/book-cards";
import { Logo } from "@/components/logo";
import { TabBar } from "@/components/tab-bar";
import { type Job, type RecipeSummary, type RecommendationGroup, type User, api } from "@/lib/api";
import { jobCards } from "@/lib/book";
import { type BookHidden, hideJob, readBookHidden } from "@/lib/book-hidden";
import { recentJobIds } from "@/lib/recent-jobs";
import { LinkInputForm } from "./link-input-form";

const POLL_MS = 3000;
const RECENT_COUNT = 3;
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

  useEffect(() => {
    let alive = true;
    api.getUser().then(
      (u) => alive && setUser(u),
      () => alive && setUser(null),
    );
    // 추천을 못 불러오면 묶음 칸만 숨긴다. 홈의 다른 부분은 그대로 쓴다
    api.listRecommendations().then(
      (g) => alive && setGroups(g),
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
        // 못 불러오면 카드·최근 레시피 없이 홈을 보여 준다. 링크 입력은 그대로 된다
        if (!cancelled) setMine({ jobs: [], recipes: [], hidden: readBookHidden(user?.id ?? GUEST) });
      }
    }
    refresh();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [user]);

  const cards = mine ? jobCards(mine.jobs, mine.recipes, mine.hidden) : [];
  const recent = mine?.recipes.slice(0, RECENT_COUNT) ?? [];

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center px-5 pt-4 pb-2">
        <Logo />
      </header>

      <section className="flex flex-col gap-3 px-5 pt-4">
        <h1 className="text-[28px] leading-[1.15] font-bold">What should I cook today?</h1>
        <p className="text-sm leading-relaxed text-muted">Paste a cooking Short and get the ingredients, amounts and steps.</p>
      </section>

      <LinkInputForm />

      {cards.length > 0 && (
        <section aria-label="Recipes in progress" className="flex flex-col gap-3 px-5 pt-8">
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

      {groups.map((group) => (
        <section key={group.id} aria-labelledby={`reco-${group.id}`} className="flex flex-col pt-9">
          <h2 id={`reco-${group.id}`} className="px-5 text-xl font-bold">
            {group.title}
          </h2>
          <ul className="mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-5 px-5 pb-1 [scrollbar-width:none]">
            {group.cards.map((card) => (
              <li key={card.runId} className="w-40 shrink-0 snap-start">
                <Link href={`/r/${encodeURIComponent(card.runId)}`} className="flex flex-col gap-2">
                  {/* 원본 썸네일을 쓸지는 저작권 기준과 같이 정한다(docs/ux-flow.md S6 [결정 필요]) */}
                  <span className="photo aspect-[4/5] w-full rounded-[20px]" aria-hidden="true" />
                  <span className="line-clamp-2 text-[15px] leading-snug font-bold">{card.title}</span>
                  <span className="flex flex-col text-xs text-muted">
                    <span className="truncate">{card.creator}</span>
                    <span>{card.ingredientCount} ingredients</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section aria-labelledby="recent" className="flex flex-col gap-3 px-5 pt-9 pb-4">
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
          <p className="rounded-[22px] bg-card px-4 py-5 text-sm text-muted">Recipes you save show up here.</p>
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

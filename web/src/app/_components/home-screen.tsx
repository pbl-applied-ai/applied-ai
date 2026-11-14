"use client";

// S6 한 화면 홈(docs/ux-flow.md). 로그인 전·후 같은 홈을 쓴다.
// 위에서부터 링크 입력 → "만드는 중" 카드 → 추천 레시피 묶음 → 내 최근 레시피.
import Link from "next/link";
import { useEffect, useState } from "react";
import { JobCardList, RecipeCard } from "@/components/book-cards";
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
      <header className="flex items-center py-3 pr-3 pl-5">
        <span className="text-[15px] font-bold">숏폼 레시피</span>
      </header>

      <section className="flex flex-col gap-3 px-5 pt-4">
        <h1 className="text-[24px] leading-snug font-bold">
          저장만 해 둔 요리 숏폼,
          <br />
          따라 할 수 있는 레시피로
        </h1>
        <p className="text-sm leading-relaxed text-muted">Shorts 링크를 넣으면 재료·분량·조리 순서를 정리해 드려요.</p>
      </section>

      <LinkInputForm />

      {cards.length > 0 && (
        <section aria-label="레시피 만드는 중" className="flex flex-col gap-3 px-5 pt-8">
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
          <h2 id={`reco-${group.id}`} className="px-5 text-lg font-bold">
            {group.title}
          </h2>
          <ul className="mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-5 px-5 pb-1 [scrollbar-width:none]">
            {group.cards.map((card) => (
              <li key={card.runId} className="w-32 shrink-0 snap-start">
                <Link href={`/r/${encodeURIComponent(card.runId)}`} className="flex flex-col gap-1.5">
                  {/* 원본 썸네일을 쓸지는 저작권 기준과 같이 정한다(docs/ux-flow.md S6 [결정 필요]) */}
                  <span className="aspect-square w-full rounded-xl bg-[#e9e9e5]" aria-hidden="true" />
                  <span className="line-clamp-2 text-[15px] leading-snug font-bold">{card.title}</span>
                  <span className="flex flex-col text-xs text-muted">
                    <span className="truncate">{card.creator}</span>
                    <span>재료 {card.ingredientCount}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section aria-labelledby="recent" className="flex flex-col gap-3 px-5 pt-9 pb-8">
        <div className="flex items-center justify-between">
          <h2 id="recent" className="text-lg font-bold">
            내 최근 레시피
          </h2>
          {recent.length > 0 && (
            <Link href="/book" className="flex min-h-11 items-center px-1 text-sm font-medium text-muted">
              전체 보기
            </Link>
          )}
        </div>
        {recent.length > 0 ? (
          recent.map((r) => <RecipeCard key={r.id} recipe={r} />)
        ) : (
          <p className="text-sm text-muted">저장한 레시피가 여기 모여요.</p>
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

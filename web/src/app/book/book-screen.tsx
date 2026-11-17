"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { type Job, type RecipeSummary, api } from "@/lib/api";
import { type JobCard, jobCards } from "@/lib/book";
import { type BookHidden, hideJob, readBookHidden } from "@/lib/book-hidden";
import { useRequireUser } from "@/lib/use-require-user";
import { JobCardList, RecipeCard } from "@/components/book-cards";
import { TabBar } from "@/components/tab-bar";

const POLL_MS = 3000;

export function BookScreen() {
  const router = useRouter();
  const user = useRequireUser("/book");
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [recipes, setRecipes] = useState<RecipeSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [hidden, setHidden] = useState<BookHidden | null>(null);

  useEffect(() => {
    if (!user) return;
    const userId = user.id;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const [nextJobs, nextRecipes] = await Promise.all([api.listMyJobs(), api.listRecipes()]);
        if (cancelled) return;
        setJobs(nextJobs);
        setRecipes(nextRecipes);
        setHidden(readBookHidden(userId));
        setFailed(false);
        // 만드는 중인 작업이 있으면 카드 문구가 바뀌도록 가끔 다시 읽는다
        if (nextJobs.some((j) => j.status === "queued" || j.status === "running")) timer = setTimeout(refresh, POLL_MS);
      } catch {
        if (!cancelled) setFailed(true);
      }
    }
    refresh();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [user]);

  const cards: JobCard[] = jobs && recipes && hidden ? jobCards(jobs, recipes, hidden) : [];
  const loading = !user || ((jobs === null || recipes === null) && !failed);

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between px-5 pt-5 pb-3">
        <h1 className="text-[28px] font-bold">Recipe book</h1>
        <button
          type="button"
          aria-label="Sign out"
          title="Sign out"
          onClick={async () => {
            await api.signOut();
            router.replace("/");
          }}
          className="flex size-11 items-center justify-center rounded-full border border-line bg-card"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8a7a72" strokeWidth="2" aria-hidden="true">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
          </svg>
        </button>
      </header>

      <div className="px-5 pb-4">
        <Link href="/?new=1" className="btn-primary">
          + Convert a video
        </Link>
      </div>

      {loading && <p className="px-5 py-10 text-center text-sm text-muted">Loading…</p>}

      {failed && (
        <p role="alert" className="px-5 py-10 text-center text-sm text-danger">
          Couldn&apos;t load your recipe book. Please try again in a moment.
        </p>
      )}

      {!loading && !failed && (
        <div className="flex flex-col gap-3 px-5 pb-8">
          <JobCardList
            cards={cards}
            onHide={(jobId) => {
              if (!user) return;
              hideJob(user.id, jobId);
              setHidden(readBookHidden(user.id));
            }}
          />

          {recipes && recipes.length > 0 && (
            <>
              <h2 className="mt-3 text-sm font-medium text-muted">{recipes.length} saved {recipes.length === 1 ? "recipe" : "recipes"}</h2>
              {recipes.map((r) => (
                <RecipeCard key={r.id} recipe={r} />
              ))}
            </>
          )}

          {recipes && recipes.length === 0 && cards.length === 0 && (
            <div className="flex flex-col items-center gap-3 px-5 py-16 text-center">
              <span className="sticker bg-pink text-2xl" aria-hidden="true">pinch</span>
              <p className="text-base font-bold">No saved recipes yet</p>
              <p className="text-sm leading-relaxed text-muted">
                Turn the cooking shorts you saved
                <br />
                into recipes you can follow.
              </p>
            </div>
          )}
        </div>
      )}
      <TabBar />
    </main>
  );
}

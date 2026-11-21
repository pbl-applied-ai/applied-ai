"use client";

// S1 레시피북(Pinch 시안 03·04·06). 로그인 전에는 로그인 화면으로 보내지 않고 이 화면 안에서 로그인을 권한다.
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { type Job, type RecipeSummary, type User, api } from "@/lib/api";
import { type JobCard, jobCards } from "@/lib/book";
import { type BookHidden, hideJob, readBookHidden } from "@/lib/book-hidden";
import { JobCardList, RecipeGridCard } from "@/components/book-cards";
import { EmojiHero } from "@/components/emoji-hero";
import { TabBar } from "@/components/tab-bar";
import { GoogleButton } from "../login/google-button";

const POLL_MS = 3000;

export function BookScreen() {
  const [user, setUser] = useState<User | null | undefined>(undefined); // undefined = 아직 모름
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [recipes, setRecipes] = useState<RecipeSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [hidden, setHidden] = useState<BookHidden | null>(null);

  useEffect(() => {
    let alive = true;
    api.getUser().then(
      (u) => alive && setUser(u),
      () => alive && setUser(null),
    );
    return () => {
      alive = false;
    };
  }, []);

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
  const loading = user === undefined || (user !== null && (jobs === null || recipes === null) && !failed);
  const count = recipes?.length ?? 0;

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between px-6 pt-6 pb-2">
        <h1 className="text-[28px] leading-[1.15] font-bold">My recipe book</h1>
        {user && count > 0 && <span className="sticker bg-orange text-base">{count}</span>}
      </header>

      {loading && <p className="px-6 py-10 text-center text-sm text-muted">Loading…</p>}

      {user === null && (
        <section className="flex flex-col items-center px-6 pt-20 text-center">
          <EmojiHero emoji="📖" sticker="yours" circle="bg-pink-tint" stickerColor="bg-orange" />
          <h2 className="mt-7 text-xl font-bold">Sign in to see your recipe book</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Your saved recipes live here.
            <br />
            You can still convert videos without an account.
          </p>
          <div className="mt-6 w-full">
            <Suspense fallback={null}>
              <GoogleButton returnTo="/book" />
            </Suspense>
          </div>
        </section>
      )}

      {user && failed && (
        <p role="alert" className="px-6 py-10 text-center text-sm text-danger">
          Couldn&apos;t load your recipe book. Please try again in a moment.
        </p>
      )}

      {user && !loading && !failed && (
        <div className="flex flex-col gap-3 px-6 pt-2 pb-4">
          <JobCardList
            cards={cards}
            onHide={(jobId) => {
              hideJob(user.id, jobId);
              setHidden(readBookHidden(user.id));
            }}
          />

          {recipes && recipes.length > 0 && (
            <>
              <p className="mt-2 text-sm text-muted">Recently saved</p>
              <div className="grid grid-cols-2 gap-x-3.5 gap-y-5">
                {recipes.map((r) => (
                  <RecipeGridCard key={r.id} recipe={r} />
                ))}
              </div>
            </>
          )}

          {recipes && recipes.length === 0 && cards.length === 0 && (
            <section className="flex flex-col items-center pt-20 text-center">
              <EmojiHero emoji="🍳" sticker="empty!" circle="bg-orange-tint" stickerColor="bg-pink" />
              <h2 className="mt-7 text-xl font-bold">No recipes saved yet</h2>
              <p className="mt-2 text-sm text-muted">Paste a cooking video link to get a recipe.</p>
              <Link href="/convert?new=1" className="btn-primary mt-6 w-[220px]">
                Convert a video
              </Link>
            </section>
          )}
        </div>
      )}
      <TabBar />
    </main>
  );
}

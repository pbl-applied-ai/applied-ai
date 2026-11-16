"use client";

// B Recipe book (docs/screen-data.md #57 2절 B). 하단 탭으로 온다.
// 로그인 전: "Sign in to see your recipe book" + 이 브라우저에서 만든 작업 카드(recent-jobs). 로그인 화면으로 보내지 않는다.
// 로그인 후: 내 작업 카드 + 저장한 레시피. 카테고리 칩·정렬·격자 카드는 K 카테고리 시트와 같이 바꾼다.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { GoogleButton } from "@/app/login/google-button";
import { JobCardList, RecipeCard } from "@/components/book-cards";
import { TabBar } from "@/components/tab-bar";
import { type Job, type RecipeSummary, type User, api } from "@/lib/api";
import { type JobCard, jobCards } from "@/lib/book";
import { type BookHidden, hideJob, readBookHidden } from "@/lib/book-hidden";
import { forgetRecentJob, recentJobIds } from "@/lib/recent-jobs";

const POLL_MS = 3000;
// 로그인 전 실패 카드 [닫기]는 이 브라우저에만 남긴다
const GUEST = "guest";

interface Book {
  jobs: Job[];
  recipes: RecipeSummary[];
  hidden: BookHidden;
}

export function BookScreen() {
  const router = useRouter();
  const [user, setUser] = useState<User | null | undefined>(undefined); // undefined = 아직 모름
  const [book, setBook] = useState<Book | null>(null);
  const [failed, setFailed] = useState(false);

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
    if (user === undefined) return;
    const owner = user?.id ?? GUEST;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const [jobs, recipes] = user ? await Promise.all([api.listMyJobs(), api.listRecipes()]) : [await loadGuestJobs(), []];
        if (cancelled) return;
        setBook({ jobs, recipes, hidden: readBookHidden(owner) });
        setFailed(false);
        // 만드는 중인 작업이 있으면 카드 문구가 바뀌도록 가끔 다시 읽는다
        if (jobs.some((j) => j.status === "queued" || j.status === "running")) timer = setTimeout(refresh, POLL_MS);
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

  const cards: JobCard[] = book ? jobCards(book.jobs, book.recipes, book.hidden) : [];
  const loading = user === undefined || (book === null && !failed);

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between px-5 pt-5 pb-3">
        <h1 className="text-[26px] font-bold">My recipe book</h1>
        {user && (
          <button
            type="button"
            aria-label="Sign out"
            title="Sign out"
            onClick={async () => {
              await api.signOut();
              router.replace("/");
            }}
            className="flex size-11 items-center justify-center rounded-full border border-line bg-subtle"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5c5c5c" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
            </svg>
          </button>
        )}
      </header>

      {loading && <p className="px-5 py-10 text-center text-sm text-muted">Loading…</p>}

      {failed && (
        <p role="alert" className="px-5 py-10 text-center text-sm text-danger">
          We couldn&apos;t load your recipe book. Please try again in a moment.
        </p>
      )}

      {!loading && !failed && (
        <div className="flex flex-1 flex-col gap-3 px-5 pb-8">
          <JobCardList
            cards={cards}
            onHide={(jobId) => {
              const owner = user?.id ?? GUEST;
              hideJob(owner, jobId);
              setBook((b) => b && { ...b, hidden: readBookHidden(owner) });
            }}
            // 로그인 전: 준비된 레시피를 열면 카드에서 뺀다(#57 5절). 실패는 처리 중 화면이 연 뒤에 뺀다
            onOpen={(card) => !user && card.kind === "ready" && forgetRecentJob(card.jobId)}
          />

          {!user && <SignInPrompt />}

          {user && book && book.recipes.length > 0 && (
            <>
              <h2 className="mt-3 text-sm font-medium text-muted">Saved recipes {book.recipes.length}</h2>
              {book.recipes.map((r) => (
                <RecipeCard key={r.id} recipe={r} />
              ))}
            </>
          )}

          {user && book && book.recipes.length === 0 && cards.length === 0 && (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
              <span className="text-5xl" aria-hidden="true">
                📖
              </span>
              <p className="text-lg font-bold">No recipes saved yet</p>
              <p className="text-sm leading-relaxed text-muted">Turn a cooking short into a recipe you can follow.</p>
              <Link href="/convert" className="mt-2 flex h-12 items-center rounded-full bg-foreground px-6 text-[15px] font-bold text-background">
                Convert a video
              </Link>
            </div>
          )}
        </div>
      )}
      <TabBar />
    </main>
  );
}

function SignInPrompt() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-10 text-center">
      <span className="flex size-28 items-center justify-center rounded-full bg-subtle text-5xl" aria-hidden="true">
        📖
      </span>
      <p className="mt-2 text-lg font-bold">Sign in to see your recipe book</p>
      <p className="text-sm leading-relaxed text-muted">
        Your saved recipes live here.
        <br />
        You can still convert videos without an account.
      </p>
      {/* 로그인하고 이 화면으로 돌아온다(next가 없으면 /book) */}
      <div className="mt-3 flex w-full flex-col">
        <Suspense fallback={null}>
          <GoogleButton />
        </Suspense>
      </div>
    </div>
  );
}

/** 로그인 전: 이 브라우저에서 만든 작업. 찾을 수 없는 작업은 뺀다 */
async function loadGuestJobs(): Promise<Job[]> {
  const jobs = await Promise.all(recentJobIds().map((id) => api.getJob(id).catch(() => null)));
  return jobs.filter((j): j is Job => j !== null);
}

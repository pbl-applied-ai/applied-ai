"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { type Job, type RecipeSummary, api } from "@/lib/api";
import { type JobCard, jobCards, shortDate } from "@/lib/book";
import { type BookHidden, hideJob, readBookHidden } from "@/lib/book-hidden";
import { useRequireUser } from "@/lib/use-require-user";

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
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const [nextJobs, nextRecipes] = await Promise.all([api.listMyJobs(), api.listRecipes()]);
        if (cancelled) return;
        setJobs(nextJobs);
        setRecipes(nextRecipes);
        setHidden(readBookHidden());
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
        <h1 className="text-[22px] font-bold">내 레시피북</h1>
        <button
          type="button"
          aria-label="로그아웃"
          title="로그아웃"
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
      </header>

      <div className="px-5 pb-4">
        <Link href="/?new=1" className="flex h-13 items-center justify-center gap-2 rounded-xl bg-foreground text-base font-bold text-background">
          + 영상으로 레시피 만들기
        </Link>
      </div>

      {loading && <p className="px-5 py-10 text-center text-sm text-muted">불러오는 중…</p>}

      {failed && (
        <p role="alert" className="px-5 py-10 text-center text-sm text-danger">
          레시피북을 불러오지 못했어요. 잠시 뒤에 다시 열어 주세요.
        </p>
      )}

      {!loading && !failed && (
        <div className="flex flex-col gap-3 px-5 pb-8">
          {cards.map((card) => (
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
                  onClick={() => {
                    hideJob(card.jobId);
                    setHidden(readBookHidden());
                  }}
                  className="mr-1 flex size-11 shrink-0 items-center justify-center rounded-full"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5c5c5c" strokeWidth="2" aria-hidden="true">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              )}
            </div>
          ))}

          {recipes && recipes.length > 0 && (
            <>
              <h2 className="mt-3 text-sm font-medium text-muted">저장한 레시피 {recipes.length}</h2>
              {recipes.map((r) => (
                <Link key={r.id} href={`/recipes/${encodeURIComponent(r.id)}`} className="flex gap-3 rounded-xl border border-line p-3.5">
                  <span className="size-16 shrink-0 rounded-lg bg-[#e9e9e5]" aria-hidden="true" />
                  <span className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
                    <span className="truncate text-base font-bold">{r.title}</span>
                    <span className="text-[13px] text-muted">
                      재료 {r.ingredientCount} · {shortDate(r.createdAt)} 저장
                    </span>
                  </span>
                </Link>
              ))}
            </>
          )}

          {recipes && recipes.length === 0 && cards.length === 0 && (
            <div className="flex flex-col items-center gap-3 px-5 py-16 text-center">
              <span className="size-[72px] rounded-2xl border border-dashed border-line-strong bg-subtle" aria-hidden="true" />
              <p className="text-base font-medium">아직 저장한 레시피가 없어요</p>
              <p className="text-sm leading-relaxed text-muted">
                저장해 둔 요리 숏폼,
                <br />
                텍스트 레시피로 바꿔 보세요.
              </p>
            </div>
          )}
        </div>
      )}
    </main>
  );
}

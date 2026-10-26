"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { type UserRecipe, api } from "@/lib/api";
import { shortDate } from "@/lib/book";
import { amountView } from "@/lib/review";
import { useRequireUser } from "@/lib/use-require-user";

type Load = { kind: "loading" } | { kind: "missing" } | { kind: "ready"; recipe: UserRecipe };

export function DetailScreen() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const user = useRequireUser(`/recipes/${id}`);
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    api
      .getRecipe(id)
      .then((recipe) => !cancelled && setLoad(recipe ? { kind: "ready", recipe } : { kind: "missing" }))
      .catch(() => !cancelled && setLoad({ kind: "missing" }));
    return () => {
      cancelled = true;
    };
  }, [id, user]);

  if (load.kind === "missing") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
        <p role="alert" className="text-lg font-bold">
          레시피를 찾을 수 없어요
        </p>
        <p className="text-sm text-muted">삭제됐거나 다른 계정의 레시피예요.</p>
        <Link href="/book" className="mt-4 text-sm text-link underline">
          레시피북으로
        </Link>
      </main>
    );
  }

  if (load.kind === "loading") {
    return <main className="flex flex-1 items-center justify-center text-sm text-muted">불러오는 중…</main>;
  }

  const { recipe } = load;

  return (
    <main className="relative flex flex-1 flex-col">
      <header className="flex items-center justify-between px-2 py-3">
        <Link href="/book" aria-label="레시피북으로" className="flex size-11 items-center justify-center">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </Link>
        <div className="flex gap-1 pr-2">
          <Link href={`/recipes/${encodeURIComponent(recipe.id)}/edit`} className="flex min-h-11 items-center px-3 text-[15px] font-medium">
            수정
          </Link>
          <button type="button" onClick={() => setConfirming(true)} className="min-h-11 px-3 text-[15px] font-medium text-danger">
            삭제
          </button>
        </div>
      </header>

      <section className="flex flex-col gap-2 px-5 pt-1">
        <h1 className="text-[26px] font-bold">{recipe.title}</h1>
        <span className="text-[13px] text-muted">{shortDate(recipe.createdAt)} 저장</span>
        {/* 업로드로 만든 레시피는 원본을 보관하지 않아서 sourceUrl이 비어 있다 → 카드 숨김 */}
        {recipe.sourceUrl && (
          <div className="mt-2 flex items-center gap-3 rounded-xl border border-line p-3">
            <span className="size-12 shrink-0 rounded-lg bg-disabled" aria-hidden="true" />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-sm font-medium">{recipe.title}</span>
              <span className="text-xs text-muted">YouTube Shorts</span>
            </span>
            <a href={recipe.sourceUrl} target="_blank" rel="noopener noreferrer" className="min-h-11 px-2 text-sm leading-[44px] text-link">
              원본 영상
            </a>
          </div>
        )}
      </section>

      <section className="flex flex-col px-5 pt-7" aria-labelledby="d-ing">
        <h2 id="d-ing" className="mb-2 text-lg font-bold">
          재료 {recipe.ingredients.length}
        </h2>
        {recipe.ingredients.map((ing) => {
          const view = amountView(ing);
          return (
            <div key={ing.id} className="flex min-h-12 items-center justify-between gap-3 border-t border-[#ecece8]">
              <span className="text-base font-medium">{ing.name}</span>
              {view.kind === "confirmed" && <span className="text-[15px]">{view.text}</span>}
              {view.kind === "missing" && <span className="text-[13px] text-muted">영상에서 확인 안 됨</span>}
              {view.kind === "user" && (
                <span className="flex flex-col items-end">
                  <span className="text-[15px]">{view.text}</span>
                  <span className="text-[11px] font-medium text-[#174a94]">직접 입력</span>
                </span>
              )}
            </div>
          );
        })}
      </section>

      <section className="flex flex-col px-5 pt-7 pb-10" aria-labelledby="d-step">
        <h2 id="d-step" className="mb-2 text-lg font-bold">
          조리 순서
        </h2>
        {recipe.steps.map((step, i) => (
          <div key={step.id} className="flex gap-3 border-t border-[#ecece8] py-3.5">
            <span className="flex size-[26px] shrink-0 items-center justify-center rounded-full bg-foreground text-[13px] font-bold text-background">
              {i + 1}
            </span>
            <span className="text-[15px] leading-relaxed">{step.text}</span>
          </div>
        ))}
      </section>

      {confirming && (
        <div className="fixed inset-0 z-10 flex items-end bg-black/45">
          <div role="dialog" aria-modal="true" aria-labelledby="del-title" className="mx-auto flex w-full max-w-md flex-col gap-3 rounded-t-2xl bg-background px-5 pt-6 pb-8">
            <p id="del-title" className="text-lg font-bold">
              이 레시피를 삭제할까요?
            </p>
            <p className="text-sm text-muted">삭제하면 되돌릴 수 없어요.</p>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => setConfirming(false)} className="h-13 flex-1 rounded-xl border-[1.5px] border-foreground text-base font-medium">
                취소
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={async () => {
                  setDeleting(true);
                  try {
                    await api.deleteRecipe(recipe.id);
                    router.replace("/book");
                  } catch {
                    setDeleting(false);
                  }
                }}
                className="h-13 flex-1 rounded-xl bg-danger text-base font-bold text-white disabled:opacity-60"
              >
                {deleting ? "삭제하는 중…" : "삭제"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

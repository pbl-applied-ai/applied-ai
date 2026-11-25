"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { RecipeView } from "@/components/recipe-view";
import { type UserRecipe, api } from "@/lib/api";
import { shortDate } from "@/lib/book";
import { rememberSavedRun } from "@/lib/book-hidden";
import { useRequireUser } from "@/lib/use-require-user";
import { sourcePlatformLabel, sourceThumbnail } from "@/lib/shorts";
import { Thumb } from "@/components/thumb";

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
          We can&apos;t find this recipe
        </p>
        <p className="text-sm text-muted">It was deleted or belongs to another account.</p>
        <Link href="/book" className="mt-4 text-sm text-muted underline underline-offset-4">
          Back to recipe book
        </Link>
      </main>
    );
  }

  if (load.kind === "loading") {
    return <main className="flex flex-1 items-center justify-center text-sm text-muted">Loading…</main>;
  }

  const { recipe } = load;

  return (
    <main className="relative flex flex-1 flex-col">
      <header className="flex items-center justify-between px-2 py-3">
        <Link href="/book" aria-label="Back to recipe book" className="flex size-11 items-center justify-center">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </Link>
        <div className="flex gap-1 pr-2">
          <Link href={`/recipes/${encodeURIComponent(recipe.id)}/edit`} className="flex min-h-11 items-center px-3 text-[15px] font-bold">
            Edit
          </Link>
          <button type="button" onClick={() => setConfirming(true)} className="min-h-11 px-3 text-[15px] font-bold text-danger">
            Delete
          </button>
        </div>
      </header>

      <section className="flex flex-col gap-2 px-5 pt-1">
        {/* YouTube는 원본 썸네일 주소를 그대로 보여 준다(#57). Instagram·업로드는 줄무늬 상자 */}
        <Thumb src={sourceThumbnail(recipe.sourceUrl)} className="mb-2 h-48 w-full rounded-[22px]" />
        <h1 className="text-[26px] leading-tight font-bold">{recipe.title}</h1>
        <span className="text-[13px] text-muted">Saved {shortDate(recipe.createdAt)}</span>
        {/* 업로드로 만든 레시피는 원본을 보관하지 않아서 sourceUrl이 비어 있다 → 카드 숨김 */}
        {recipe.sourceUrl && (
          <div className="mt-2 flex items-center gap-3 rounded-[22px] bg-card p-3">
            <Thumb src={sourceThumbnail(recipe.sourceUrl)} className="size-12 shrink-0 rounded-xl" />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-sm font-medium">{recipe.title}</span>
              <span className="text-xs text-muted">{sourcePlatformLabel(recipe.sourceUrl)}</span>
            </span>
            <a href={recipe.sourceUrl} target="_blank" rel="noopener noreferrer" className="min-h-11 px-2 text-sm leading-[44px] font-bold underline underline-offset-4">
              ▶ Watch original
            </a>
          </div>
        )}
      </section>

      <RecipeView recipe={recipe} />

      {confirming && (
        <div className="fixed inset-0 z-30 flex items-end bg-[rgba(59,31,26,0.45)]">
          <div role="dialog" aria-modal="true" aria-labelledby="del-title" className="mx-auto flex w-full max-w-md flex-col gap-3 rounded-t-[30px] bg-background px-6 pt-6 pb-8">
            <p id="del-title" className="text-lg font-bold">
              Delete this recipe?
            </p>
            <p className="text-sm text-muted">You can&apos;t undo this.</p>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => setConfirming(false)} className="btn-ghost flex-1">
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={async () => {
                  setDeleting(true);
                  try {
                    await api.deleteRecipe(recipe.id);
                    // 지운 레시피의 작업이 레시피북에 "준비됐어요" 카드로 되살아나지 않게
                    if (user) rememberSavedRun(user.id, recipe.runId);
                    router.replace("/book");
                  } catch {
                    setDeleting(false);
                  }
                }}
                className="flex min-h-[52px] flex-1 items-center justify-center rounded-full bg-danger text-[15px] font-bold text-white disabled:opacity-60"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

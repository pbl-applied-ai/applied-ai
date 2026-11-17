"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { RecipeEditor } from "@/components/recipe-editor";
import { RecipeView } from "@/components/recipe-view";
import { type EditableRecipe, type Run, type User, api, canSave, toEditable } from "@/lib/api";
import { rememberSavedRun } from "@/lib/book-hidden";
import { descriptionNotice, missingParts } from "@/lib/review";
import { useUnsavedWarning } from "@/lib/use-unsaved-warning";

type Load = { kind: "loading" } | { kind: "missing" } | { kind: "ready"; run: Run; user: User | null };

const SAVE_FAILED = "Couldn't save. Your edits are still here. Please try saving again.";

// 로그인 안 했으면 보기만 하고, 로그인하면 고치고 저장한다(KAN-32).
// 공개 링크를 받은 사람과 링크를 넣은 본인을 구분할 수 없어서 로그인 여부로만 나눈다.
export function ReviewScreen() {
  const { runId } = useParams<{ runId: string }>();
  const router = useRouter();
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [draft, setDraft] = useState<EditableRecipe | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  useUnsavedWarning(dirty && !saving);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.getRun(runId), api.getUser()])
      .then(([run, user]) => {
        if (cancelled) return;
        if (!run) {
          setLoad({ kind: "missing" });
          return;
        }
        setLoad({ kind: "ready", run, user });
        setDraft(toEditable(run));
      })
      .catch(() => !cancelled && setLoad({ kind: "missing" }));
    return () => {
      cancelled = true;
    };
  }, [runId]);

  if (load.kind === "loading" || (load.kind === "ready" && !draft)) {
    return <div className="flex flex-1 items-center justify-center text-sm text-muted">Loading…</div>;
  }

  if (load.kind === "missing" || !draft) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
        <p role="alert" className="text-lg font-bold">
          We can&apos;t find this recipe
        </p>
        <p className="text-sm text-muted">The address changed or the result is gone.</p>
        <Link href="/" className="mt-4 text-sm text-muted underline underline-offset-4">
          Try another link
        </Link>
      </div>
    );
  }

  const { run, user } = load;

  if (!user) {
    const missing = missingParts(run);
    const notice = descriptionNotice(run);
    return (
      <div className="flex flex-1 flex-col">
        <section className="flex flex-col gap-1.5 px-5 pt-3">
          <div className="photo mb-3 h-44 w-full rounded-[22px]" aria-hidden="true" />
          <h2 className="text-[26px] leading-tight font-bold">{draft.title}</h2>
          {notice && <p className="mt-1 text-[13px] text-muted">ⓘ {notice}</p>}
          {(missing.steps || missing.ingredients) && (
            <p className="mt-2 rounded-2xl bg-pink-tint px-3.5 py-3 text-[13px] leading-relaxed text-pink-ink">
              ⓘ We couldn&apos;t find the {missing.steps ? "steps" : "ingredients"} in the video.
              <br />
              Sign in to add them yourself and save.
            </p>
          )}
        </section>

        <RecipeView recipe={draft} />

        <footer className="mt-auto flex flex-col gap-2.5 px-5 pt-2 pb-8">
          <p className="text-center text-xs leading-relaxed text-muted">Sign in to fix anything that&apos;s off and save it to your recipe book.</p>
          <Link
            href={`/login?next=${encodeURIComponent(`/r/${runId}`)}`}
            className="btn-primary"
          >
            Sign in to edit & save
          </Link>
        </footer>
      </div>
    );
  }

  async function save() {
    if (!draft || !user || !canSave(draft) || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const { id } = await api.saveRecipe(draft);
      rememberSavedRun(user.id, draft.runId);
      setDirty(false);
      router.push(`/recipes/${encodeURIComponent(id)}`);
      // 화면 상태가 남아 있어서(cacheComponents) 뒤로 오면 "저장하는 중…"에 멈추지 않게 푼다
      setSaving(false);
    } catch {
      setSaving(false);
      setSaveError(SAVE_FAILED);
    }
  }

  return (
    <RecipeEditor
      run={run}
      draft={draft}
      onChange={(next) => {
        setDraft(next);
        setDirty(true);
        setSaveError(null);
      }}
      onSave={save}
      saving={saving}
      saveError={saveError}
      saveLabel="Save to recipe book"
    />
  );
}

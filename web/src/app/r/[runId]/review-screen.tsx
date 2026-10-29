"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { RecipeEditor } from "@/components/recipe-editor";
import { RecipeView } from "@/components/recipe-view";
import { type EditableRecipe, type Run, type User, api, canSave, toEditable } from "@/lib/api";
import { rememberSavedRun } from "@/lib/book-hidden";
import { isDescriptionOnly, missingParts } from "@/lib/review";
import { useUnsavedWarning } from "@/lib/use-unsaved-warning";

type Load = { kind: "loading" } | { kind: "missing" } | { kind: "ready"; run: Run; user: User | null };

const SAVE_FAILED = "저장하지 못했어요. 고친 내용은 그대로 있어요. 다시 저장해 주세요.";

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
    return <div className="flex flex-1 items-center justify-center text-sm text-muted">불러오는 중…</div>;
  }

  if (load.kind === "missing" || !draft) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
        <p role="alert" className="text-lg font-bold">
          레시피를 찾을 수 없어요
        </p>
        <p className="text-sm text-muted">주소가 바뀌었거나 없어진 결과예요.</p>
        <Link href="/" className="mt-4 text-sm text-link underline">
          다른 링크 넣기
        </Link>
      </div>
    );
  }

  const { run, user } = load;

  if (!user) {
    const missing = missingParts(run);
    return (
      <div className="flex flex-1 flex-col">
        <section className="flex flex-col gap-1.5 px-5 pt-3">
          <h2 className="text-2xl font-bold">{draft.title}</h2>
          {isDescriptionOnly(run) && <p className="mt-1 text-[13px] text-muted">ⓘ 영상 설명란만 보고 만든 레시피예요.</p>}
          {(missing.steps || missing.ingredients) && (
            <p className="mt-2 rounded-xl bg-subtle px-3.5 py-3 text-[13px] leading-relaxed">
              ⓘ 영상에서 {missing.steps ? "조리 순서" : "재료"}를 찾지 못했어요.
              <br />
              로그인하면 직접 추가해서 저장할 수 있어요.
            </p>
          )}
        </section>

        <RecipeView recipe={draft} />

        <footer className="mt-auto flex flex-col gap-2.5 px-5 pt-2 pb-8">
          <p className="text-center text-xs leading-relaxed text-muted">로그인하면 틀린 곳을 고치고 레시피북에 저장할 수 있어요.</p>
          <Link
            href={`/login?next=${encodeURIComponent(`/r/${runId}`)}`}
            className="flex h-13 items-center justify-center rounded-xl bg-foreground text-base font-bold text-background"
          >
            로그인하고 고치기
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
      saveLabel="레시피북에 저장"
    />
  );
}

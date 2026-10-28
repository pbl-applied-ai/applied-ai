"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ACTION_LABEL, type FailAction, type Job, api } from "@/lib/api";
import { failureView, stageText } from "@/lib/job-display";
import { recallJobSource, rememberJobSource } from "@/lib/job-source";

const POLL_MS = 1500;
const MAX_POLL_ERRORS = 3;
// 로그인은 KAN-24·KAN-31에서 붙인다. 그 전까지는 비로그인 화면만 보인다.
const LOGGED_IN = false;
// 영상 파일 업로드 경로가 생기면 true로 바꾼다.
const UPLOAD_READY = false;

const subscribeNothing = () => () => {};

type View =
  | { kind: "progress"; job: Job | null }
  | { kind: "failed"; job: Pick<Job, "errorCode" | "reason" | "runId"> }
  | { kind: "missing" }
  | { kind: "poll_failed" };

export function JobProgress() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [view, setView] = useState<View>({ kind: "progress", job: null });
  const [pollKey, setPollKey] = useState(0);
  // 서버에서는 탭 저장소를 읽을 수 없어 null, 브라우저에서만 기억해 둔 링크를 읽는다.
  const source = useSyncExternalStore(subscribeNothing, () => recallJobSource(id), () => null);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let errors = 0;

    async function poll() {
      try {
        const job = await api.getJob(id);
        if (cancelled) return;
        errors = 0;
        if (!job) {
          setView({ kind: "missing" });
          return;
        }
        if (job.status === "succeeded") {
          if (job.runId) {
            setView({ kind: "progress", job });
            router.replace(`/r/${encodeURIComponent(job.runId)}`);
          } else {
            // 성공인데 결과가 없으면 서버 쪽 문제다. 계속 조회하지 않고 일시 오류로 안내한다.
            setView({ kind: "failed", job: { errorCode: null, reason: null, runId: null } });
          }
          return;
        }
        if (job.status === "failed") {
          setView({ kind: "failed", job });
          return;
        }
        setView({ kind: "progress", job });
      } catch {
        if (cancelled) return;
        errors += 1;
        if (errors >= MAX_POLL_ERRORS) {
          setView({ kind: "poll_failed" });
          return;
        }
      }
      timer = setTimeout(poll, POLL_MS);
    }

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id, router, pollKey]);

  async function retryJob() {
    if (!source || retrying) return;
    setRetrying(true);
    try {
      const { jobId } = await api.createJob(source);
      rememberJobSource(jobId, source);
      router.replace(`/jobs/${encodeURIComponent(jobId)}`);
    } catch {
      setRetrying(false);
    }
  }

  if (view.kind === "poll_failed") {
    return (
      <Failure
        title="연결이 잠시 끊겼어요"
        body={"처리 상태를 불러오지 못했어요.\n다시 확인해 볼게요."}
        actions={[
          {
            label: "다시 확인",
            onClick: () => {
              setView({ kind: "progress", job: null });
              setPollKey((k) => k + 1);
            },
          },
          { label: ACTION_LABEL.other_link, href: "/" },
        ]}
      />
    );
  }

  if (view.kind === "missing") {
    return (
      <Failure
        title="이 작업을 찾을 수 없어요"
        body={"주소가 바뀌었거나 오래된 작업이에요.\n링크를 다시 넣어 주세요."}
        actions={[{ label: ACTION_LABEL.other_link, href: "/" }]}
      />
    );
  }

  if (view.kind === "failed") {
    const failure = failureView(view.job, { loggedIn: LOGGED_IN, canRetry: Boolean(source), uploadReady: UPLOAD_READY });
    const actions = failure.actions.map((a) => toAction(a, { runId: view.job.runId, retrying, retryJob }));
    return <Failure title={failure.title} body={failure.body} actions={actions} />;
  }

  return (
    <div className="flex flex-1 flex-col">
      {source && (
        <div className="mx-5 mt-2 flex items-center gap-3 rounded-xl bg-subtle p-3">
          <div className="size-14 shrink-0 rounded-lg bg-disabled" />
          <span className="min-w-0 truncate text-xs text-muted">{source.replace(/^https:\/\/(www\.)?/, "")}</span>
        </div>
      )}

      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
        <div className="size-14 animate-spin rounded-full border-4 border-disabled border-t-link" aria-hidden="true" />
        <p aria-live="polite" className="text-lg font-bold">
          {view.job ? stageText(view.job) : "곧 시작해요…"}
        </p>
      </div>

      <div className="flex flex-col gap-2.5 px-5 pb-7">
        {LOGGED_IN ? (
          <>
            <p className="text-center text-sm leading-relaxed text-muted">
              화면을 나가도 계속 만들어요.
              <br />
              다 되면 레시피북에서 볼 수 있어요.
            </p>
            <Link href="/book" className="flex h-13 items-center justify-center rounded-xl border-[1.5px] border-foreground text-base font-medium">
              {ACTION_LABEL.go_book}
            </Link>
          </>
        ) : (
          <p className="text-center text-sm leading-relaxed text-muted">
            잠시만 기다려 주세요.
            <br />
            다 되면 바로 레시피를 보여 드릴게요.
          </p>
        )}
      </div>
    </div>
  );
}

type Action = { label: string; href?: string; onClick?: () => void; disabled?: boolean };

function toAction(
  action: FailAction,
  ctx: { runId: string | null; retrying: boolean; retryJob: () => void },
): Action {
  switch (action) {
    case "retry":
      return { label: ctx.retrying ? "다시 시도하는 중…" : ACTION_LABEL.retry, onClick: ctx.retryJob, disabled: ctx.retrying };
    case "show_partial":
      return { label: ACTION_LABEL.show_partial, href: `/r/${encodeURIComponent(ctx.runId ?? "")}` };
    case "go_book":
      return { label: ACTION_LABEL.go_book, href: "/book" };
    case "upload":
    case "other_link":
      return { label: ACTION_LABEL[action], href: "/" };
  }
}

function Failure({ title, body, actions }: { title: string; body: string; actions: Action[] }) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-subtle" aria-hidden="true">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#5c5c5c" strokeWidth="2">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v6M12 16.5v.5" />
          </svg>
        </div>
        <p role="alert" className="text-lg font-bold">
          {title}
        </p>
        {body && <p className="text-sm leading-relaxed whitespace-pre-line text-muted">{body}</p>}
      </div>
      <div className="flex flex-col gap-2.5 px-5 pb-7">
        {actions.map((a, i) => {
          const cls = `flex h-13 items-center justify-center rounded-xl border-[1.5px] border-foreground text-base ${
            i === 0 ? "bg-foreground font-bold text-background" : "font-medium"
          } disabled:opacity-60`;
          return a.href ? (
            <Link key={a.label} href={a.href} className={cls}>
              {a.label}
            </Link>
          ) : (
            <button key={a.label} type="button" onClick={a.onClick} disabled={a.disabled} className={cls}>
              {a.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

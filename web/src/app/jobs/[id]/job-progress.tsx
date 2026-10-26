"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { api, type Job } from "@/lib/api";
import { type FailureAction, failureCopy, stageText } from "@/lib/job-display";
import { recallJobSource, rememberJobSource } from "@/lib/job-source";

const POLL_MS = 1500;
const MAX_POLL_ERRORS = 3;
// 로그인은 KAN-24·KAN-31에서 붙인다. 그 전까지는 비로그인 화면만 보인다.
const LOGGED_IN = false;

const subscribeNothing = () => () => {};

export function JobProgress() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(null);
  const [pollFailed, setPollFailed] = useState(false);
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
        const next = await api.getJob(id);
        if (cancelled) return;
        errors = 0;
        if (next.status === "succeeded") {
          if (next.run_id) {
            setJob(next);
            router.replace(`/runs/${encodeURIComponent(next.run_id)}`);
          } else {
            // 성공인데 결과가 없으면 서버 쪽 문제다. 계속 조회하지 않고 일시 오류로 안내한다.
            setJob({ ...next, status: "failed", error_code: null });
          }
          return;
        }
        setJob(next);
        if (next.status === "failed") return;
      } catch {
        if (cancelled) return;
        errors += 1;
        if (errors >= MAX_POLL_ERRORS) {
          setPollFailed(true);
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
      const { id: nextId } = await api.createJob(source);
      rememberJobSource(nextId, source);
      router.replace(`/jobs/${encodeURIComponent(nextId)}`);
    } catch {
      setRetrying(false);
    }
  }

  if (pollFailed) {
    return (
      <Failure
        title="연결이 잠시 끊겼어요"
        body={"처리 상태를 불러오지 못했어요.\n다시 확인해 볼게요."}
        actions={[
          { label: "다시 확인", onClick: () => { setPollFailed(false); setPollKey((k) => k + 1); } },
          { label: "다른 링크 넣기", href: "/" },
        ]}
      />
    );
  }

  if (job?.status === "failed") {
    const copy = failureCopy(job);
    const actions = copy.actions
      .filter((a) => a !== "retry" || source)
      .map((a) => toAction(a, { job, retrying, retryJob }));
    return <Failure title={copy.title} body={copy.body} actions={actions} />;
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
          {job ? stageText(job) : "곧 시작해요…"}
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
              레시피북으로
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
  action: FailureAction,
  ctx: { job: Job; retrying: boolean; retryJob: () => void },
): Action {
  switch (action) {
    case "retry":
      return { label: ctx.retrying ? "다시 시도하는 중…" : "다시 시도", onClick: ctx.retryJob, disabled: ctx.retrying };
    case "partial":
      return { label: "찾은 만큼 보기", href: `/runs/${encodeURIComponent(ctx.job.run_id ?? "")}` };
    case "other_link":
      return { label: "다른 링크 넣기", href: "/" };
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
        <p className="text-sm leading-relaxed whitespace-pre-line text-muted">{body}</p>
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

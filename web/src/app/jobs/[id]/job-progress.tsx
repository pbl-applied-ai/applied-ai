"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ACTION_LABEL, type FailAction, type Job, type JobStage, UPLOAD_ENABLED, api } from "@/lib/api";
import { failureView, stageText } from "@/lib/job-display";
import { recallJobSource, rememberJobSource, sourceFileName } from "@/lib/job-source";
import { rememberRecentJob } from "@/lib/recent-jobs";

const POLL_MS = 1500;
const MAX_POLL_ERRORS = 3;
// 로그인은 KAN-24·KAN-31에서 붙인다. 그 전까지는 비로그인 화면만 보인다.
const LOGGED_IN = false;

const subscribeNothing = () => () => {};

// Pinch 시안 04: jobs.stage와 1:1인 4단계 목록. finalize는 마지막 단계(Writing the recipe)에 넣는다.
const STEPS: { stages: JobStage[]; label: string }[] = [
  { stages: ["collect"], label: "Getting the video" },
  { stages: ["asr"], label: "Listening to the audio" },
  { stages: ["ocr"], label: "Reading on-screen text & captions" },
  { stages: ["structure", "finalize"], label: "Writing the recipe" },
];

function stepIndex(job: Job | null): number {
  if (!job || job.status === "queued" || !job.stage) return -1;
  const stage = job.stage;
  return STEPS.findIndex((s) => s.stages.includes(stage));
}

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
  const fileName = sourceFileName(source);

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
    if (!source || fileName || retrying) return;
    setRetrying(true);
    try {
      const { jobId } = await api.createJob(source);
      rememberJobSource(jobId, source);
      rememberRecentJob(jobId);
      router.replace(`/jobs/${encodeURIComponent(jobId)}`);
    } catch {
      setRetrying(false);
    }
  }

  if (view.kind === "poll_failed") {
    return (
      <Failure
        title="Lost the connection for a moment"
        body={"We couldn't load the progress.\nLet's check again."}
        actions={[
          {
            label: "Check again",
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
        title="We can't find this conversion"
        body={"The address changed or it's too old.\nPlease paste the link again."}
        actions={[{ label: ACTION_LABEL.other_link, href: "/" }]}
      />
    );
  }

  if (view.kind === "failed") {
    const failure = failureView(view.job, {
      loggedIn: LOGGED_IN,
      canRetry: Boolean(source) && !fileName,
      uploadReady: UPLOAD_ENABLED,
      fromUpload: Boolean(fileName),
    });
    const actions = failure.actions.map((a) => toAction(a, { runId: view.job.runId, retrying, retryJob }));
    return <Failure title={failure.title} body={failure.body} actions={actions} />;
  }

  const current = stepIndex(view.job);
  const percent = Math.round(((current + 1) / (STEPS.length + 1)) * 100);
  return (
    <div className="flex flex-1 flex-col">
      {source && (
        <div className="mx-5 mt-2 flex items-center gap-3 rounded-[22px] bg-card p-3">
          <div className="photo size-14 shrink-0 rounded-xl" />
          <span className="min-w-0 truncate text-xs text-muted">{fileName ?? source.replace(/^https:\/\/(www\.)?/, "")}</span>
        </div>
      )}

      <div className="flex flex-1 flex-col gap-4 px-5 pt-8">
        <p aria-live="polite" className="text-xl font-bold">
          {view.job ? stageText(view.job) : "Starting soon…"}
        </p>
        <div className="flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-subtle" aria-hidden="true">
            <i
              className="block h-full rounded-full border-r-2 border-foreground bg-orange transition-[width] duration-500"
              style={{ width: `${Math.max(percent, 8)}%` }}
            />
          </div>
          <span className="font-display text-lg text-orange">{percent}%</span>
        </div>
        <ol className="mt-2 flex flex-col">
          {STEPS.map((step, i) => {
            const state = i < current ? "done" : i === current ? "now" : "todo";
            return (
              <li key={step.label} className={`flex items-center gap-3 py-3 text-sm ${state === "todo" ? "text-muted" : ""}`}>
                <span
                  className={`flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold ${
                    state === "done"
                      ? "border-2 border-lime-ink bg-lime text-lime-ink"
                      : state === "now"
                        ? "border-2 border-foreground bg-pink"
                        : "border-2 border-dashed border-[#cfc6ba]"
                  }`}
                  aria-hidden="true"
                >
                  {state === "done" ? "✓" : i + 1}
                </span>
                <span className={state === "now" ? "font-bold" : ""}>{step.label}</span>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="flex flex-col gap-2.5 px-5 pb-7">
        {/* 로그인 전에도 떠날 수 있다. 이 브라우저에서 만든 작업은 홈의 "만드는 중" 카드로 돌아온다(KAN-56) */}
        <p className="text-center text-sm leading-relaxed text-muted">
          You can leave this screen. We&apos;ll keep going,
          <br />
          and the recipe will be on Home when it&apos;s ready.
        </p>
        <Link href="/" className="btn-ghost">
          {ACTION_LABEL.go_home}
        </Link>
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
      return { label: ctx.retrying ? "Trying again…" : ACTION_LABEL.retry, onClick: ctx.retryJob, disabled: ctx.retrying };
    case "show_partial":
      return { label: ACTION_LABEL.show_partial, href: `/r/${encodeURIComponent(ctx.runId ?? "")}` };
    case "go_home":
      return { label: ACTION_LABEL.go_home, href: "/" };
    case "upload":
    case "other_file":
    case "other_link":
      return { label: ACTION_LABEL[action], href: "/" };
  }
}

function Failure({ title, body, actions }: { title: string; body: string; actions: Action[] }) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
        <div className="flex size-16 items-center justify-center rounded-full border-2 border-foreground bg-pink-tint" aria-hidden="true">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#9c2f5b" strokeWidth="2">
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
          const cls = `${i === 0 ? "btn-primary" : "btn-ghost"} disabled:opacity-60`;
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

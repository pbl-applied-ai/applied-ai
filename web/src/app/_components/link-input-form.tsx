"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { DailyLimitError, NotSignedInError, UPLOAD_ENABLED, api } from "@/lib/api";
import { BROWSER_DAILY_LIMIT, browserUsedToday, countBrowserJob } from "@/lib/daily-quota";
import { fileSource, rememberJobSource } from "@/lib/job-source";
import { rememberRecentJob } from "@/lib/recent-jobs";
import { SHORTS_ERROR_TEXT, checkShortsUrl } from "@/lib/shorts";
import { UPLOAD_ACCEPT, UPLOAD_ERROR_TEXT, checkUploadFile } from "@/lib/upload";

export function LinkInputForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // 직접 칠 때는 다 치기 전까지 오류를 숨긴다. 입력칸을 벗어나거나 붙여 넣은 뒤부터 보여 준다(버튼은 바로 꺼짐).
  const [showFieldError, setShowFieldError] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const linkInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // 업로드는 로그인한 사람만 된다. 파일을 고르기 전에 로그인으로 보내려고 미리 알아 둔다(null = 아직 모름).
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  // 하루 한도. 로그인했으면 서버(get_quota) 10개, 아니면 이 브라우저 3개. null = 아직 모름
  const [quota, setQuota] = useState<{ used: number; limit: number } | null>(null);
  // 로그인 전 전체 합계(서버 50개)가 찼을 때
  const [anonBusy, setAnonBusy] = useState(false);

  // 하단 탭 Convert·레시피북 [Convert a video]·로그인 뒤 돌아오기는 /convert?new=1로 온다. 입력칸에 커서를 둔다.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("new") === "1") linkInput.current?.focus();
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const user = await api.getUser();
        if (!alive) return;
        setSignedIn(user != null);
        const next = user ? await api.getQuota() : { used: browserUsedToday(), limit: BROWSER_DAILY_LIMIT };
        if (alive) setQuota(next);
      } catch {
        if (alive) setSignedIn(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // 작업을 하나 만들었을 때. 화면 상태가 이동 뒤에도 남아서(cacheComponents) 개수를 바로 올려 둔다.
  function counted() {
    countBrowserJob();
    setQuota((q) => (q ? { ...q, used: q.used + 1 } : q));
  }

  // 서버가 한도로 막았을 때. 내 한도면 다 쓴 것으로 표시하고, 로그인 전 전체 합계면 로그인을 권한다.
  function limited(err: DailyLimitError) {
    if (err.scope === "anon") setAnonBusy(true);
    else setQuota((q) => ({ used: q?.limit ?? 10, limit: q?.limit ?? 10 }));
  }

  // 로그인하고 홈으로 돌아와 입력칸에서 다시 고르게 한다.
  function goLogin() {
    router.push(`/login?next=${encodeURIComponent("/convert?new=1")}`);
  }

  // 로그인 안 했으면 파일 창을 열지 않고 바로 로그인으로 보낸다. 고른 파일이 사라지지 않게.
  // 아직 모르면 파일 창을 연다(파일 창은 누른 순간에만 열 수 있어서 기다리지 않는다). 서버가 거절하면 아래 upload가 로그인으로 보낸다.
  function pickFile() {
    if (signedIn === false) {
      goLogin();
      return;
    }
    fileInput.current?.click();
  }

  const check = checkShortsUrl(url);
  const fieldError =
    showFieldError && !check.ok && check.reason !== "empty" ? SHORTS_ERROR_TEXT[check.reason] : null;
  const limitReached = quota != null && quota.used >= quota.limit;
  const canSubmit = check.ok && !submitting && !limitReached;

  async function paste() {
    try {
      const text = await navigator.clipboard.readText();
      setUrl(text.trim());
      setShowFieldError(true);
    } catch {
      // 클립보드 권한이 없으면 사용자가 직접 붙여 넣는다.
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!check.ok || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const { jobId } = await api.createJob(check.url);
      rememberJobSource(jobId, check.url);
      rememberRecentJob(jobId);
      counted();
      router.push(`/jobs/${encodeURIComponent(jobId)}`);
      // 이 화면은 이동 뒤에도 상태가 남는다(cacheComponents). [다른 링크 넣기]·뒤로 가기로 오면
      // 빈 입력칸에서 다시 시작하도록 비우고 버튼도 푼다. 보낸 링크는 처리 중 화면에 보인다.
      setUrl("");
      setShowFieldError(false);
      setSubmitting(false);
    } catch (err) {
      setSubmitting(false);
      if (err instanceof DailyLimitError) {
        limited(err);
        return;
      }
      setSubmitError("Something went wrong. Please try again.");
    }
  }

  // [영상 파일로 넣기] → 파일 고르기 → 올리고 job 만들기 → 처리 중 화면(KAN-49)
  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // 같은 파일을 다시 골라도 바뀜 이벤트가 오게
    if (!file || uploading) return;
    const check = checkUploadFile(file);
    if (!check.ok) {
      setUploadError(UPLOAD_ERROR_TEXT[check.reason]);
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const { jobId } = await api.createUploadJob(file);
      rememberJobSource(jobId, fileSource(file.name));
      rememberRecentJob(jobId);
      counted();
      router.push(`/jobs/${encodeURIComponent(jobId)}`);
      setUploading(false);
    } catch (err) {
      setUploading(false);
      // 고르는 사이 로그인이 끊긴 경우. 로그인하고 이 화면으로 돌아와서 다시 고르게 한다.
      if (err instanceof NotSignedInError) {
        goLogin();
        return;
      }
      if (err instanceof DailyLimitError) {
        limited(err);
        return;
      }
      setUploadError("Couldn't upload the file. Please try again.");
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col px-6" noValidate>
      <label htmlFor="link" className="sr-only">
        Cooking video link
      </label>
      <div
        className={`mt-5 flex h-[52px] items-center gap-2 rounded-2xl border-2 bg-card pr-1.5 pl-3.5 focus-within:border-pink ${
          fieldError ? "border-danger" : "border-foreground"
        }`}
      >
        <input
          id="link"
          ref={linkInput}
          type="url"
          inputMode="url"
          autoComplete="off"
          placeholder="Paste a Shorts or Reels link"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            if (e.target.value.trim() === "") setShowFieldError(false);
          }}
          onBlur={() => setShowFieldError(true)}
          onPaste={() => setShowFieldError(true)}
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={fieldError ? "link-error" : undefined}
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none"
        />
        {url ? (
          <button
            type="button"
            aria-label="Clear link"
            onClick={() => {
              setUrl("");
              setShowFieldError(false);
              linkInput.current?.focus();
            }}
            className="flex size-10 shrink-0 items-center justify-center text-muted"
          >
            ✕
          </button>
        ) : (
          <button type="button" onClick={paste} className="h-9 shrink-0 rounded-full bg-subtle px-3.5 text-[13px] font-bold">
            Paste
          </button>
        )}
      </div>
      {fieldError && (
        <p id="link-error" className="mt-2 text-[13px] text-danger">
          {fieldError}
        </p>
      )}

      <p className="mt-6 text-[11px] font-bold tracking-[0.8px] text-muted uppercase">Works with</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <span className="rounded-full border border-line bg-card px-3.5 py-1.5 text-[13px] font-medium">▶ YouTube Shorts</span>
        <span className="rounded-full border border-line bg-card px-3.5 py-1.5 text-[13px] font-medium">◎ Instagram Reels</span>
      </div>
      <div className="mt-5 rounded-[22px] bg-card p-3.5 text-[13px] leading-relaxed">
        <p>💬 Recipes spoken or shown in the video work best.</p>
        <p className="text-muted">⏱ This can take about a minute.</p>
      </div>

      <div className="mt-auto flex flex-col pt-8 pb-8">
        <button type="submit" disabled={!canSubmit} className="btn-primary">
          {submitting ? "Sending…" : "Convert to recipe"}
        </button>
        {submitError && (
          <p role="alert" className="mt-2 text-center text-[13px] text-danger">
            {submitError}
          </p>
        )}
        <DailyLimitNote quota={quota} signedIn={signedIn === true} anonBusy={anonBusy} onSignIn={goLogin} />
        {UPLOAD_ENABLED ? (
          <>
            <input ref={fileInput} type="file" accept={UPLOAD_ACCEPT} onChange={upload} hidden />
            <button
              type="button"
              onClick={pickFile}
              disabled={uploading || (signedIn === true && limitReached)}
              className="mt-3 min-h-11 text-center text-[13px] text-muted underline underline-offset-[3px] disabled:no-underline"
            >
              {uploading ? "Uploading…" : "Upload a video file instead"}
            </button>
            {uploadError && (
              <p role="alert" className="text-center text-[13px] text-danger">
                {uploadError}
              </p>
            )}
            <p className="mt-1 text-center text-xs leading-relaxed text-muted">
              Sign in to upload. Only upload videos you made or have the rights to use. Up to 25 MB.
            </p>
          </>
        ) : (
          <p className="mt-3 text-center text-[13px] text-muted">Video file upload is coming soon.</p>
        )}
      </div>
    </form>
  );
}

// 버튼 아래 하루 한도 안내. 평소에는 "1 of 3 today", 다 쓰면 이유와 다음 행동.
function DailyLimitNote({
  quota,
  signedIn,
  anonBusy,
  onSignIn,
}: {
  quota: { used: number; limit: number } | null;
  signedIn: boolean;
  anonBusy: boolean;
  onSignIn: () => void;
}) {
  const reached = quota != null && quota.used >= quota.limit;
  if (!signedIn && (reached || anonBusy)) {
    return (
      <div role="status" className="mt-2 text-center text-[13px]">
        <p className="text-danger">
          {reached
            ? `You've used today's ${quota.limit} free conversions.`
            : "Lots of people are converting right now."}
        </p>
        <button type="button" onClick={onSignIn} className="mt-1 min-h-11 font-bold underline underline-offset-[3px]">
          Sign in to convert up to 10 a day
        </button>
      </div>
    );
  }
  if (reached) {
    return (
      <p role="status" className="mt-2 text-center text-[13px] text-danger">
        You&apos;ve used all {quota.limit} conversions for today. Come back tomorrow.
      </p>
    );
  }
  if (!quota) return null;
  return (
    <p className="mt-2 text-center text-xs text-muted">
      {Math.min(quota.used, quota.limit)} of {quota.limit} today
    </p>
  );
}

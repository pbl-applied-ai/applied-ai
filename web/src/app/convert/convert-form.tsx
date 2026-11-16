"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { NotSignedInError, UPLOAD_ENABLED, api } from "@/lib/api";
import { fileSource, rememberJobSource } from "@/lib/job-source";
import { rememberRecentJob } from "@/lib/recent-jobs";
import { SHORTS_ERROR_TEXT, checkShortsUrl } from "@/lib/shorts";
import { UPLOAD_ACCEPT, UPLOAD_ERROR_TEXT, checkUploadFile } from "@/lib/upload";

export function ConvertForm() {
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

  // 탭의 [+ Convert]·로그인 뒤 돌아오기로 오면 바로 붙여 넣을 수 있게 입력칸에 커서를 둔다.
  useEffect(() => {
    linkInput.current?.focus();
  }, []);

  useEffect(() => {
    if (!UPLOAD_ENABLED) return;
    let alive = true;
    api.getUser().then(
      (user) => alive && setSignedIn(user != null),
      () => alive && setSignedIn(null),
    );
    return () => {
      alive = false;
    };
  }, []);

  // 로그인하고 이 화면으로 돌아와 다시 고르게 한다.
  function goLogin() {
    router.push(`/login?next=${encodeURIComponent("/convert")}`);
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
  const canSubmit = check.ok && !submitting;

  function clear() {
    setUrl("");
    setShowFieldError(false);
    linkInput.current?.focus();
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
      router.push(`/jobs/${encodeURIComponent(jobId)}`);
      // 이 화면은 이동 뒤에도 상태가 남는다(cacheComponents). [다른 링크 넣기]·뒤로 가기로 오면
      // 빈 입력칸에서 다시 시작하도록 비우고 버튼도 푼다. 보낸 링크는 처리 중 화면에 보인다.
      setUrl("");
      setShowFieldError(false);
      setSubmitting(false);
    } catch {
      setSubmitError("Something went wrong. Please try again.");
      setSubmitting(false);
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
      router.push(`/jobs/${encodeURIComponent(jobId)}`);
      setUploading(false);
    } catch (err) {
      setUploading(false);
      // 고르는 사이 로그인이 끊긴 경우. 로그인하고 이 화면으로 돌아와서 다시 고르게 한다.
      if (err instanceof NotSignedInError) {
        goLogin();
        return;
      }
      setUploadError("We couldn't upload the file. Please try again.");
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col px-5" noValidate>
      <label htmlFor="link" className="sr-only">
        YouTube Shorts link
      </label>
      <div
        className={`mt-6 flex h-14 items-center rounded-2xl border-[1.5px] pr-1 pl-4 focus-within:border-foreground ${
          fieldError ? "border-danger" : "border-line-strong"
        }`}
      >
        <input
          id="link"
          ref={linkInput}
          type="url"
          inputMode="url"
          autoComplete="off"
          placeholder="youtube.com/shorts/..."
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            if (e.target.value.trim() === "") setShowFieldError(false);
          }}
          onBlur={() => setShowFieldError(true)}
          onPaste={() => setShowFieldError(true)}
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={fieldError ? "link-error" : undefined}
          className="h-full min-w-0 flex-1 bg-transparent text-base outline-none"
        />
        {url && (
          <button type="button" onClick={clear} aria-label="Clear link" className="flex size-11 shrink-0 items-center justify-center text-muted">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        )}
      </div>
      {fieldError && (
        <p id="link-error" className="mt-2 text-[13px] text-danger">
          {fieldError}
        </p>
      )}

      {/* 링크 미리보기(제목·채널)는 보류(#57 3절 9번). Instagram은 KAN-62 뒤에 칩을 더한다 */}
      <p className="mt-7 text-[13px] font-medium text-muted">Works with</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <span className="rounded-full border border-line px-3.5 py-1.5 text-sm">▶️ YouTube Shorts</span>
      </div>

      <div className="mt-6 flex flex-col gap-1 rounded-2xl bg-subtle px-4 py-3.5 text-sm leading-relaxed">
        <p>💬 Recipes spoken or shown in the video work best.</p>
        <p className="text-muted">⏱️ This can take about a minute.</p>
      </div>

      <div className="sticky bottom-0 mt-auto flex flex-col items-center gap-3 bg-background pt-6 pb-[max(1.75rem,env(safe-area-inset-bottom))]">
        <button
          type="submit"
          disabled={!canSubmit}
          className="h-14 w-full rounded-full bg-foreground text-base font-bold text-background disabled:bg-disabled disabled:text-muted"
        >
          {submitting ? "Sending…" : "Convert to recipe"}
        </button>
        {submitError && (
          <p role="alert" className="text-[13px] text-danger">
            {submitError}
          </p>
        )}

        {UPLOAD_ENABLED ? (
          <>
            <input ref={fileInput} type="file" accept={UPLOAD_ACCEPT} onChange={upload} hidden />
            <button
              type="button"
              onClick={pickFile}
              disabled={uploading}
              className="min-h-11 text-sm text-muted underline underline-offset-4 disabled:no-underline"
            >
              {uploading ? "Uploading…" : "Upload a video file instead"}
            </button>
            {uploadError && (
              <p role="alert" className="text-[13px] text-danger">
                {uploadError}
              </p>
            )}
            <p className="text-center text-xs leading-relaxed text-muted">
              Sign in to upload. Only upload videos you made or have rights to. We delete them after making the recipe.
              (Up to 25MB)
            </p>
          </>
        ) : (
          <p className="text-center text-xs text-muted">Video file upload is coming soon.</p>
        )}
      </div>
    </form>
  );
}

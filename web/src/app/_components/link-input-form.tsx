"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { NotSignedInError, UPLOAD_ENABLED, api } from "@/lib/api";
import { fileSource, rememberJobSource } from "@/lib/job-source";
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
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const check = checkShortsUrl(url);
  const fieldError =
    showFieldError && !check.ok && check.reason !== "empty" ? SHORTS_ERROR_TEXT[check.reason] : null;
  const canSubmit = check.ok && !submitting;

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
      router.push(`/jobs/${encodeURIComponent(jobId)}`);
      // 이 화면은 이동 뒤에도 상태가 남는다(cacheComponents). [다른 링크 넣기]·뒤로 가기로 오면
      // 빈 입력칸에서 다시 시작하도록 비우고 버튼도 푼다. 보낸 링크는 처리 중 화면에 보인다.
      setUrl("");
      setShowFieldError(false);
      setSubmitting(false);
    } catch {
      setSubmitError("잠시 문제가 생겼어요. 다시 시도해 주세요.");
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
      router.push(`/jobs/${encodeURIComponent(jobId)}`);
      setUploading(false);
    } catch (err) {
      setUploading(false);
      // 업로드는 로그인한 사람만 된다. 로그인하고 이 화면으로 돌아와서 다시 고르게 한다.
      if (err instanceof NotSignedInError) {
        router.push(`/login?next=${encodeURIComponent("/")}`);
        return;
      }
      setUploadError("파일을 올리지 못했어요. 다시 시도해 주세요.");
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col px-5 pt-7" noValidate>
      <label htmlFor="link" className="text-[15px] font-medium">
        YouTube Shorts 요리 영상 링크
      </label>
      <div className="mt-2 flex gap-2">
        <input
          id="link"
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
          className={`h-13 min-w-0 flex-1 rounded-[10px] border-[1.5px] px-3.5 text-base outline-link ${
            fieldError ? "border-danger" : "border-line-strong"
          }`}
        />
        <button
          type="button"
          onClick={paste}
          className="h-13 shrink-0 rounded-[10px] border-[1.5px] border-foreground px-3.5 text-sm font-medium"
        >
          붙여넣기
        </button>
      </div>
      {fieldError && (
        <p id="link-error" className="mt-2 text-[13px] text-danger">
          {fieldError}
        </p>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="mt-5 h-13 rounded-xl bg-foreground text-base font-bold text-background disabled:bg-disabled disabled:text-muted"
      >
        {submitting ? "보내는 중…" : "레시피 만들기"}
      </button>
      {submitError && (
        <p role="alert" className="mt-2 text-[13px] text-danger">
          {submitError}
        </p>
      )}

      <div className="mt-7 flex items-center gap-3">
        <div className="h-px flex-1 bg-line" />
        <span className="text-[13px] text-muted">링크가 안 되면</span>
        <div className="h-px flex-1 bg-line" />
      </div>
      {UPLOAD_ENABLED ? (
        <>
          <input ref={fileInput} type="file" accept={UPLOAD_ACCEPT} onChange={upload} hidden />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
            className="mt-5 h-13 rounded-xl border-[1.5px] border-foreground text-base font-medium disabled:border-line-strong disabled:text-muted"
          >
            {uploading ? "올리는 중…" : "영상 파일로 넣기"}
          </button>
          {uploadError && (
            <p role="alert" className="mt-2 text-[13px] text-danger">
              {uploadError}
            </p>
          )}
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            로그인하면 올릴 수 있어요. 직접 찍었거나 사용 권한이 있는 영상만 올려 주세요. 올린 영상은 레시피를 만든 뒤 지워져요. (25MB까지)
          </p>
        </>
      ) : (
        <>
          <button
            type="button"
            disabled
            className="mt-5 h-13 rounded-xl border-[1.5px] border-line-strong text-base font-medium text-muted"
          >
            영상 파일로 넣기
          </button>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">영상 파일 올리기는 준비 중이에요.</p>
        </>
      )}
    </form>
  );
}

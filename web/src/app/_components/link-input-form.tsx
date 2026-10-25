"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { SHORTS_ERROR_TEXT, checkShortsUrl } from "@/lib/shorts";

export function LinkInputForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const check = checkShortsUrl(url);
  const fieldError = !check.ok && check.reason !== "empty" ? SHORTS_ERROR_TEXT[check.reason] : null;
  const canSubmit = check.ok && !submitting;

  async function paste() {
    try {
      const text = await navigator.clipboard.readText();
      setUrl(text.trim());
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
      const { id } = await api.createJob(check.url);
      router.push(`/jobs/${encodeURIComponent(id)}`);
    } catch {
      setSubmitError("잠시 문제가 생겼어요. 다시 시도해 주세요.");
      setSubmitting(false);
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
          onChange={(e) => setUrl(e.target.value)}
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
      <button
        type="button"
        disabled
        className="mt-5 h-13 rounded-xl border-[1.5px] border-line-strong text-base font-medium text-muted"
      >
        영상 파일로 넣기
      </button>
      <p className="mt-2 text-[13px] leading-relaxed text-muted">영상 파일 올리기는 준비 중이에요.</p>
    </form>
  );
}

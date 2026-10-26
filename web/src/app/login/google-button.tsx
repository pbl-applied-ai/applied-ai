"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";

/** 로그인 뒤 돌아갈 주소. 다른 사이트로 보내지 않도록 우리 사이트 안의 경로만 받는다. */
export function safeNext(next: string | null): string {
  // "/\evil.example"처럼 브라우저가 다른 사이트로 읽는 주소도 막는다
  if (!next || !next.startsWith("/") || next.includes("\\")) return "/book";
  const base = typeof window === "undefined" ? "http://localhost" : window.location.origin;
  try {
    const url = new URL(next, base);
    return url.origin === base ? url.pathname + url.search + url.hash : "/book";
  } catch {
    return "/book";
  }
}

export function GoogleButton() {
  const next = safeNext(useSearchParams().get("next"));
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await api.signInWithGoogle(next);
        } catch {
          setBusy(false);
        }
      }}
      className="flex h-13 items-center justify-center gap-2.5 rounded-xl border-[1.5px] border-foreground text-base font-medium disabled:opacity-60"
    >
      <span aria-hidden="true" className="flex size-[22px] items-center justify-center rounded-full border-[1.5px] border-foreground text-xs font-bold">
        G
      </span>
      {busy ? "로그인하는 중…" : "Google로 계속하기"}
    </button>
  );
}

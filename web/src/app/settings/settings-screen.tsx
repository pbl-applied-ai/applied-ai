"use client";

// 07 Settings(Pinch 시안). 홈 오른쪽 위 톱니바퀴로 온다. 프로필·지원·버전·로그아웃.
// 단위(Metric/US)·기본 인분·알림·계정 삭제는 아직 기능이 없어서 넣지 않았다(#64 리뷰: 보류).
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { type User, api } from "@/lib/api";
import { GoogleButton } from "../login/google-button";

const VERSION = "0.1.0";

export function SettingsScreen() {
  const router = useRouter();
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let alive = true;
    api.getUser().then(
      (u) => alive && setUser(u),
      () => alive && setUser(null),
    );
    return () => {
      alive = false;
    };
  }, []);

  const name = user?.email?.split("@")[0] ?? "";
  const initial = (name[0] ?? "P").toUpperCase();

  return (
    <main className="flex flex-1 flex-col px-6 pb-10">
      <header className="-ml-3 flex items-center gap-1 pt-3">
        <Link href="/" aria-label="Back to home" className="flex size-11 items-center justify-center">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </Link>
        <h1 className="text-2xl font-bold">Settings</h1>
      </header>

      {user === undefined && <div className="mt-4 h-[84px] rounded-[22px] bg-card" aria-hidden="true" />}

      {user && (
        <section aria-label="Profile" className="mt-4 flex items-center gap-3.5 rounded-[22px] bg-card p-4">
          <span className="font-display flex size-[52px] shrink-0 items-center justify-center rounded-full border-[2.5px] border-foreground bg-pink text-xl" aria-hidden="true">
            {initial}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-bold">{name || "Pinch cook"}</span>
            <span className="truncate text-xs text-muted">{user.email ? `${user.email} · Google` : "Signed in with Google"}</span>
          </span>
        </section>
      )}

      {user === null && (
        <section aria-label="Profile" className="mt-4 flex flex-col gap-3 rounded-[22px] bg-card p-4">
          <p className="font-bold">You&apos;re not signed in</p>
          <p className="text-[13px] leading-relaxed text-muted">Sign in to save recipes and see Pinch estimates.</p>
          <Suspense fallback={null}>
            <GoogleButton returnTo="/settings" />
          </Suspense>
        </section>
      )}

      <p className="mt-6 mb-1 text-[11px] font-bold tracking-[0.8px] text-muted uppercase">Your stuff</p>
      <Link href="/book" className="flex items-center justify-between py-[15px] text-sm">
        <span>My recipe book</span>
        <span className="text-muted">›</span>
      </Link>

      <p className="mt-4 mb-1 text-[11px] font-bold tracking-[0.8px] text-muted uppercase">About Pinch</p>
      <div className="flex items-start justify-between gap-4 py-[15px] text-sm">
        <span>How amounts work</span>
        <span className="max-w-[60%] text-right text-xs leading-relaxed text-muted">
          Bold = from the video. <span className="est px-1.5 py-0 text-[11px]">≈ Pinch estimate</span> = our guess when the video doesn&apos;t say.
        </span>
      </div>
      <div className="flex items-center justify-between border-t border-line py-[15px] text-sm">
        <span>Version</span>
        <span className="text-xs text-muted">{VERSION}</span>
      </div>

      {user && (
        <button
          type="button"
          disabled={signingOut}
          onClick={async () => {
            setSigningOut(true);
            try {
              await api.signOut();
              router.replace("/");
            } catch {
              setSigningOut(false);
            }
          }}
          className="btn-ghost mt-6 min-h-[46px] disabled:opacity-60"
        >
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
      )}
    </main>
  );
}

"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { safeNext } from "../../login/google-button";

/** 다시 로그인한 뒤에도 원래 화면으로 돌아가도록 돌아갈 주소를 넘긴다. */
export function retryLoginHref(returnTo: string | null): string {
  return returnTo ? `/login?next=${encodeURIComponent(safeNext(returnTo))}` : "/login";
}

export function CallbackScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const code = params.get("code");
  const error = params.get("error");
  const cancelled = error === "access_denied"; // 구글 화면에서 사용자가 취소했다
  const [failed, setFailed] = useState(false);
  const [returnTo, setReturnTo] = useState<string | null>(null);
  // 코드는 한 번만 쓸 수 있다. 개발 모드에서 effect가 두 번 돌아도 한 번만 보낸다.
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    api
      .signInReturnTo()
      .then(async (next) => {
        setReturnTo(next); // completeSignIn이 지우기 전에 읽어 둔다
        if (!code || error) return;
        router.replace(safeNext(await api.completeSignIn(code)));
      })
      .catch(() => setFailed(true));
  }, [code, error, router]);

  if (failed || !code || error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
        <p role="alert" className="text-lg font-bold">
          {cancelled ? "로그인을 취소했어요" : "로그인하지 못했어요"}
        </p>
        {!cancelled && <p className="text-sm text-muted">잠시 뒤 다시 해 주세요.</p>}
        <Link href={retryLoginHref(returnTo)} className="mt-4 text-sm text-link underline">
          다시 로그인하기
        </Link>
      </div>
    );
  }

  return <div className="flex flex-1 items-center justify-center text-sm text-muted">로그인하는 중…</div>;
}

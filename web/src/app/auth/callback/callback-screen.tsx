"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { safeNext } from "../../login/google-button";

export function CallbackScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const code = params.get("code");
  const [failed, setFailed] = useState(false);
  // 코드는 한 번만 쓸 수 있다. 개발 모드에서 effect가 두 번 돌아도 한 번만 보낸다.
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current || !code) return;
    sent.current = true;
    api
      .completeSignIn(code)
      .then((next) => router.replace(safeNext(next)))
      .catch(() => setFailed(true));
  }, [code, router]);

  if (failed || !code) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
        <p role="alert" className="text-lg font-bold">
          로그인하지 못했어요
        </p>
        <p className="text-sm text-muted">잠시 뒤 다시 해 주세요.</p>
        <Link href="/login" className="mt-4 text-sm text-link underline">
          다시 로그인하기
        </Link>
      </div>
    );
  }

  return <div className="flex flex-1 items-center justify-center text-sm text-muted">로그인하는 중…</div>;
}

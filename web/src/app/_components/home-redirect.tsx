"use client";

// 로그인한 사용자가 다시 오면 S1 레시피북에서 시작한다(KAN-39).
// 레시피북의 [+ 영상으로 레시피 만들기]는 /?new=1로 와서 그대로 링크 입력을 보여 준다.
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { api } from "@/lib/api";

export function HomeRedirect() {
  const router = useRouter();
  const wantsNew = useSearchParams().get("new") === "1";

  useEffect(() => {
    if (wantsNew) return;
    let cancelled = false;
    api.getUser().then((user) => {
      if (!cancelled && user) router.replace("/book");
    });
    return () => {
      cancelled = true;
    };
  }, [wantsNew, router]);

  return null;
}

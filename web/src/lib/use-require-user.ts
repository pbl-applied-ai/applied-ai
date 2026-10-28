"use client";

// 로그인이 필요한 화면(S1 레시피북·S5 상세)에서 쓴다. 로그인 안 했으면 S0 로그인으로 보낸다(KAN-31).
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { type User, api } from "@/lib/api";

export function useRequireUser(next: string): User | null {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.getUser().then((u) => {
      if (cancelled) return;
      if (u) setUser(u);
      else router.replace(`/login?next=${encodeURIComponent(next)}`);
    });
    return () => {
      cancelled = true;
    };
  }, [next, router]);

  return user;
}

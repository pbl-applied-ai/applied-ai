// S0 로그인 (KAN-31 최소 동작). 결과 화면(S4)에서 [로그인하고 고치기]를 누르거나, 로그인이 필요한 화면(S1·S5)을 열 때 온다.
// NEXT_PUBLIC_RECIPE_BOOK_ENABLED=true면 실제 구글 로그인(KAN-24), 아니면 목 로그인이다.
import { Suspense } from "react";
import { Logo } from "@/components/logo";
import { GoogleButton } from "./google-button";

export default function LoginPage() {
  return (
    <main className="flex flex-1 flex-col px-6">
      <div className="flex flex-1 flex-col justify-center gap-4">
        <div>
          <Logo size="lg" />
        </div>
        <h1 className="text-[28px] leading-snug font-bold">
          Reels to recipes
        </h1>
        <p className="text-[15px] leading-relaxed text-muted">Sign in to edit recipes and save them to your recipe book.</p>
      </div>
      <div className="flex flex-col gap-3 pb-10">
        <Suspense fallback={null}>
          <GoogleButton />
        </Suspense>
        <p className="text-center text-xs leading-relaxed text-muted">By continuing, you agree to the Terms and Privacy Policy.</p>
      </div>
    </main>
  );
}

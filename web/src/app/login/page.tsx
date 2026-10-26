// S0 로그인 (KAN-31 최소 동작). S4에서 [레시피북에 저장]을 눌렀는데 로그인 안 했을 때만 온다(KAN-39).
// 지금은 목 로그인이다. 실제 구글 로그인(KAN-24)이 붙으면 api.signInWithGoogle만 바뀐다.
import { Suspense } from "react";
import { GoogleButton } from "./google-button";

export default function LoginPage() {
  return (
    <main className="flex flex-1 flex-col px-6">
      <div className="flex flex-1 flex-col justify-center gap-4">
        <div className="size-16 rounded-2xl border border-dashed border-line-strong bg-subtle" aria-hidden="true" />
        <h1 className="text-[28px] leading-snug font-bold">
          저장만 해 두던 요리 숏폼,
          <br />
          따라 할 수 있는 레시피로
        </h1>
        <p className="text-[15px] leading-relaxed text-muted">레시피북에 저장하려면 로그인해 주세요. 고친 내용은 그대로 저장돼요.</p>
      </div>
      <div className="flex flex-col gap-3 pb-10">
        <Suspense fallback={null}>
          <GoogleButton />
        </Suspense>
        <p className="text-center text-xs leading-relaxed text-muted">계속하면 이용약관과 개인정보 처리방침에 동의하게 돼요.</p>
      </div>
    </main>
  );
}

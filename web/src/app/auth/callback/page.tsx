// 구글 로그인에서 돌아오는 주소(KAN-24). 코드를 세션으로 바꾸고 원래 화면으로 보낸다.
import { Suspense } from "react";
import { CallbackScreen } from "./callback-screen";

export default function AuthCallbackPage() {
  return (
    <main className="flex flex-1 flex-col">
      <Suspense>
        <CallbackScreen />
      </Suspense>
    </main>
  );
}

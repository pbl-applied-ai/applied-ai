// S4 확인·수정 (KAN-30). 처리 중 화면이 성공하면 여기로 온다.
// 공개 링크(KAN-32)도 같은 주소를 쓰고, 로그인 안 했으면 보기만 된다.
import Link from "next/link";
import { Suspense } from "react";
import { ReviewScreen } from "./review-screen";

export default function RunPage() {
  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center gap-1 px-2 py-3">
        <Link href="/" aria-label="링크 입력으로 돌아가기" className="flex size-11 items-center justify-center">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </Link>
        <h1 className="text-lg font-bold">레시피 확인</h1>
      </header>
      <Suspense fallback={<div className="flex-1" />}>
        <ReviewScreen />
      </Suspense>
    </main>
  );
}

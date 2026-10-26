// S3 처리 중 (KAN-29). jobs.stage를 폴링해서 지금 단계 한 줄과 실패 안내를 보여 준다.
import Link from "next/link";
import { Suspense } from "react";
import { JobProgress } from "./job-progress";

export default function JobPage() {
  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center gap-1 px-2 py-3">
        <Link href="/" aria-label="링크 입력으로 돌아가기" className="flex size-11 items-center justify-center">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </Link>
        <h1 className="text-lg font-bold">레시피 만드는 중</h1>
      </header>
      <Suspense fallback={<div className="flex-1" />}>
        <JobProgress />
      </Suspense>
    </main>
  );
}

// 시즌 특집 페이지(Open the issue, docs/screen-data.md H). 호 표지, 커버 스토리, 나머지 레시피, 인용구 한 줄.
import Link from "next/link";
import { Suspense } from "react";
import { IssueScreen } from "./issue-screen";

export default function IssuePage() {
  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center gap-1 px-2 py-3">
        <Link href="/" aria-label="Back to home" className="flex size-11 items-center justify-center">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </Link>
      </header>
      <Suspense fallback={<div className="flex-1" />}>
        <IssueScreen />
      </Suspense>
    </main>
  );
}

// S5 [수정] → S4 편집 화면으로 저장한 레시피를 고친다 (KAN-48).
import Link from "next/link";
import { Suspense } from "react";
import { EditScreen } from "./edit-screen";

export default function EditRecipePage() {
  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center gap-1 px-2 py-3">
        <Link href="/book" aria-label="레시피북으로" className="flex size-11 items-center justify-center">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </Link>
        <h1 className="text-lg font-bold">레시피 수정</h1>
      </header>
      <Suspense fallback={<div className="flex-1" />}>
        <EditScreen />
      </Suspense>
    </main>
  );
}

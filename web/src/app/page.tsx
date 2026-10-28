// S2 링크 입력 = 첫 화면. 로그인 없이 바로 쓴다(KAN-28, KAN-39).
import Link from "next/link";
import { Suspense } from "react";
import { HomeRedirect } from "./_components/home-redirect";
import { LinkInputForm } from "./_components/link-input-form";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      <Suspense fallback={null}>
        <HomeRedirect />
      </Suspense>
      <header className="flex items-center justify-between py-3 pr-3 pl-5">
        <span className="text-[15px] font-bold">숏폼 레시피</span>
        <Link href="/book" className="flex min-h-11 items-center rounded-[10px] px-2.5 text-sm font-medium">
          내 레시피북
        </Link>
      </header>

      <section className="flex flex-col gap-3 px-5 pt-6">
        <h1 className="text-[26px] leading-snug font-bold">
          저장만 해 둔 요리 숏폼,
          <br />
          따라 할 수 있는 레시피로
        </h1>
        <p className="text-sm leading-relaxed text-muted">Shorts 링크를 넣으면 재료·분량·조리 순서를 정리해 드려요.</p>
      </section>

      <LinkInputForm />
    </main>
  );
}

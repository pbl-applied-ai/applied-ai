// C Convert (docs/screen-data.md #57 2절 C). 하단 탭의 [+ Convert]로 온다. 탭 없이 [뒤로]를 둔다.
// 하루 횟수 "1 of 3 today"(3절 7번)와 링크 미리보기(9번)는 보류.
import Link from "next/link";
import { ConvertForm } from "./convert-form";

export default function ConvertPage() {
  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center px-2 pt-3">
        <Link href="/" aria-label="Back to home" className="flex size-11 items-center justify-center">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </Link>
      </header>
      <section className="flex flex-col gap-2 px-5 pt-2">
        <h1 className="text-[28px] leading-tight font-bold">Convert a video</h1>
        <p className="text-sm text-muted">Paste a link from YouTube Shorts.</p>
      </section>
      <ConvertForm />
    </main>
  );
}

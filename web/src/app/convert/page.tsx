// 08 Convert(Pinch 시안). 하단 탭 가운데 Convert로 온다. 링크를 넣으면 처리 중 화면(S3)으로 간다.
import Link from "next/link";
import { LinkInputForm } from "../_components/link-input-form";

export default function ConvertPage() {
  return (
    <main className="flex min-h-dvh flex-1 flex-col">
      <header className="flex items-center px-3 pt-3">
        <Link href="/" aria-label="Back to home" className="flex size-11 items-center justify-center">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </Link>
      </header>
      <section className="px-6 pt-2">
        <h1 className="text-[28px] leading-[1.15] font-bold">Convert a video</h1>
        <p className="mt-2 text-sm text-muted">Paste a link from YouTube Shorts or Instagram Reels.</p>
      </section>
      <LinkInputForm />
    </main>
  );
}

"use client";

// 하단 탭 [Home / Convert / Recipe book](docs/ux-flow.md, Pinch 시안). S6 홈·S1 레시피북에만 붙인다.
// 떠 있는 흰 알약이고 가운데 Convert만 핑크 원이다. Convert는 홈 링크 입력칸으로 보낸다(/?new=1).
// 로그인 전에 레시피북을 누르면 레시피북 화면이 로그인(S0)으로 보낸다.
import Link from "next/link";
import { usePathname } from "next/navigation";

const ICON = {
  home: <path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z" />,
  book: (
    <>
      <path d="M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3z" />
      <path d="M5 17a3 3 0 013-3h11" />
    </>
  ),
};

function Tab({ href, label, icon, active }: { href: string; label: string; icon: React.ReactNode; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-14 w-20 flex-col items-center justify-center gap-0.5 text-[11px] ${
        active ? "font-bold text-foreground" : "font-medium text-muted"
      }`}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinejoin="round" aria-hidden="true">
        {icon}
      </svg>
      {label}
      <span className={`size-[5px] rounded-full ${active ? "bg-pink" : "bg-transparent"}`} aria-hidden="true" />
    </Link>
  );
}

export function TabBar() {
  const pathname = usePathname();
  return (
    <>
      {/* 떠 있는 탭에 내용이 가리지 않게 자리를 비운다 */}
      <div className="h-28 shrink-0" aria-hidden="true" />
      <nav
        aria-label="Menu"
        className="fixed inset-x-0 bottom-[calc(16px+env(safe-area-inset-bottom))] z-20 mx-auto flex h-[68px] w-[calc(100%-32px)] max-w-[416px] items-center justify-around rounded-full border border-line bg-card px-4 shadow-[0_6px_20px_rgba(59,31,26,0.08)]"
      >
        <Tab href="/" label="Home" icon={ICON.home} active={pathname === "/"} />
        <Link href="/?new=1" className="-mt-7 flex w-20 flex-col items-center gap-0.5 text-[11px] font-medium text-muted">
          <span className="flex size-[58px] items-center justify-center rounded-full border-[2.5px] border-foreground bg-pink">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" className="text-foreground" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </span>
          Convert
        </Link>
        <Tab href="/book" label="Recipe book" icon={ICON.book} active={pathname.startsWith("/book")} />
      </nav>
    </>
  );
}

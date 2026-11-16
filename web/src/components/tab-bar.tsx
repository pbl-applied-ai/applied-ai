"use client";

// 하단 탭 [Home / + Convert / Recipe book](docs/screen-data.md #57 1절). Home·Recipe book에만 붙인다.
// 가운데 [+ Convert]는 탭이 아니라 링크 넣기 화면(/convert)으로 가는 버튼이다. Convert 화면에는 탭 없이 [뒤로]를 둔다.
// 로그인 전에 Recipe book을 누르면 레시피북 화면이 로그인 안내를 보여 준다.
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Home", icon: <path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z" /> },
  {
    href: "/book",
    label: "Recipe book",
    icon: (
      <>
        <path d="M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3z" />
        <path d="M5 17a3 3 0 013-3h11" />
      </>
    ),
  },
] as const;

export function TabBar() {
  const pathname = usePathname();
  const [home, book] = TABS.map((tab) => {
    const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
    return (
      <Link
        key={tab.href}
        href={tab.href}
        aria-current={active ? "page" : undefined}
        className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] ${
          active ? "font-bold text-foreground" : "font-medium text-muted"
        }`}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinejoin="round" aria-hidden="true">
          {tab.icon}
        </svg>
        {tab.label}
      </Link>
    );
  });

  return (
    <nav
      aria-label="Menu"
      className="sticky bottom-0 z-10 mt-auto flex items-end border-t border-line bg-background pb-[env(safe-area-inset-bottom)]"
    >
      {home}
      <Link
        href="/convert"
        className="flex min-h-14 flex-1 flex-col items-center justify-end gap-0.5 pb-1.5 text-[11px] font-medium text-muted"
      >
        <span className="-mt-6 flex size-14 items-center justify-center rounded-full border-2 border-background bg-foreground text-background shadow-md">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </span>
        Convert
      </Link>
      {book}
    </nav>
  );
}

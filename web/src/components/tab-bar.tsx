"use client";

// 하단 탭 [홈 / 레시피북](docs/ux-flow.md). S6 홈·S1 레시피북에만 붙인다. 나머지 화면은 탭 없이 [뒤로]를 둔다.
// 로그인 전에 레시피북을 누르면 레시피북 화면이 로그인(S0)으로 보낸다.
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "홈", icon: <path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z" /> },
  {
    href: "/book",
    label: "레시피북",
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
  return (
    <nav
      aria-label="메뉴"
      className="sticky bottom-0 z-10 mt-auto flex border-t border-line bg-background pb-[env(safe-area-inset-bottom)]"
    >
      {TABS.map((tab) => {
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
      })}
    </nav>
  );
}

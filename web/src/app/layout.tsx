import type { Metadata, Viewport } from "next";
import { Bagel_Fat_One, DM_Sans, Noto_Sans_KR } from "next/font/google";
import "./globals.css";

// Pinch 글꼴: 로고·큰 숫자·스티커 = Bagel Fat One, 나머지 = DM Sans. 한국어 영상 레시피는 Noto Sans KR로 보인다.
const bagel = Bagel_Fat_One({
  variable: "--font-bagel",
  weight: "400",
  subsets: ["latin"],
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

const notoSansKr = Noto_Sans_KR({
  variable: "--font-noto-sans-kr",
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  preload: false,
});

export const metadata: Metadata = {
  title: "Pinch — Reels to recipes",
  description: "Turn the cooking shorts you saved into recipes you can actually follow.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f7f6f2",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${bagel.variable} ${dmSans.variable} ${notoSansKr.variable} h-full antialiased`}>
      <body className="min-h-full bg-background text-foreground">
        <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">{children}</div>
      </body>
    </html>
  );
}

// Pinch 로고 스티커(흰 바탕 + 갈색 테두리 + 핑크 Bagel 글자)
export function Logo({ size = "sm" }: { size?: "sm" | "lg" }) {
  const big = size === "lg";
  return (
    <span
      className={`inline-block bg-card ${big ? "rounded-[30px] border-[3px] px-7 pt-2 pb-3.5" : "rounded-2xl border-2 px-3 pt-0.5 pb-1"} border-foreground`}
    >
      <span className={`font-display leading-none text-pink ${big ? "text-[72px]" : "text-[26px]"}`}>pinch</span>
    </span>
  );
}

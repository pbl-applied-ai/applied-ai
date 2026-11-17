// 빈 화면·로그인 전 화면의 큰 이모지 원 + 스티커(Pinch 시안 03·04·14)
export function EmojiHero({
  emoji,
  sticker,
  circle = "bg-pink-tint",
  stickerColor = "bg-orange",
}: {
  emoji: string;
  sticker: string;
  circle?: string;
  stickerColor?: string;
}) {
  return (
    <div className="relative inline-block" aria-hidden="true">
      <div className={`flex size-[150px] items-center justify-center rounded-full border-[2.5px] border-foreground text-[70px] ${circle}`}>
        {emoji}
      </div>
      <span className={`sticker absolute -top-2 -right-11 text-sm ${stickerColor}`}>{sticker}</span>
    </div>
  );
}

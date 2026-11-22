// 결과 화면 위쪽 원본 영상 줄(시안 10): 썸네일 · 플랫폼 · 크리에이터 · [▶ Watch original · 0:21]
// 그리고 재료 분량 옆 출처 칩(On-screen·Voice·Description).
import type { AmountSource, Run } from "@/lib/api";
import { Thumb } from "./thumb";

export const SOURCE_LABEL: Record<AmountSource, string> = {
  on_screen: "On-screen",
  voice: "Voice",
  description: "Description",
};

export function SourceChip({ source }: { source?: AmountSource | null }) {
  if (!source) return null;
  return <span className="src-chip shrink-0">{SOURCE_LABEL[source]}</span>;
}

export function formatDuration(ms?: number | null): string | null {
  if (!ms || ms <= 0) return null;
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

const PLATFORM_LABEL: Record<string, string> = { youtube: "YouTube Shorts", instagram: "Instagram Reels", tiktok: "TikTok" };

export function SourceMeta({ run }: { run: Run }) {
  const platform = PLATFORM_LABEL[run.platform ?? ""] ?? (run.sourceUrl.includes("instagram") ? "Instagram Reels" : "YouTube Shorts");
  const duration = formatDuration(run.durationMs);
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate text-xs text-muted">
        {platform}
        {run.creator ? ` · ${run.creator}` : ""}
      </span>
      {run.sourceUrl && (
        <a href={run.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-1 text-xs font-medium underline underline-offset-2">
          ▶ Watch original{duration ? ` · ${duration}` : ""}
        </a>
      )}
    </span>
  );
}

export function SourceThumb({ run }: { run: Run }) {
  return <Thumb src={run.thumbnailUrl} className="h-[74px] w-[58px] shrink-0 rounded-xl" />;
}

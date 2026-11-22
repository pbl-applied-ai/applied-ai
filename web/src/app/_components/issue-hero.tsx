// H Home 시즌 특집(대표 기사): 큰 사진, "Holiday issue" 스티커, 헤드라인, 한두 줄 설명, "Open the issue".
// 누르면 특집 페이지 /issue/<slug>.
import Link from "next/link";
import { RecipePhoto } from "@/components/recipe-tile";
import type { ResolvedIssue } from "@/lib/home-editorial";

export function IssueHero({ issue }: { issue: ResolvedIssue }) {
  return (
    <section aria-labelledby="issue-title" className="px-6 pt-8">
      <Link href={`/issue/${encodeURIComponent(issue.slug)}`} className="flex flex-col overflow-hidden rounded-[26px] bg-card">
        <span className="relative block">
          <RecipePhoto card={issue.cover.card} className="h-[260px] w-full" />
          <span className="sticker absolute top-4 left-4 -rotate-3 bg-pink text-sm">{issue.label}</span>
        </span>
        <span className="flex flex-col gap-2 px-5 pt-4 pb-5">
          <span id="issue-title" className="font-display text-[26px] leading-tight">
            {issue.title}
          </span>
          <span className="text-sm text-muted">{issue.dek}</span>
          <span className="mt-1 flex items-center justify-between">
            <span className="text-xs text-muted">{issue.stories.length + 1} recipes</span>
            <span className="text-sm font-bold">Open the issue ›</span>
          </span>
        </span>
      </Link>
    </section>
  );
}

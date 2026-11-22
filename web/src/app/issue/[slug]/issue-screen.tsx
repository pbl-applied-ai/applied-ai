"use client";

// 특집 한 호. 편집 파일(content/home.ts)의 issue를 추천 목록 카드와 묶어 그린다.
// 기한(activeUntil)이 지나 홈에서 숨겨진 뒤에도 링크로 들어오면 보여 준다.
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { RecipePhoto, platformSticker } from "@/components/recipe-tile";
import { HOME_EDITORIAL } from "@/content/home";
import { type RecommendationGroup, api } from "@/lib/api";
import { type ResolvedIssue, type ResolvedStory, cardIndex, resolveIssue } from "@/lib/home-editorial";

export function IssueScreen() {
  const { slug } = useParams<{ slug: string }>();
  const [groups, setGroups] = useState<RecommendationGroup[] | null>(null);

  useEffect(() => {
    let alive = true;
    api.listRecommendations().then(
      (g) => alive && setGroups(g),
      () => alive && setGroups([]),
    );
    return () => {
      alive = false;
    };
  }, []);

  const source = HOME_EDITORIAL.issue?.slug === slug ? HOME_EDITORIAL.issue : null;
  if (!source) return <Missing />;
  if (groups === null) return <div className="flex-1" aria-busy="true" />;
  const issue = resolveIssue(source, cardIndex(groups));
  if (!issue) return <Missing />;
  return <Issue issue={issue} />;
}

function Issue({ issue }: { issue: ResolvedIssue }) {
  return (
    <article className="flex flex-col pb-10">
      <header className="flex flex-col items-start gap-3 px-6">
        <span className="sticker -rotate-3 bg-pink text-sm">{issue.label}</span>
        <h1 className="font-display text-[34px] leading-[1.05]">{issue.title}</h1>
        <p className="text-[15px] text-muted">{issue.dek}</p>
      </header>

      <CoverStory story={issue.cover} />

      {issue.stories.length > 0 && (
        <section aria-label="More recipes in this issue" className="flex flex-col gap-3 px-6 pt-8">
          {issue.stories.map((s, i) => (
            <StoryRow key={s.card.runId} story={s} colorIndex={i + 1} />
          ))}
        </section>
      )}

      {issue.quote && (
        <figure className="mx-6 mt-8 rounded-[22px] bg-lime-tint px-5 py-5">
          <blockquote className="font-display text-[20px] leading-snug">“{issue.quote.text}”</blockquote>
          <figcaption className="mt-2 text-xs text-muted">
            {issue.quote.card.creator ? `${issue.quote.card.creator} · ` : ""}
            {issue.quote.card.title}
          </figcaption>
        </figure>
      )}
    </article>
  );
}

function Byline({ story }: { story: ResolvedStory }) {
  return (
    <span className="truncate text-xs text-muted">
      {story.card.creator ? `${story.card.creator} · ` : ""}
      {story.viewsLabel ? `${story.viewsLabel} · ` : ""}
      {story.card.ingredientCount} ingredients
    </span>
  );
}

function CoverStory({ story }: { story: ResolvedStory }) {
  return (
    <Link href={`/r/${encodeURIComponent(story.card.runId)}`} className="mx-6 mt-6 flex flex-col overflow-hidden rounded-[26px] bg-card">
      <span className="relative block">
        <RecipePhoto card={story.card} className="h-[300px] w-full" />
        <span className="sticker absolute top-4 left-4 bg-card text-xs">{platformSticker(story.card)}</span>
      </span>
      <span className="flex flex-col gap-1.5 px-5 pt-4 pb-5">
        {story.kicker && <span className="text-[11px] font-bold tracking-[0.12em] text-pink-ink">{story.kicker}</span>}
        <span className="text-[22px] leading-snug font-bold">{story.headline ?? story.card.title}</span>
        {story.dek && <span className="text-sm text-muted">{story.dek}</span>}
        <Byline story={story} />
      </span>
    </Link>
  );
}

function StoryRow({ story, colorIndex }: { story: ResolvedStory; colorIndex: number }) {
  return (
    <Link href={`/r/${encodeURIComponent(story.card.runId)}`} className="flex gap-3 rounded-[22px] bg-card p-3">
      <RecipePhoto card={story.card} colorIndex={colorIndex} className="h-[104px] w-[96px] shrink-0 rounded-[16px] [&_span]:text-[13px]" />
      <span className="flex min-w-0 flex-col justify-center gap-1">
        {story.kicker && <span className="text-[10.5px] font-bold tracking-[0.12em] text-pink-ink">{story.kicker}</span>}
        <span className="line-clamp-2 text-[16px] leading-snug font-bold">{story.headline ?? story.card.title}</span>
        {story.dek && <span className="line-clamp-2 text-xs text-muted">{story.dek}</span>}
        <Byline story={story} />
      </span>
    </Link>
  );
}

function Missing() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-lg font-bold">This issue isn&apos;t available.</p>
      <Link href="/" className="text-sm font-medium text-muted">
        Back to home ›
      </Link>
    </div>
  );
}

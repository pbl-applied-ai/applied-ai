// 홈 편집 영역(시즌 특집·주제별 줄)을 추천 카드와 묶는다(docs/screen-data.md 7절 5번).
// 편집 파일(content/home.ts)에는 run ID와 글만 있고, 레시피 내용은 list_featured()에서 온 카드를 쓴다.
// run이 추천 목록에 없으면 그 카드만 빼고 그린다(편집 파일과 DB가 어긋나도 화면이 안 깨지게).
import type { RecommendationCard, RecommendationGroup } from "@/lib/api";

export interface HomeStory {
  runId: string;
  headline?: string; // 기사형 제목. 없으면 레시피 제목
  dek?: string; // 한두 줄 설명
  kicker?: string; // 머리말 "COOKIES", "PARTY"
  viewsLabel?: string; // 원본 플랫폼에서 직접 확인한 조회수 글자 "30.9M plays". 자동 갱신 없음
}

export interface HomeIssue {
  slug: string; // "christmas-2026" → /issue/christmas-2026
  label: string; // 스티커 "Holiday issue"
  title: string; // "The Christmas Edit"
  dek: string;
  cover: HomeStory; // 커버 스토리(큰 사진). YouTube 영상이면 사진이 나온다
  stories: HomeStory[];
  quote?: { text: string; runId: string };
  activeUntil: string; // 이 날(ISO 날짜)이 지나면 홈에서 숨김
}

export interface HomeEditorial {
  issue: HomeIssue | null;
  note: { title: string; body: string; picks: string[]; author: string } | null;
  shelves: { title: string; runIds: string[] }[];
  collections: { title: string; color: "pink" | "orange" | "lime"; runIds: string[] }[];
}

export interface ResolvedStory extends HomeStory {
  card: RecommendationCard;
}

export interface ResolvedIssue extends Omit<HomeIssue, "cover" | "stories" | "quote"> {
  cover: ResolvedStory;
  stories: ResolvedStory[];
  quote: { text: string; card: RecommendationCard } | null;
}

export interface ResolvedEditorial {
  issue: ResolvedIssue | null;
  shelves: { title: string; cards: RecommendationCard[] }[];
  /** 편집 영역에 나온 run. Trending에서는 빼서 같은 카드가 두 번 안 나오게 한다 */
  usedRunIds: Set<string>;
}

/** 오늘(YYYY-MM-DD, 그 지역 날짜)이 activeUntil 이하면 보인다 */
export function isIssueActive(issue: Pick<HomeIssue, "activeUntil">, today: Date): boolean {
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}` <= issue.activeUntil;
}

export function cardIndex(groups: RecommendationGroup[]): Map<string, RecommendationCard> {
  const index = new Map<string, RecommendationCard>();
  for (const g of groups) for (const c of g.cards) if (!index.has(c.runId)) index.set(c.runId, c);
  return index;
}

/** 특집 한 호를 카드와 묶는다. 커버 run이 없으면 남은 첫 이야기를 커버로 올리고, 하나도 없으면 null */
export function resolveIssue(issue: HomeIssue, index: Map<string, RecommendationCard>): ResolvedIssue | null {
  const found = [issue.cover, ...issue.stories]
    .map((s) => ({ ...s, card: index.get(s.runId) }))
    .filter((s): s is ResolvedStory => s.card !== undefined);
  if (found.length === 0) return null;
  const [cover, ...stories] = found;
  const quoteCard = issue.quote && index.get(issue.quote.runId);
  return {
    slug: issue.slug,
    label: issue.label,
    title: issue.title,
    dek: issue.dek,
    activeUntil: issue.activeUntil,
    cover,
    stories,
    quote: issue.quote && quoteCard ? { text: issue.quote.text, card: quoteCard } : null,
  };
}

export function resolveEditorial(editorial: HomeEditorial, groups: RecommendationGroup[], today: Date): ResolvedEditorial {
  const index = cardIndex(groups);
  const issue = editorial.issue && isIssueActive(editorial.issue, today) ? resolveIssue(editorial.issue, index) : null;
  const shelves = editorial.shelves
    .map((s) => ({ title: s.title, cards: s.runIds.flatMap((id) => index.get(id) ?? []) }))
    .filter((s) => s.cards.length > 0);

  const usedRunIds = new Set<string>();
  if (issue) for (const s of [issue.cover, ...issue.stories]) usedRunIds.add(s.card.runId);
  for (const s of shelves) for (const c of s.cards) usedRunIds.add(c.runId);
  return { issue, shelves, usedRunIds };
}

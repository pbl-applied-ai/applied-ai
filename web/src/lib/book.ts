// S1 레시피북의 표시 규칙. 데이터는 api.listMyJobs·listRecipes에서 온다.
import type { Job, RecipeSummary } from "@/lib/api";
import type { BookHidden } from "@/lib/book-hidden";
import { stageText } from "@/lib/job-display";

export interface JobCard {
  jobId: string;
  kind: "working" | "failed" | "ready";
  title: string;
  detail: string;
  href: string;
}

/**
 * "만드는 중" 카드. 처리 중·실패한 작업과, 다 만들었지만 아직 저장하지 않은 작업만 보여 준다.
 * - 저장한 적 있는 결과는 뺀다. 지금 레시피 목록에 있거나, 저장·삭제한 시각(hidden.runs)보다 먼저 만든 작업이다.
 *   그 뒤에 같은 영상을 다시 넣어 같은 runId가 나온 작업은 보여 준다.
 *   [찾은 만큼 보기]로 저장한 partial_recipe 실패도 runId가 있어서 같이 빠진다.
 * - [닫기]로 치운 작업(hidden.jobs)도 뺀다.
 */
export function jobCards(jobs: Job[], recipes: RecipeSummary[], hidden: BookHidden = { runs: new Map(), jobs: new Set() }): JobCard[] {
  const inBook = new Set(recipes.map((r) => r.runId));
  const handled = (runId: string, createdAt: string) => {
    if (inBook.has(runId)) return true;
    const at = hidden.runs.get(runId);
    return at !== undefined && Date.parse(createdAt) <= at;
  };
  return jobs.flatMap<JobCard>((job) => {
    const toJob = `/jobs/${encodeURIComponent(job.id)}`;
    if (hidden.jobs.has(job.id)) return [];
    if (job.status === "queued" || job.status === "running") {
      return [{ jobId: job.id, kind: "working", title: "레시피 만드는 중", detail: stageText(job), href: toJob }];
    }
    if (job.runId && handled(job.runId, job.createdAt)) return [];
    if (job.status === "failed") {
      return [{ jobId: job.id, kind: "failed", title: "레시피를 만들지 못했어요", detail: "눌러서 이유 보기", href: toJob }];
    }
    if (job.status === "succeeded" && job.runId) {
      return [
        { jobId: job.id, kind: "ready", title: "레시피가 준비됐어요", detail: "눌러서 확인하고 저장하기", href: `/r/${encodeURIComponent(job.runId)}` },
      ];
    }
    return [];
  });
}

/** 저장일 표시: 10/26 */
export function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

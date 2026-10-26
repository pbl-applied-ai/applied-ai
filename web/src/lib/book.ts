// S1 레시피북의 표시 규칙. 데이터는 api.listMyJobs·listRecipes에서 온다.
import type { Job, RecipeSummary } from "@/lib/api";
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
 * 저장까지 끝난 작업은 레시피 카드로 보이므로 뺀다.
 */
export function jobCards(jobs: Job[], recipes: RecipeSummary[]): JobCard[] {
  const savedRuns = new Set(recipes.map((r) => r.runId));
  return jobs.flatMap<JobCard>((job) => {
    const toJob = `/jobs/${encodeURIComponent(job.id)}`;
    if (job.status === "queued" || job.status === "running") {
      return [{ jobId: job.id, kind: "working", title: "레시피 만드는 중", detail: stageText(job), href: toJob }];
    }
    if (job.status === "failed") {
      return [{ jobId: job.id, kind: "failed", title: "레시피를 만들지 못했어요", detail: "눌러서 이유 보기", href: toJob }];
    }
    if (job.status === "succeeded" && job.runId && !savedRuns.has(job.runId)) {
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

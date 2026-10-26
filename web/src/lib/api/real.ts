// 실제 jobs API 호출. 경로는 KAN-22(POST /jobs · GET /jobs/:id) 기준이며 API가 확정되면 맞춘다.
import type { ApiClient, Job } from "./types";

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // 본문이 있을 때만 Content-Type을 붙인다. GET에 붙이면 API 주소가 다를 때 조회마다 CORS 사전 요청이 한 번 더 나간다.
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

export const realApi: ApiClient = {
  createJob: (sourceUrl) =>
    request<{ id: string }>("/jobs", { method: "POST", body: JSON.stringify({ source_url: sourceUrl }) }),
  getJob: (id) => request<Job>(`/jobs/${encodeURIComponent(id)}`),
};

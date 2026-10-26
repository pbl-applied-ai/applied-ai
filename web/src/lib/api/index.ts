// 화면은 여기서만 API를 가져다 쓴다: import { api } from "@/lib/api"
// NEXT_PUBLIC_API_MODE=real 이면 실제 API, 그 외(기본)는 가짜 데이터(mock).
import { mockApi } from "./mock";
import { realApi } from "./real";
import type { ApiClient } from "./types";

export const api: ApiClient = process.env.NEXT_PUBLIC_API_MODE === "real" ? realApi : mockApi;

export type * from "./types";

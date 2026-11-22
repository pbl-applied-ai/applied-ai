// 웹 화면이 쓰는 데이터 형식과 API 함수 목록.
// 목(mock.ts)과 나중에 만들 Supabase 구현이 같은 RecipeApi를 따른다. 화면은 이 파일의 타입만 본다.

// ── 추출 결과: schemas/recipe.schema.json v0.1 ──────────────

export type AmountStatus = 'confirmed' | 'unconfirmed';
// 확정 분량이 나온 근거 종류(get_run이 붙인다, #57 3절). 확인 안 된 분량은 null → 화면은 칩을 숨긴다
export type AmountSource = 'on_screen' | 'voice' | 'description';

export interface TeamIngredient {
  name: string;
  name_raw?: string;
  amount_raw: string | null; // 미확인이면 null → 화면에서 빈칸
  amount_status: AmountStatus;
  amount_estimate?: { text: string; basis?: string }; // AI 추정값(KAN-52). unconfirmed에만, 로그인 전 공개 링크에서는 서버가 뺀다
  amount_source?: AmountSource | null;
  has_estimate?: true; // 추정값이 있으면 로그인 전에도 온다(값은 서버가 뺌) → 잠금 배지(#68)
  optional?: boolean;
  evidence: string[]; // 화면에는 쓰지 않는다
}

export interface TeamStep {
  order: number;
  text: string;
  evidence: string[];
}

export interface TeamRecipe {
  schema_version: '0.1';
  video_id: string;
  title: string;
  servings_raw?: string | null;
  ingredients: TeamIngredient[];
  steps: TeamStep[];
}

// ── 작업(job): docs/worker-interface.md v0.2 ─────────────────

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export type JobStage = 'collect' | 'asr' | 'ocr' | 'structure' | 'finalize';

export type JobErrorCode =
  | 'retryable'
  | 'unavailable'
  | 'unsupported_source'
  | 'not_a_recipe'
  | 'insufficient'
  | 'internal';

export interface Job {
  id: string;
  sourceUrl: string; // listMyJobs에서만 채운다. get_job RPC는 주지 않는다
  status: JobStatus;
  stage: JobStage | null;
  errorCode: JobErrorCode | null;
  reason: string | null; // 실패 세부 원인(예: partial_recipe). 실패 안내 문구를 고를 때 쓴다
  runId: string | null; // succeeded일 때, 또는 partial_recipe 실패에서 "찾은 만큼 보기"용
  createdAt: string;
}

// 추출 결과. 고치지 않는 공유 데이터라 로그인 없이 읽는다(공개 링크 /r/<runId>).
export interface Run {
  id: string;
  sourceUrl: string;
  recipe: TeamRecipe;
  createdAt: string;
  // get_run이 주는 카드 정보(#63). 목·예전 결과에는 없을 수 있다
  creator?: string | null;
  platform?: string | null;
  durationMs?: number | null;
  thumbnailUrl?: string | null; // YouTube만. 이미지를 받아 저장하지 않고 원본 주소로 보여 준다(#57)
}

// ── 사용자 레시피(레시피북) ─────────────────────────────────

// 항목 ID·user_entered는 KAN-9(스키마 v0.2) 합의 전 임시안이다.
export interface EditableIngredient {
  id: string; // 'ing-1'부터. 추출 결과의 순서로 붙인다
  name: string;
  amount_raw: string | null;
  amount_status: AmountStatus;
  amount_estimate?: { text: string; basis?: string }; // 아직 쓰지 않은 AI 추정값. 저장할 때는 뺀다
  has_estimate?: true; // 추정값이 있다는 표시. 로그인 전 잠금 배지 "Sign in to see"는 이 재료에만(#68). 저장할 때는 뺀다
  amount_source?: AmountSource | null; // 화면 칩(On-screen·Voice·Description). 사용자가 고치면 뺀다
  optional?: boolean;
  edited: boolean; // 추출 결과에서 바뀌었으면 true → "직접 입력" 표시
  user_entered: boolean; // 사용자가 추가한 항목이거나 근거 없이 채운 분량
}

export interface EditableStep {
  id: string; // 'step-1'부터
  text: string;
  edited: boolean;
  user_entered: boolean;
}

// 확인·수정 화면(S4)이 들고 있는 상태. 저장하면 UserRecipe가 된다.
export interface EditableRecipe {
  runId: string;
  title: string;
  servingsRaw: string | null;
  ingredients: EditableIngredient[];
  steps: EditableStep[]; // 배열 순서가 조리 순서
}

export interface UserRecipe extends EditableRecipe {
  id: string;
  sourceUrl: string;
  createdAt: string;
  updatedAt: string;
}

// 레시피북 목록 카드(S1)
export interface RecipeSummary {
  id: string;
  runId: string;
  title: string;
  ingredientCount: number;
  unconfirmedCount: number; // "분량 확인 필요 N"
  createdAt: string;
}

// 홈 추천 레시피 묶음(S6). 팀이 미리 변환해 둔 결과(run)를 묶어 둔다. 카드를 누르면 공개 보기(/r/<runId>)
export interface RecommendationCard {
  runId: string;
  title: string;
  creator: string; // 크리에이터 이름. 원본 링크와 함께 항상 보여 준다(기획안 저작권 기준)
  ingredientCount: number;
  categories?: string[]; // 취향 태그 id(vegan·late_night·dessert·high_protein). 홈 칩으로 거른다
  thumbnailUrl?: string | null;
  saveCount?: number;
}

export interface RecommendationGroup {
  id: string;
  title: string;
  cards: RecommendationCard[];
}

export interface User {
  id: string;
  email: string | null;
}

// ── API ────────────────────────────────────────────────────

export class NotSignedInError extends Error {
  constructor() {
    super('Please sign in first');
    this.name = 'NotSignedInError';
  }
}

export interface RecipeApi {
  // 로그인 없이
  createJob(sourceUrl: string): Promise<{ jobId: string }>;
  createUploadJob(file: File): Promise<{ jobId: string }>; // 로그인 필요(안 했으면 NotSignedInError). 영상 파일을 올리고 job을 만든다(KAN-49). 원본은 처리 뒤 지운다
  getJob(jobId: string): Promise<Job | null>; // 처리 중 화면이 1~2초마다 부른다
  getRun(runId: string): Promise<Run | null>;
  listRecommendations(): Promise<RecommendationGroup[]>; // 홈 추천 묶음. 없으면 빈 목록이고 홈은 묶음 칸을 숨긴다

  // 로그인
  getUser(): Promise<User | null>;
  signInWithGoogle(returnTo: string): Promise<void>; // 페이지를 떠났다가 returnTo로 돌아온다
  completeSignIn(code: string): Promise<string>; // /auth/callback이 부른다. 돌아갈 주소를 돌려준다
  signInReturnTo(): Promise<string | null>; // 진행 중인 로그인이 돌아갈 주소. 취소·실패 뒤 다시 로그인할 때 쓴다
  signOut(): Promise<void>;

  // 로그인 필요. 안 했으면 NotSignedInError
  listMyJobs(): Promise<Job[]>; // 레시피북의 "만드는 중" 카드
  saveRecipe(draft: EditableRecipe): Promise<{ id: string }>; // 같은 runId를 또 저장하면 기존 레시피를 덮어쓴다
  listRecipes(): Promise<RecipeSummary[]>;
  getRecipe(id: string): Promise<UserRecipe | null>;
  updateRecipe(id: string, draft: EditableRecipe): Promise<void>;
  deleteRecipe(id: string): Promise<void>;
}

"use client";

// S1 레시피북(Pinch 시안 03·04·06). 로그인 전에는 로그인 화면으로 보내지 않고 이 화면 안에서 로그인을 권한다.
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { type Folder, FolderError, type Job, type RecipeSummary, type User, api } from "@/lib/api";
import { type JobCard, jobCards } from "@/lib/book";
import { type BookHidden, hideJob, readBookHidden } from "@/lib/book-hidden";
import { JobCardList, RecipeGridCard } from "@/components/book-cards";
import { EmojiHero } from "@/components/emoji-hero";
import { FOLDER_EMOJI } from "@/components/folder-sheet";
import { TabBar } from "@/components/tab-bar";
import { GoogleButton } from "../login/google-button";

const POLL_MS = 3000;

export function BookScreen() {
  const [user, setUser] = useState<User | null | undefined>(undefined); // undefined = 아직 모름
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [recipes, setRecipes] = useState<RecipeSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [hidden, setHidden] = useState<BookHidden | null>(null);
  // B 폴더 칩(screen-data 2절 B). null = All. 폴더 목록을 못 읽어도 레시피는 보여 준다
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folder, setFolder] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [folderError, setFolderError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api.getUser().then(
      (u) => alive && setUser(u),
      () => alive && setUser(null),
    );
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    const userId = user.id;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const [nextJobs, nextRecipes, nextFolders] = await Promise.all([
          api.listMyJobs(),
          api.listRecipes(),
          api.listFolders().catch(() => null),
        ]);
        if (cancelled) return;
        setJobs(nextJobs);
        setRecipes(nextRecipes);
        if (nextFolders) setFolders(nextFolders);
        setHidden(readBookHidden(userId));
        setFailed(false);
        // 만드는 중인 작업이 있으면 카드 문구가 바뀌도록 가끔 다시 읽는다
        if (nextJobs.some((j) => j.status === "queued" || j.status === "running")) timer = setTimeout(refresh, POLL_MS);
      } catch {
        if (!cancelled) setFailed(true);
      }
    }
    refresh();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [user]);

  const cards: JobCard[] = jobs && recipes && hidden ? jobCards(jobs, recipes, hidden) : [];
  const loading = user === undefined || (user !== null && (jobs === null || recipes === null) && !failed);
  const count = recipes?.length ?? 0;
  const shown = folder ? (recipes ?? []).filter((r) => r.categoryIds?.includes(folder)) : (recipes ?? []);
  const folderName = folders.find((f) => f.id === folder)?.name;

  async function addFolder() {
    const name = newName.trim();
    if (!name) return;
    setFolderError(null);
    try {
      const made = await api.createFolder(name);
      setFolders((list) => [...list, made]);
      setFolder(made.id);
      setNewName("");
      setAdding(false);
    } catch (err) {
      setFolderError(err instanceof FolderError ? err.message : "Couldn't make the folder. Please try again.");
    }
  }

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between px-6 pt-6 pb-2">
        <h1 className="text-[28px] leading-[1.15] font-bold">My recipe book</h1>
        {user && count > 0 && <span className="sticker bg-orange text-base">{count}</span>}
      </header>

      {loading && <p className="px-6 py-10 text-center text-sm text-muted">Loading…</p>}

      {user === null && (
        <section className="flex flex-col items-center px-6 pt-20 text-center">
          <EmojiHero emoji="📖" sticker="yours" circle="bg-pink-tint" stickerColor="bg-orange" />
          <h2 className="mt-7 text-xl font-bold">Sign in to see your recipe book</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Your saved recipes live here.
            <br />
            You can still convert videos without an account.
          </p>
          <div className="mt-6 w-full">
            <Suspense fallback={null}>
              <GoogleButton returnTo="/book" />
            </Suspense>
          </div>
        </section>
      )}

      {user && failed && (
        <p role="alert" className="px-6 py-10 text-center text-sm text-danger">
          Couldn&apos;t load your recipe book. Please try again in a moment.
        </p>
      )}

      {user && !loading && !failed && (
        <div className="flex flex-col gap-3 px-6 pt-2 pb-4">
          <JobCardList
            cards={cards}
            onHide={(jobId) => {
              hideJob(user.id, jobId);
              setHidden(readBookHidden(user.id));
            }}
          />

          {recipes && recipes.length > 0 && (
            <>
              <div className="-mx-6 flex gap-2 overflow-x-auto px-6 py-1 [scrollbar-width:none]" role="group" aria-label="Folders">
                <FolderChip label="All" count={recipes.length} on={folder === null} onClick={() => setFolder(null)} />
                {folders.map((f) => (
                  <FolderChip
                    key={f.id}
                    label={`${f.emoji ?? FOLDER_EMOJI} ${f.name}`}
                    count={recipes.filter((r) => r.categoryIds?.includes(f.id)).length}
                    on={folder === f.id}
                    onClick={() => setFolder(f.id)}
                  />
                ))}
                {folders.length < 20 && (
                  <button
                    type="button"
                    onClick={() => setAdding((v) => !v)}
                    className="flex min-h-10 shrink-0 items-center rounded-full border-2 border-dashed border-foreground/40 px-4 text-sm font-bold"
                  >
                    ＋ New folder
                  </button>
                )}
              </div>

              {adding && (
                <form
                  className="flex flex-col gap-1.5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    addFolder();
                  }}
                >
                  <div className="flex gap-2">
                    <input
                      aria-label="Folder name"
                      autoFocus
                      maxLength={30}
                      value={newName}
                      onChange={(e) => {
                        setNewName(e.target.value);
                        setFolderError(null);
                      }}
                      placeholder="e.g. Weeknight dinners"
                      className="min-h-11 min-w-0 flex-1 rounded-2xl border-2 border-foreground bg-card px-4 text-[15px]"
                    />
                    <button type="submit" disabled={!newName.trim()} className="btn-primary w-auto px-5 disabled:opacity-60">
                      Add
                    </button>
                  </div>
                  {folderError && (
                    <p role="alert" className="text-[13px] text-danger">
                      {folderError}
                    </p>
                  )}
                </form>
              )}

              <p className="mt-2 text-sm text-muted">{folderName ?? "Recently saved"}</p>
              {shown.length > 0 ? (
                <div className="grid grid-cols-2 gap-x-3.5 gap-y-5">
                  {shown.map((r) => (
                    <RecipeGridCard key={r.id} recipe={r} />
                  ))}
                </div>
              ) : (
                <p className="py-8 text-center text-sm leading-relaxed text-muted">
                  No recipes in this folder yet.
                  <br />
                  Open a recipe and tap &ldquo;Folders&rdquo; to add it here.
                </p>
              )}
            </>
          )}

          {recipes && recipes.length === 0 && cards.length === 0 && (
            <section className="flex flex-col items-center pt-20 text-center">
              <EmojiHero emoji="🍳" sticker="empty!" circle="bg-orange-tint" stickerColor="bg-pink" />
              <h2 className="mt-7 text-xl font-bold">No recipes saved yet</h2>
              <p className="mt-2 text-sm text-muted">Paste a cooking video link to get a recipe.</p>
              <Link href="/convert?new=1" className="btn-primary mt-6 w-[220px]">
                Convert a video
              </Link>
            </section>
          )}
        </div>
      )}
      <TabBar />
    </main>
  );
}

function FolderChip({ label, count, on, onClick }: { label: string; count: number; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border-2 px-4 text-sm font-bold ${
        on ? "border-foreground bg-pink-tint" : "border-transparent bg-card"
      }`}
    >
      <span className="max-w-[160px] truncate">{label}</span>
      <span className="text-muted">{count}</span>
    </button>
  );
}

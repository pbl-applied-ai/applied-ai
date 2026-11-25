"use client";

// K 폴더 고르기 시트(docs/screen-data.md 2절 K). 저장할 때와 레시피 상세에서 폴더를 바꿀 때 쓴다.
// 폴더는 여러 개 고를 수 있고, 하나도 안 골라도 된다. 새 폴더는 여기서 바로 만들고 바로 체크한다.
import { useEffect, useState } from "react";
import { type Folder, FolderError, api } from "@/lib/api";

export const FOLDER_EMOJI = "📁";

export function FolderSheet({
  title,
  confirmLabel,
  initial = [],
  busy = false,
  error = null,
  onCancel,
  onConfirm,
}: {
  title: string;
  confirmLabel: string;
  initial?: string[];
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: (folderIds: string[]) => void;
}) {
  const [folders, setFolders] = useState<Folder[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [picked, setPicked] = useState<string[]>(initial);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api.listFolders().then(
      (list) => alive && setFolders(list),
      () => alive && setLoadFailed(true),
    );
    return () => {
      alive = false;
    };
  }, []);

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  async function create() {
    if (creating || !name.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const folder = await api.createFolder(name.trim());
      setFolders((list) => [...(list ?? []), folder]);
      setPicked((p) => [...p, folder.id]);
      setName("");
      setAdding(false);
    } catch (err) {
      setCreateError(err instanceof FolderError ? err.message : "Couldn't make the folder. Please try again.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end bg-[rgba(59,31,26,0.45)]" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="folder-title"
        onClick={(e) => e.stopPropagation()}
        className="mx-auto flex max-h-[85dvh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-t-[30px] bg-background px-6 pt-6 pb-8"
      >
        <p id="folder-title" className="text-lg font-bold">
          {title}
        </p>

        {folders === null && !loadFailed && <p className="py-4 text-sm text-muted">Loading folders…</p>}
        {loadFailed && (
          <p role="alert" className="py-2 text-sm text-danger">
            Couldn&apos;t load your folders. You can still save without one.
          </p>
        )}

        {folders && folders.length === 0 && !adding && (
          <p className="text-sm text-muted">No folders yet. Make one to keep recipes together, like &ldquo;Weeknight&rdquo; or &ldquo;Desserts&rdquo;.</p>
        )}

        {folders && folders.length > 0 && (
          <ul className="flex flex-col gap-2">
            {folders.map((f) => {
              const on = picked.includes(f.id);
              return (
                <li key={f.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => toggle(f.id)}
                    className={`flex min-h-14 w-full items-center gap-3 rounded-2xl border-2 px-4 text-left ${
                      on ? "border-foreground bg-pink-tint" : "border-transparent bg-card"
                    }`}
                  >
                    <span className="text-2xl" aria-hidden="true">
                      {f.emoji ?? FOLDER_EMOJI}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[15px] font-bold">{f.name}</span>
                      <span className="text-xs text-muted">
                        {f.recipeCount} {f.recipeCount === 1 ? "recipe" : "recipes"}
                      </span>
                    </span>
                    <span
                      aria-hidden="true"
                      className={`flex size-6 items-center justify-center rounded-full border-2 border-foreground text-sm font-bold ${on ? "bg-foreground text-background" : ""}`}
                    >
                      {on ? "✓" : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {folders && !adding && folders.length < 20 && (
          <button type="button" onClick={() => setAdding(true)} className="flex min-h-12 items-center gap-2 text-[15px] font-bold underline-offset-4 hover:underline">
            <span aria-hidden="true">＋</span> New folder
          </button>
        )}

        {adding && (
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              create();
            }}
          >
            <label htmlFor="folder-name" className="text-sm font-bold">
              Folder name
            </label>
            <div className="flex gap-2">
              <input
                id="folder-name"
                autoFocus
                maxLength={30}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setCreateError(null);
                }}
                placeholder="e.g. Weeknight dinners"
                className="min-h-12 min-w-0 flex-1 rounded-2xl border-2 border-foreground bg-card px-4 text-[15px]"
              />
              <button type="submit" disabled={creating || !name.trim()} className="btn-primary w-auto px-5 disabled:opacity-60">
                {creating ? "Adding…" : "Add"}
              </button>
            </div>
            {createError && (
              <p role="alert" className="text-[13px] text-danger">
                {createError}
              </p>
            )}
          </form>
        )}

        {error && (
          <p role="alert" className="text-[13px] text-danger">
            {error}
          </p>
        )}

        <div className="mt-2 flex gap-2">
          <button type="button" onClick={onCancel} className="btn-ghost flex-1">
            Cancel
          </button>
          <button type="button" disabled={busy} onClick={() => onConfirm(picked)} className="btn-primary flex-1 disabled:opacity-60">
            {busy ? "Saving…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

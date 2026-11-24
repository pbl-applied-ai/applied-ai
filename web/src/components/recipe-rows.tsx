"use client";

// S4 확인·수정 화면의 재료 줄·조리 순서 줄·추가 폼. 화면 안에서 바로 고친다(인라인 편집, UX v0.4).
import { useState } from "react";
import type { EditableIngredient, EditableStep } from "@/lib/api";
import { amountView, isUserAdded } from "@/lib/review";
import { metricHint, usFirst } from "@/lib/units";
import { SourceChip } from "./recipe-source";

const input = "h-11 min-w-0 rounded-xl border-2 border-foreground bg-card px-3 text-[15px] outline-none focus:border-pink";
const primary = "h-11 shrink-0 rounded-full bg-ink px-5 text-sm font-bold text-white disabled:bg-disabled disabled:text-muted";
const quiet = "min-h-8 px-1 text-xs text-muted underline underline-offset-2";

function EditedMark({ onRevert, onRemove, userAdded }: { onRevert: () => void; onRemove: () => void; userAdded: boolean }) {
  return (
    <span className="flex items-center gap-1 text-xs">
      <span className="src-chip">You entered</span>
      <span aria-hidden="true" className="text-muted">
        ·
      </span>
      {userAdded ? (
        <button type="button" onClick={onRemove} className={quiet}>
          Delete
        </button>
      ) : (
        <button type="button" onClick={onRevert} className={quiet}>
          Undo
        </button>
      )}
    </span>
  );
}

/** 영상 값이 아닌 AI 추정값 표시(KAN-66). 영상에서 확인한 값과 섞이지 않게 Pinch estimate 라벨로 구분한다. */
export function EstimateChip() {
  return <span className="text-[10px] font-bold tracking-wide uppercase">Pinch estimate</span>;
}

export function IngredientRow({
  item,
  editing,
  onStartEdit,
  onCancel,
  onSave,
  onRevert,
  onRemove,
}: {
  item: EditableIngredient;
  editing: boolean;
  onStartEdit: () => void;
  onCancel: () => void;
  onSave: (patch: { name: string; amount_raw: string | null }) => void;
  onRevert: () => void;
  onRemove: () => void;
}) {
  const [name, setName] = useState(item.name);
  // 입력칸도 화면 표시처럼 미국 단위를 앞에 둔다(#84 리뷰). 그대로 저장하면 원래 값을 보내서 "직접 입력"이 되지 않게 한다.
  const shown = (text: string | null | undefined) => (text ? usFirst(text) : "");
  const [amount, setAmount] = useState(shown(item.amount_raw));
  const view = amountView(item);
  // 추정값은 영상 값이 아니라서 ml/g 참고값을 붙이지 않는다
  const hint = view.kind === "missing" || view.kind === "estimate" ? null : metricHint(view.text, item.name);
  const userAdded = isUserAdded(item.id);
  // 되돌리기 뒤에 다시 고칠 때도 지금 값에서 시작하도록 편집을 열 때마다 입력칸을 채운다
  const startEdit = () => {
    setName(item.name);
    // 추정값이 있으면 입력칸에 미리 채운다. [확인]을 누르면 그 값을 쓴 것("직접 입력")이 된다.
    setAmount(shown(item.amount_raw ?? item.amount_estimate?.text));
    onStartEdit();
  };

  if (editing) {
    return (
      <form
        className="flex flex-col gap-2 border-t border-line py-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          const typed = amount.trim();
          const unchanged = item.amount_raw != null && typed === shown(item.amount_raw).trim();
          onSave({ name: name.trim(), amount_raw: unchanged ? item.amount_raw : typed || null });
        }}
      >
        <div className="flex gap-2">
          <label className="sr-only" htmlFor={`${item.id}-name`}>
            Ingredient name
          </label>
          <input id={`${item.id}-name`} value={name} onChange={(e) => setName(e.target.value)} className={`${input} flex-[3]`} />
          <label className="sr-only" htmlFor={`${item.id}-amount`}>
            Amount
          </label>
          <input
            id={`${item.id}-amount`}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="e.g. 1 tbsp, a pinch"
            autoFocus
            className={`${input} flex-[2]`}
          />
        </div>
        <div className="flex items-center justify-between">
          <button type="button" onClick={onRemove} className="min-h-11 px-1 text-sm text-danger">
            Remove ingredient
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onCancel} className="h-11 px-3 text-sm text-muted">
              Cancel
            </button>
            <button type="submit" disabled={!name.trim()} className={primary}>
              Done
            </button>
          </div>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-col border-t border-line py-2.5">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <button type="button" onClick={startEdit} className="min-h-11 text-left text-base font-medium" aria-label={`Edit ${item.name}`}>
          {item.name}
          {item.optional && <span className="ml-1.5 rounded-full bg-subtle px-2 py-0.5 text-[11px] text-muted">optional</span>}
        </button>
        {view.kind === "confirmed" && (
          <span className="flex items-center gap-2">
            <SourceChip source={item.amount_source} />
            <button type="button" onClick={startEdit} aria-label={`${item.name}, ${view.text}. Edit`} className="min-h-11 px-1 text-[15px] font-bold">
              {view.text}
            </button>
          </span>
        )}
        {view.kind === "estimate" && (
          <button
            type="button"
            onClick={startEdit}
            aria-label={`${item.name}, Pinch estimate ${view.text}. Use or edit`}
            className="flex min-h-9 items-center gap-1.5 rounded-full border-[1.5px] border-dashed border-pink bg-pink-tint px-3 text-[14px] font-bold whitespace-nowrap text-pink-ink"
          >
            ≈ {view.text}
            <EstimateChip />
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M4 20h4L19 9l-4-4L4 16v4z" />
            </svg>
          </button>
        )}
        {view.kind === "missing" && (
          <button
            type="button"
            onClick={startEdit}
            aria-label={`${item.name}, amount not in the video. Add it`}
            className="flex min-h-9 items-center gap-1.5 rounded-full border-[1.5px] border-dashed border-[#cfc6ba] bg-card px-3 text-[13px] whitespace-nowrap text-muted"
          >
            Not in the video
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M4 20h4L19 9l-4-4L4 16v4z" />
            </svg>
          </button>
        )}
        {view.kind === "user" && (
          <button type="button" onClick={startEdit} aria-label={`${item.name}, ${view.text}. Edit again`} className="min-h-11 rounded-full bg-lime-tint px-3 text-[15px] font-bold">
            {view.text}
          </button>
        )}
      </div>
      {view.kind === "estimate" && view.basis && <p className="mt-1 text-right text-[11px] text-muted">{view.basis}</p>}
      {hint && <p className="-mt-1.5 text-right text-[11px] text-muted">{hint}</p>}
      {(item.edited || item.user_entered) && (
        <div className="-mt-1 flex justify-end">
          <EditedMark onRevert={onRevert} onRemove={onRemove} userAdded={userAdded} />
        </div>
      )}
    </div>
  );
}

export function StepRow({
  item,
  order,
  isFirst,
  isLast,
  editing,
  onStartEdit,
  onCancel,
  onSave,
  onRevert,
  onRemove,
  onMove,
}: {
  item: EditableStep;
  order: number;
  isFirst: boolean;
  isLast: boolean;
  editing: boolean;
  onStartEdit: () => void;
  onCancel: () => void;
  onSave: (text: string) => void;
  onRevert: () => void;
  onRemove: () => void;
  onMove: (offset: -1 | 1) => void;
}) {
  const [text, setText] = useState(item.text);
  const userAdded = isUserAdded(item.id);
  const startEdit = () => {
    setText(item.text);
    onStartEdit();
  };

  return (
    <div className="flex gap-3 border-t border-line py-3">
      <span className="mt-2 flex size-[26px] shrink-0 items-center justify-center rounded-full border-2 border-foreground bg-pink text-[13px] font-bold text-foreground">
        {order}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {editing ? (
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) onSave(text.trim());
            }}
          >
            <label className="sr-only" htmlFor={`${item.id}-text`}>
              Step {order}
            </label>
            <textarea
              id={`${item.id}-text`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              autoFocus
              className="w-full resize-none rounded-xl border-2 border-foreground bg-card px-3 py-2.5 text-[15px] leading-normal outline-none focus:border-pink"
            />
            <div className="flex items-center justify-between">
              <div className="flex">
                <button type="button" onClick={() => onMove(-1)} disabled={isFirst} aria-label="Move up" className="size-11 text-muted disabled:opacity-30">
                  ↑
                </button>
                <button type="button" onClick={() => onMove(1)} disabled={isLast} aria-label="Move down" className="size-11 text-muted disabled:opacity-30">
                  ↓
                </button>
                <button type="button" onClick={onRemove} className="min-h-11 px-2 text-sm text-danger">
                  Remove step
                </button>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={onCancel} className="h-11 px-3 text-sm text-muted">
                  Cancel
                </button>
                <button type="submit" disabled={!text.trim()} className={primary}>
                  Done
                </button>
              </div>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={startEdit}
            aria-label={`Edit step ${order}`}
            className={`-mx-2 min-h-11 rounded-lg px-2 py-2 text-left text-[15px] leading-relaxed ${item.edited || item.user_entered ? "bg-lime-tint" : ""}`}
          >
            {item.text}
          </button>
        )}
        {!editing && (item.edited || item.user_entered) && <EditedMark onRevert={onRevert} onRemove={onRemove} userAdded={userAdded} />}
      </div>
    </div>
  );
}

export function AddIngredientForm({ onAdd }: { onAdd: (name: string, amount: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-1 min-h-12 rounded-full border-[1.5px] border-dashed border-foreground bg-card text-sm font-bold">
        + Add ingredient
      </button>
    );
  }
  return (
    <form
      className="mt-1 flex flex-col gap-2 border-t border-line pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        onAdd(name, amount || null);
        setName("");
        setAmount("");
        setOpen(false);
      }}
    >
      <div className="flex gap-2">
        <label className="sr-only" htmlFor="new-ing-name">
          New ingredient name
        </label>
        <input id="new-ing-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ingredient" autoFocus className={`${input} flex-[3]`} />
        <label className="sr-only" htmlFor="new-ing-amount">
          New ingredient amount
        </label>
        <input id="new-ing-amount" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount (optional)" className={`${input} flex-[2]`} />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="h-11 px-3 text-sm text-muted">
          Cancel
        </button>
        <button type="submit" disabled={!name.trim()} className={primary}>
          Add
        </button>
      </div>
    </form>
  );
}

export function AddStepForm({ label, onAdd }: { label: string; onAdd: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-1 min-h-12 rounded-full border-[1.5px] border-dashed border-foreground bg-card text-sm font-bold">
        {label}
      </button>
    );
  }
  return (
    <form
      className="mt-1 flex flex-col gap-2 border-t border-line pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return;
        onAdd(text);
        setText("");
        setOpen(false);
      }}
    >
      <label className="sr-only" htmlFor="new-step">
        New step
      </label>
      <textarea
        id="new-step"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="e.g. Heat oil in a pan and cook the garlic."
        autoFocus
        className="w-full resize-none rounded-xl border-2 border-foreground bg-card px-3 py-2.5 text-[15px] outline-none focus:border-pink"
      />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="h-11 px-3 text-sm text-muted">
          Cancel
        </button>
        <button type="submit" disabled={!text.trim()} className={primary}>
          Add
        </button>
      </div>
    </form>
  );
}

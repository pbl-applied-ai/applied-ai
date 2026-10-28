"use client";

// S4 확인·수정 화면의 재료 줄·조리 순서 줄·추가 폼. 화면 안에서 바로 고친다(인라인 편집, UX v0.4).
import { useState } from "react";
import type { EditableIngredient, EditableStep } from "@/lib/api";
import { amountView, isUserAdded } from "@/lib/review";

const input = "h-11 min-w-0 rounded-[10px] border-[1.5px] border-link px-3 text-[15px] outline-none";
const primary = "h-11 shrink-0 rounded-[10px] bg-foreground px-4 text-sm font-bold text-background disabled:bg-disabled disabled:text-muted";
const quiet = "min-h-8 px-1 text-xs text-link underline";

function EditedMark({ onRevert, onRemove, userAdded }: { onRevert: () => void; onRemove: () => void; userAdded: boolean }) {
  return (
    <span className="flex items-center gap-1 text-xs">
      <span className="font-medium text-[#174a94]">직접 입력</span>
      <span aria-hidden="true" className="text-muted">
        ·
      </span>
      {userAdded ? (
        <button type="button" onClick={onRemove} className={quiet}>
          삭제
        </button>
      ) : (
        <button type="button" onClick={onRevert} className={quiet}>
          되돌리기
        </button>
      )}
    </span>
  );
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
  const [amount, setAmount] = useState(item.amount_raw ?? "");
  const view = amountView(item);
  const userAdded = isUserAdded(item.id);
  // 되돌리기 뒤에 다시 고칠 때도 지금 값에서 시작하도록 편집을 열 때마다 입력칸을 채운다
  const startEdit = () => {
    setName(item.name);
    setAmount(item.amount_raw ?? "");
    onStartEdit();
  };

  if (editing) {
    return (
      <form
        className="flex flex-col gap-2 border-t border-[#ecece8] py-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          onSave({ name: name.trim(), amount_raw: amount.trim() || null });
        }}
      >
        <div className="flex gap-2">
          <label className="sr-only" htmlFor={`${item.id}-name`}>
            재료 이름
          </label>
          <input id={`${item.id}-name`} value={name} onChange={(e) => setName(e.target.value)} className={`${input} flex-[3]`} />
          <label className="sr-only" htmlFor={`${item.id}-amount`}>
            분량
          </label>
          <input
            id={`${item.id}-amount`}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="예: 1큰술, 약간"
            autoFocus
            className={`${input} flex-[2]`}
          />
        </div>
        <div className="flex items-center justify-between">
          <button type="button" onClick={onRemove} className="min-h-11 px-1 text-sm text-danger">
            재료 삭제
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onCancel} className="h-11 px-3 text-sm text-muted">
              취소
            </button>
            <button type="submit" disabled={!name.trim()} className={primary}>
              확인
            </button>
          </div>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-col border-t border-[#ecece8] py-2.5">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <button type="button" onClick={startEdit} className="min-h-11 text-left text-base font-medium" aria-label={`${item.name} 고치기`}>
          {item.name}
          {item.optional && <span className="ml-1.5 rounded-full bg-subtle px-2 py-0.5 text-[11px] text-muted">선택</span>}
        </button>
        {view.kind === "confirmed" && (
          <button type="button" onClick={startEdit} aria-label={`${item.name} 분량 ${view.text}, 고치기`} className="min-h-11 px-1 text-[15px]">
            {view.text}
          </button>
        )}
        {view.kind === "missing" && (
          <button
            type="button"
            onClick={startEdit}
            aria-label={`${item.name} 분량 영상에서 확인 안 됨, 입력하기`}
            className="flex min-h-11 items-center gap-1.5 rounded-[10px] border border-dashed border-line-strong bg-[#fafaf8] px-3 text-[13px] whitespace-nowrap text-muted"
          >
            영상에서 확인 안 됨
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M4 20h4L19 9l-4-4L4 16v4z" />
            </svg>
          </button>
        )}
        {view.kind === "user" && (
          <button type="button" onClick={startEdit} aria-label={`${item.name} 분량 ${view.text}, 다시 고치기`} className="min-h-11 rounded-[10px] bg-[#eaf1fb] px-2.5 text-[15px]">
            {view.text}
          </button>
        )}
      </div>
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
    <div className="flex gap-3 border-t border-[#ecece8] py-3">
      <span className="mt-2 flex size-[26px] shrink-0 items-center justify-center rounded-full bg-foreground text-[13px] font-bold text-background">
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
              {order}단계 내용
            </label>
            <textarea
              id={`${item.id}-text`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              autoFocus
              className="w-full resize-none rounded-[10px] border-[1.5px] border-link px-3 py-2.5 text-[15px] leading-normal outline-none"
            />
            <div className="flex items-center justify-between">
              <div className="flex">
                <button type="button" onClick={() => onMove(-1)} disabled={isFirst} aria-label="위로 옮기기" className="size-11 text-muted disabled:opacity-30">
                  ↑
                </button>
                <button type="button" onClick={() => onMove(1)} disabled={isLast} aria-label="아래로 옮기기" className="size-11 text-muted disabled:opacity-30">
                  ↓
                </button>
                <button type="button" onClick={onRemove} className="min-h-11 px-2 text-sm text-danger">
                  단계 삭제
                </button>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={onCancel} className="h-11 px-3 text-sm text-muted">
                  취소
                </button>
                <button type="submit" disabled={!text.trim()} className={primary}>
                  확인
                </button>
              </div>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={startEdit}
            aria-label={`${order}단계 고치기`}
            className={`-mx-2 min-h-11 rounded-lg px-2 py-2 text-left text-[15px] leading-relaxed ${item.edited || item.user_entered ? "bg-[#eaf1fb]" : ""}`}
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
      <button type="button" onClick={() => setOpen(true)} className="mt-1 min-h-12 rounded-[10px] border-[1.5px] border-dashed border-line-strong text-sm font-medium">
        + 재료 추가
      </button>
    );
  }
  return (
    <form
      className="mt-1 flex flex-col gap-2 border-t border-[#ecece8] pt-3"
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
          새 재료 이름
        </label>
        <input id="new-ing-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="재료 이름" autoFocus className={`${input} flex-[3]`} />
        <label className="sr-only" htmlFor="new-ing-amount">
          새 재료 분량
        </label>
        <input id="new-ing-amount" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="분량(선택)" className={`${input} flex-[2]`} />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="h-11 px-3 text-sm text-muted">
          취소
        </button>
        <button type="submit" disabled={!name.trim()} className={primary}>
          추가
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
      <button type="button" onClick={() => setOpen(true)} className="mt-1 min-h-12 rounded-[10px] border-[1.5px] border-dashed border-line-strong text-sm font-medium">
        {label}
      </button>
    );
  }
  return (
    <form
      className="mt-1 flex flex-col gap-2 border-t border-[#ecece8] pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return;
        onAdd(text);
        setText("");
        setOpen(false);
      }}
    >
      <label className="sr-only" htmlFor="new-step">
        새 조리 단계
      </label>
      <textarea
        id="new-step"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="예: 팬에 기름을 두르고 마늘을 볶는다."
        autoFocus
        className="w-full resize-none rounded-[10px] border-[1.5px] border-link px-3 py-2.5 text-[15px] outline-none"
      />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="h-11 px-3 text-sm text-muted">
          취소
        </button>
        <button type="submit" disabled={!text.trim()} className={primary}>
          추가
        </button>
      </div>
    </form>
  );
}

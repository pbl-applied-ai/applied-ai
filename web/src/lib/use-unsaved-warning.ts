"use client";

import { useEffect } from "react";

/** 저장하지 않은 수정이 있으면 새로고침·탭 닫기·다른 사이트로 나갈 때 브라우저가 한 번 묻는다. */
export function useUnsavedWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ""; // 오래된 브라우저용
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
}

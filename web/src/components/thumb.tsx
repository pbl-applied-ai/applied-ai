// 사진 자리. 썸네일 주소가 있으면 원본 주소 그대로 보여 주고(이미지를 받아 저장하지 않음, #57),
// 없거나 못 불러오면 줄무늬 회색 상자다.
"use client";

import { useState } from "react";

export function Thumb({ src, className = "" }: { src?: string | null; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) return <span className={`photo block ${className}`} aria-hidden="true" />;
  return (
    // 외부 썸네일이라 next/image 설정 없이 그대로 쓴다
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} className={`block bg-subtle object-cover ${className}`} />
  );
}

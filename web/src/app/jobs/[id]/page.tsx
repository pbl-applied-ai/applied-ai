// 임시 화면. 처리 중 단계 표시와 실패 안내는 KAN-29에서 만든다.
import Link from "next/link";
import { Suspense } from "react";
import { JobId } from "./job-id";

export default function JobPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
      <p className="text-lg font-bold">레시피를 만들기 시작했어요</p>
      <p className="text-sm text-muted">처리 중 화면은 준비 중이에요.</p>
      <Suspense fallback={null}>
        <JobId />
      </Suspense>
      <Link href="/" className="mt-4 text-sm text-link underline">
        링크 입력으로 돌아가기
      </Link>
    </main>
  );
}

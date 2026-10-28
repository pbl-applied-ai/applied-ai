// 임시 화면. 결과 확인·수정은 KAN-30에서 만든다.
import Link from "next/link";

export default function RunPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
      <p className="text-lg font-bold">레시피를 다 만들었어요</p>
      <p className="text-sm text-muted">결과 확인·수정 화면은 준비 중이에요.</p>
      <Link href="/" className="mt-4 text-sm text-link underline">
        링크 입력으로 돌아가기
      </Link>
    </main>
  );
}

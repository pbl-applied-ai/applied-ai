// 임시 화면. 저장한 레시피 상세(보기·수정·삭제)는 KAN-48에서 만든다.
import Link from "next/link";

export default function RecipePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
      <p className="text-lg font-bold">레시피북에 저장했어요</p>
      <p className="text-sm text-muted">레시피 상세 화면은 준비 중이에요.</p>
      <Link href="/" className="mt-4 text-sm text-link underline">
        다른 영상으로 만들기
      </Link>
    </main>
  );
}

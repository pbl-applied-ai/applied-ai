// 임시 화면. 로그인과 레시피북 목록·상세는 KAN-31(화면)·KAN-24(로그인)에서 만든다.
import Link from "next/link";

export default function BookPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
      <p className="text-lg font-bold">내 레시피북</p>
      <p className="text-sm text-muted">로그인과 레시피북은 준비 중이에요.</p>
      <Link href="/" className="mt-4 text-sm text-link underline">
        링크 입력으로 돌아가기
      </Link>
    </main>
  );
}

// S5 레시피 상세 (KAN-48). Figma 4-187 그대로.
import { Suspense } from "react";
import { DetailScreen } from "./detail-screen";

export default function RecipePage() {
  return (
    <Suspense fallback={<div className="flex-1" />}>
      <DetailScreen />
    </Suspense>
  );
}

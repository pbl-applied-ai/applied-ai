import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// 앱 코드와 같은 '@/...' 경로(tsconfig paths)를 테스트에서도 쓴다.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});

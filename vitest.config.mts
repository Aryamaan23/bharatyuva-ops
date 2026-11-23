import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/db/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    // DB tests share one database; run files sequentially.
    fileParallelism: false,
    coverage: { provider: "v8", include: ["src/lib/**", "src/server/domain/**", "src/server/messaging/delivery.ts"] },
  },
});

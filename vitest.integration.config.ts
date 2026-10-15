import "dotenv/config";
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    // Suites de bootstrap verificam totais globais; o banco descartável é compartilhado.
    fileParallelism: false,
    testTimeout: 15000,
    hookTimeout: 30000,
  },
});

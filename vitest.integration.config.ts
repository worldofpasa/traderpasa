import { defineConfig } from "vitest/config";

// Integration tests run against a real PostgreSQL database (see
// tests/integration/global-setup.ts). They are excluded from the default
// `pnpm test` run; use `pnpm test:integration` with the compose postgres up.
export default defineConfig({
  test: {
    include: ["tests/integration/**/*.test.ts"],
    globalSetup: ["tests/integration/global-setup.ts"],
    pool: "threads",
    poolOptions: { threads: { singleThread: true } },
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});

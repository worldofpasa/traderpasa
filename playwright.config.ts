import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  timeout: 30_000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100",
  },
  webServer: {
    command: "pnpm --filter @pasa-trader/web dev --hostname 127.0.0.1 --port 3100",
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? "postgres://pasatrader:pasatrader@127.0.0.1:55432/pasatrader",
      CREDENTIAL_ENCRYPTION_KEY:
        process.env.CREDENTIAL_ENCRYPTION_KEY ?? "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=" /* all-zeros test-only key */,
    },
    reuseExistingServer: false,
    url: "http://127.0.0.1:3100/health",
    timeout: 60_000,
  },
});

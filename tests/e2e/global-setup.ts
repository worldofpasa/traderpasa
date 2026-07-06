import { execSync } from "node:child_process";
import path from "node:path";

export default function globalSetup(): void {
  process.env.DATABASE_URL ??= "postgres://pasatrader:pasatrader@127.0.0.1:55432/pasatrader";
  process.env.CREDENTIAL_ENCRYPTION_KEY ??= "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=" /* all-zeros test-only key */;

  const scriptPath = path.join(__dirname, "seed-e2e-user.ts");
  execSync(`pnpm exec tsx "${scriptPath}"`, {
    stdio: "inherit",
    env: process.env,
    cwd: path.join(__dirname, "../.."),
  });
}

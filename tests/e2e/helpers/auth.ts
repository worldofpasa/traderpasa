import { expect, type Page } from "@playwright/test";

const DEFAULT_EMAIL = "e2e-admin@pasa.local";
const DEFAULT_PASSWORD = "e2e-test-password-12";

export function getE2eCredentials() {
  return {
    email: process.env.E2E_EMAIL ?? DEFAULT_EMAIL,
    password: process.env.E2E_PASSWORD ?? DEFAULT_PASSWORD,
  };
}

async function hasAuthenticatedSession(page: Page): Promise<boolean> {
  const meRes = await page.request.get("/api/auth/me");
  if (!meRes.ok()) {
    return false;
  }

  const body = (await meRes.json()) as { user?: { id: string } };
  return Boolean(body.user?.id);
}

export async function ensureAuthenticated(page: Page): Promise<void> {
  const { email, password } = getE2eCredentials();

  await page.goto("/");
  if (await hasAuthenticatedSession(page)) {
    return;
  }

  await page.goto("/sign-in");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes("/sign-in"), { timeout: 15_000 });

  expect(
    await hasAuthenticatedSession(page),
    `E2E sign-in failed for ${email}. global-setup should provision this user; override with E2E_EMAIL/E2E_PASSWORD if needed.`,
  ).toBeTruthy();
}

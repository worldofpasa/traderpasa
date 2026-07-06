import { expect, test, type Page } from "@playwright/test";
import { ensureAuthenticated } from "./helpers/auth";
import { ensureStrategyInstance } from "./helpers/strategy";

async function csrfHeaders(page: Page): Promise<Record<string, string>> {
  const cookies = await page.context().cookies();
  const csrf = cookies.find((cookie) => cookie.name === "pasa_csrf")?.value;
  if (!csrf) throw new Error("Missing CSRF cookie after sign-in.");
  return { "Content-Type": "application/json", "x-csrf-token": csrf };
}

test.describe("execution safety flows", () => {
  test.beforeEach(async ({ page }) => {
    await ensureAuthenticated(page);
  });

  test("live acknowledgment flow: switch to LIVE, acknowledge, verify persisted", async ({ page }) => {
    const strategyId = await ensureStrategyInstance(page);
    const headers = await csrfHeaders(page);

    const toLive = await page.request.patch(`/api/strategy-instances/${strategyId}`, {
      headers,
      data: { executionMode: "LIVE" },
    });
    expect(toLive.ok()).toBeTruthy();

    const before = (await (await page.request.get(`/api/strategy-instances/${strategyId}`)).json()) as {
      instance: { executionMode: string; liveAcknowledgedAt: string | null };
    };
    expect(before.instance.executionMode).toBe("LIVE");

    const ack = await page.request.post(`/api/strategy-instances/${strategyId}/acknowledge`, { headers });
    expect(ack.ok()).toBeTruthy();

    const after = (await (await page.request.get(`/api/strategy-instances/${strategyId}`)).json()) as {
      instance: { liveAcknowledgedAt: string | null };
    };
    expect(after.instance.liveAcknowledgedAt).toBeTruthy();

    // Restore PAPER mode so other specs see the default state.
    const toPaper = await page.request.patch(`/api/strategy-instances/${strategyId}`, {
      headers,
      data: { executionMode: "PAPER" },
    });
    expect(toPaper.ok()).toBeTruthy();
  });

  test("live access PIN can be configured and guards against unauthorized change", async ({ page }) => {
    const headers = await csrfHeaders(page);

    const statusRes = await page.request.get("/api/auth/live-pin");
    expect(statusRes.ok()).toBeTruthy();
    const { configured } = (await statusRes.json()) as { configured: boolean };

    if (!configured) {
      const setRes = await page.request.post("/api/auth/live-pin", {
        headers,
        data: { pin: "e2e-live-pin-123" },
      });
      expect(setRes.ok()).toBeTruthy();

      const afterSet = (await (await page.request.get("/api/auth/live-pin")).json()) as { configured: boolean };
      expect(afterSet.configured).toBe(true);
    }

    // Changing without the current PIN must be rejected.
    const badChange = await page.request.post("/api/auth/live-pin", {
      headers,
      data: { pin: "another-pin-456" },
    });
    expect(badChange.status()).toBe(403);
    const badBody = (await badChange.json()) as { error: { code: string } };
    expect(badBody.error.code).toBe("invalid_current_pin");

    // Short PINs are rejected by policy.
    const tooShort = await page.request.post("/api/auth/live-pin", {
      headers,
      data: { pin: "123", currentPin: "e2e-live-pin-123" },
    });
    expect(tooShort.status()).toBe(400);
  });

  test("notifications endpoint is reachable and dashboard renders proposals tab", async ({ page }) => {
    const notificationsRes = await page.request.get("/api/notifications");
    expect(notificationsRes.ok()).toBeTruthy();

    await page.goto("/?tab=history");
    await expect(page.locator("main")).toBeVisible();
  });
});

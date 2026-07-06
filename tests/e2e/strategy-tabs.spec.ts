import { expect, test } from "@playwright/test";
import { ensureAuthenticated } from "./helpers/auth";
import { ensureStrategyInstance } from "./helpers/strategy";

test.describe("strategy pages", () => {
  test.beforeEach(async ({ page }) => {
    await ensureAuthenticated(page);
  });

  test("strategy detail defaults to agent graph tab", async ({ page }) => {
    const strategyId = await ensureStrategyInstance(page);

    await page.goto(`/strategies/${strategyId}`);
    await expect(page.getByTestId("strategy-panel-agents")).toBeVisible();
    await expect(page.getByTestId("strategy-tab-agents")).toHaveAttribute("aria-selected", "true");
  });

  test("strategy tabs update URL and visible panel", async ({ page }) => {
    const strategyId = await ensureStrategyInstance(page);

    await page.goto(`/strategies/${strategyId}`);
    await page.getByTestId("strategy-tab-runs").click();

    await expect(page).toHaveURL(new RegExp(`/strategies/${strategyId}\\?tab=runs`));
    await expect(page.getByTestId("strategy-panel-runs")).toBeVisible();
    await expect(page.getByTestId("strategy-panel-agents")).toHaveCount(0);

    await page.getByTestId("strategy-tab-settings").click();
    await expect(page).toHaveURL(new RegExp(`/strategies/${strategyId}\\?tab=settings`));
    await expect(page.getByTestId("strategy-panel-settings")).toBeVisible();
  });

  test("direct tab query opens the requested panel", async ({ page }) => {
    const strategyId = await ensureStrategyInstance(page);

    await page.goto(`/strategies/${strategyId}?tab=overview`);
    await expect(page.getByTestId("strategy-panel-overview")).toBeVisible();
    await expect(page.getByTestId("strategy-tab-overview")).toHaveAttribute("aria-selected", "true");
  });

  test("run links from strategy context open inline accordion with URL", async ({ page }) => {
    const strategyId = await ensureStrategyInstance(page);

    await page.goto(`/strategies/${strategyId}?tab=runs`);
    const firstRunToggle = page.locator('[data-testid^="strategy-run-toggle-"]').first();
    const hasRuns = await firstRunToggle.count();

    if (hasRuns === 0) {
      test.skip();
      return;
    }

    const runId = (await firstRunToggle.getAttribute("data-testid"))?.replace("strategy-run-toggle-", "");
    expect(runId).toBeTruthy();

    await firstRunToggle.click();
    await expect(page).toHaveURL(new RegExp(`/strategies/${strategyId}\\?tab=runs&run=${runId}`));
    await expect(page.getByTestId(`strategy-run-detail-${runId}`)).toBeVisible();
    await expect(page.getByTestId("run-detail-view")).toBeVisible();

    await firstRunToggle.click();
    await expect(page).toHaveURL(`/strategies/${strategyId}?tab=runs`);
  });

  test("legacy run URL with strategyId redirects to inline strategy view", async ({ page }) => {
    const strategyId = await ensureStrategyInstance(page);
    const fakeRunId = "00000000-0000-0000-0000-000000000099";

    await page.goto(`/runs/${fakeRunId}?strategyId=${strategyId}`);
    await expect(page).toHaveURL(new RegExp(`/strategies/${strategyId}\\?tab=runs&run=${fakeRunId}`));
  });

  test("dashboard overview quick links open strategy tabs", async ({ page }) => {
    const strategyId = await ensureStrategyInstance(page);

    await page.goto("/");
    const quickLinks = page.getByTestId("overview-strategy-quick-links");
    await expect(quickLinks).toBeVisible();

    await quickLinks.locator(`a[href="/strategies/${strategyId}?tab=runs"]`).click();
    await expect(page).toHaveURL(new RegExp(`/strategies/${strategyId}\\?tab=runs`));
    await expect(page.getByTestId("strategy-panel-runs")).toBeVisible();
  });
});

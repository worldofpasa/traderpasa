import { expect, test } from "@playwright/test";

test("health page renders", async ({ request }) => {
  const response = await request.get("/health");
  const body = await response.text();

  expect(response.status()).toBe(200);
  expect(body).toContain("Pasa Trader Platform is healthy");
});

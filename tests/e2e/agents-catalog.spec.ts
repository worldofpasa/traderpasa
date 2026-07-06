import { expect, test } from "@playwright/test";

test("agent templates API requires authentication", async ({ request }) => {
  const response = await request.get("/api/agent-templates");
  expect(response.status()).toBe(401);

  const body = await response.json() as { error?: { code?: string } };
  expect(body.error?.code).toBe("unauthorized");
});

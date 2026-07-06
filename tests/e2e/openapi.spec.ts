import { expect, test } from "@playwright/test";

test("openapi contract endpoint exposes generated paths", async ({ request }) => {
  const response = await request.get("/api/openapi.json");

  expect(response.ok()).toBe(true);

  const document = (await response.json()) as {
    openapi: string;
    paths: Record<string, unknown>;
    components?: {
      schemas?: Record<string, unknown>;
    };
  };

  expect(document.openapi).toBe("3.1.0");
  expect(document.paths["/api/health"]).toBeDefined();
  expect(document.paths["/api/auth/me"]).toBeDefined();
  expect(document.paths["/api/auth/sign-in"]).toBeDefined();
  expect(document.paths["/api/auth/logout"]).toBeDefined();
  expect(document.paths["/api/credentials"]).toBeDefined();
  expect(document.paths["/api/setup/status"]).toBeDefined();
  expect(document.paths["/api/setup/first-admin"]).toBeDefined();
  expect(document.paths["/api/openapi.json"]).toBeDefined();
  expect(document.components?.schemas?.EvidenceItem).toBeDefined();
});

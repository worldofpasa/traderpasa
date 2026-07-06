import { describe, expect, it } from "vitest";
import { createOpenApiDocument, sourceReliabilityClassSchema } from "./index.js";

const reliabilityClasses = [
  "official_api",
  "official_scrape",
  "third_party_api",
  "best_effort_scrape",
] as const;

describe("SourceReliabilityClass", () => {
  it("documents the MVP source reliability classes", () => {
    expect(sourceReliabilityClassSchema.options).toEqual(reliabilityClasses);
  });
});

describe("createOpenApiDocument", () => {
  it("generates the initial API contract from Zod schemas", () => {
    const document = createOpenApiDocument();

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
    expect(document.components?.schemas?.CreateCredentialRequest).toBeDefined();
    expect(document.components?.schemas?.ProposedOrder).toBeDefined();
  });
});

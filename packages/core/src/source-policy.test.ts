import { describe, it, expect } from "vitest";
import { buildSourcePolicyContext } from "./source-policy.js";

const NOW = new Date("2026-06-10T12:00:00Z");

function item(overrides: Partial<Parameters<typeof buildSourcePolicyContext>[0]["evidenceItems"][number]> = {}) {
  return {
    sourceId: "alpaca-market",
    sourceName: "Alpaca Market Data",
    reliabilityClass: "official_api",
    observedAt: new Date("2026-06-10T11:00:00Z"),
    staleAt: new Date("2026-06-10T23:00:00Z"),
    warnings: [],
    ...overrides,
  };
}

describe("buildSourcePolicyContext", () => {
  it("reports fresh required sources with reliability metadata and no warnings", () => {
    const ctx = buildSourcePolicyContext({
      sourceConfig: { "alpaca-market": { enabled: true, required: true } },
      sourceResults: { "alpaca-market": "succeeded" },
      evidenceItems: [item()],
      now: NOW,
    });

    expect(ctx.requiredEvidenceMissing).toBe(false);
    expect(ctx.warnings).toHaveLength(0);
    expect(ctx.entries).toHaveLength(1);
    expect(ctx.entries[0]).toMatchObject({
      sourceId: "alpaca-market",
      required: true,
      status: "succeeded",
      reliabilityClass: "official_api",
      ttlStatus: "fresh",
    });
    expect(ctx.block).toContain("alpaca-market [REQUIRED]");
    expect(ctx.block).toContain("reliability=official_api");
  });

  it("flags required sources that failed", () => {
    const ctx = buildSourcePolicyContext({
      sourceConfig: { "sec-edgar": { enabled: true, required: true } },
      sourceResults: { "sec-edgar": "failed" },
      evidenceItems: [],
      now: NOW,
    });

    expect(ctx.requiredEvidenceMissing).toBe(true);
    expect(ctx.warnings[0]).toContain('Required source "sec-edgar" is not usable');
  });

  it("flags required sources whose evidence is past staleness threshold", () => {
    const ctx = buildSourcePolicyContext({
      sourceConfig: { "alpaca-market": { enabled: true, required: true } },
      sourceResults: { "alpaca-market": "succeeded" },
      evidenceItems: [item({ staleAt: new Date("2026-06-10T11:30:00Z") })], // stale before NOW
      now: NOW,
    });

    expect(ctx.entries[0]?.ttlStatus).toBe("stale");
    expect(ctx.requiredEvidenceMissing).toBe(true);
  });

  it("treats optional failed sources as warnings, not blocks", () => {
    const ctx = buildSourcePolicyContext({
      sourceConfig: {
        "alpaca-market": { enabled: true, required: true },
        "politician-trades": { enabled: true, required: false },
      },
      sourceResults: { "alpaca-market": "succeeded", "politician-trades": "skipped" },
      evidenceItems: [item()],
      now: NOW,
    });

    expect(ctx.requiredEvidenceMissing).toBe(false);
    expect(ctx.warnings).toHaveLength(1);
    expect(ctx.warnings[0]).toContain('Optional source "politician-trades"');
  });

  it("ignores disabled sources and reports unknown TTL when staleAt is absent", () => {
    const ctx = buildSourcePolicyContext({
      sourceConfig: {
        "sec-13f": { enabled: false, required: true },
        "sec-form4": { enabled: true, required: false },
      },
      sourceResults: { "sec-form4": "succeeded" },
      evidenceItems: [item({ sourceId: "sec-form4", staleAt: null })],
      now: NOW,
    });

    expect(ctx.entries).toHaveLength(1);
    expect(ctx.entries[0]?.sourceId).toBe("sec-form4");
    expect(ctx.entries[0]?.ttlStatus).toBe("unknown");
    expect(ctx.requiredEvidenceMissing).toBe(false);
  });

  it("uses the newest evidence item for timestamps and surfaces item warnings", () => {
    const ctx = buildSourcePolicyContext({
      sourceConfig: { "alpaca-market": { enabled: true, required: true } },
      sourceResults: { "alpaca-market": "succeeded" },
      evidenceItems: [
        item({ observedAt: new Date("2026-06-09T10:00:00Z"), warnings: ["older item warning"] }),
        item({ observedAt: new Date("2026-06-10T11:00:00Z") }),
      ],
      now: NOW,
    });

    expect(ctx.entries[0]?.observedAt).toBe("2026-06-10T11:00:00.000Z");
    expect(ctx.entries[0]?.warnings).toContain("older item warning");
  });

  it("renders an explicit empty-policy block", () => {
    const ctx = buildSourcePolicyContext({
      sourceConfig: {},
      sourceResults: {},
      evidenceItems: [],
      now: NOW,
    });
    expect(ctx.block).toContain("No source connectors are configured");
  });
});

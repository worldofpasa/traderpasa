import { describe, expect, it, vi } from "vitest";
import { BUILTIN_AGENT_TEMPLATE_SEEDS } from "@pasa-trader/agents";
import { seedBuiltinAgentTemplates } from "@pasa-trader/db";
import type { PrismaClient } from "@pasa-trader/db";

describe("seedBuiltinAgentTemplates", () => {
  it("creates missing built-in templates and skips existing slugs", async () => {
    const existingSlug = BUILTIN_AGENT_TEMPLATE_SEEDS[0]!.slug;
    const created: string[] = [];

    const db = {
      agentTemplate: {
        findFirst: vi.fn(async ({ where }: { where: { slug: string } }) =>
          where.slug === existingSlug ? { id: "existing" } : null,
        ),
        create: vi.fn(async ({ data }: { data: { slug: string } }) => {
          created.push(data.slug);
          return { id: `new-${data.slug}` };
        }),
      },
    } as unknown as PrismaClient;

    const result = await seedBuiltinAgentTemplates(db);

    expect(result.created).toBe(BUILTIN_AGENT_TEMPLATE_SEEDS.length - 1);
    expect(result.skipped).toBe(1);
    expect(created).not.toContain(existingSlug);
    expect(created).toHaveLength(BUILTIN_AGENT_TEMPLATE_SEEDS.length - 1);
  });
});

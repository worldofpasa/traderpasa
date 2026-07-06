import { BUILTIN_AGENT_TEMPLATE_SEEDS } from "@pasa-trader/agents";
import type { PrismaClient } from "@prisma/client";

export interface BuiltinAgentSeedResult {
  created: number;
  skipped: number;
}

/** Idempotently insert platform built-in agent templates (userId null, isBuiltin true). */
export async function seedBuiltinAgentTemplates(
  db: PrismaClient,
): Promise<BuiltinAgentSeedResult> {
  let created = 0;
  let skipped = 0;

  for (const seed of BUILTIN_AGENT_TEMPLATE_SEEDS) {
    const existing = await db.agentTemplate.findFirst({
      where: { slug: seed.slug, userId: null, isBuiltin: true },
    });
    if (existing) {
      skipped += 1;
      continue;
    }

    await db.agentTemplate.create({
      data: {
        slug: seed.slug,
        name: seed.name,
        category: seed.category,
        role: seed.role,
        specialization: seed.specialization,
        description: seed.description,
        systemPrompt: seed.systemPrompt,
        userPromptTemplate: seed.userPromptTemplate,
        outputType: seed.outputType,
        variables: seed.variables,
        toolRefs: seed.toolRefs,
        defaultDebateSide: seed.defaultDebateSide ?? null,
        isBuiltin: true,
        userId: null,
      },
    });
    created += 1;
  }

  return { created, skipped };
}

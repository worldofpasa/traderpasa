import { getPrismaClient, seedBuiltinAgentTemplates, type AgentTemplate, type PrismaClient } from "@pasa-trader/db";
import {
  agentTemplateSchema,
  createAgentTemplateRequestSchema,
  updateAgentTemplateRequestSchema,
  type AgentCategory,
  type AgentTemplate as AgentTemplateDto,
  type CreateAgentTemplateRequest,
  type UpdateAgentTemplateRequest,
} from "@pasa-trader/schemas";

export type { AgentTemplate };

function toDto(row: AgentTemplate): AgentTemplateDto {
  return agentTemplateSchema.parse({
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category,
    role: row.role,
    specialization: row.specialization,
    description: row.description,
    systemPrompt: row.systemPrompt,
    userPromptTemplate: row.userPromptTemplate,
    outputType: row.outputType,
    variables: row.variables,
    toolRefs: row.toolRefs,
    defaultDebateSide: row.defaultDebateSide ?? undefined,
    isBuiltin: row.isBuiltin,
    userId: row.userId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

export { seedBuiltinAgentTemplates } from "@pasa-trader/db";

export async function listAgentTemplates(
  userId: string,
  category?: AgentCategory,
  db: PrismaClient = getPrismaClient(),
): Promise<{ templates: AgentTemplateDto[]; grouped: Record<AgentCategory, AgentTemplateDto[]> }> {
  await seedBuiltinAgentTemplates(db);

  const rows = await db.agentTemplate.findMany({
    where: {
      OR: [{ isBuiltin: true, userId: null }, { userId }],
      ...(category ? { category } : {}),
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  const templates = rows.map(toDto);
  const grouped = {
    ANALYST: templates.filter((t) => t.category === "ANALYST"),
    RESEARCHER: templates.filter((t) => t.category === "RESEARCHER"),
    MANAGER: templates.filter((t) => t.category === "MANAGER"),
    TRADER: templates.filter((t) => t.category === "TRADER"),
    RISK_DEBATOR: templates.filter((t) => t.category === "RISK_DEBATOR"),
  };

  return { templates, grouped };
}

export async function getAgentTemplate(
  id: string,
  userId: string,
  db: PrismaClient = getPrismaClient(),
): Promise<AgentTemplateDto | null> {
  const row = await db.agentTemplate.findFirst({
    where: {
      id,
      OR: [{ isBuiltin: true, userId: null }, { userId }],
    },
  });
  return row ? toDto(row) : null;
}

export async function createAgentTemplate(
  userId: string,
  input: CreateAgentTemplateRequest,
  db: PrismaClient = getPrismaClient(),
): Promise<AgentTemplateDto> {
  const data = createAgentTemplateRequestSchema.parse(input);

  const conflict = await db.agentTemplate.findFirst({
    where: { slug: data.slug, userId },
  });
  if (conflict) {
    throw new Error(`Agent template slug already exists: ${data.slug}`);
  }

  const row = await db.agentTemplate.create({
    data: {
      ...data,
      isBuiltin: false,
      userId,
      defaultDebateSide: data.defaultDebateSide ?? null,
    },
  });
  return toDto(row);
}

export async function updateAgentTemplate(
  id: string,
  userId: string,
  input: UpdateAgentTemplateRequest,
  db: PrismaClient = getPrismaClient(),
): Promise<AgentTemplateDto> {
  const existing = await db.agentTemplate.findFirst({
    where: { id, userId, isBuiltin: false },
  });
  if (!existing) {
    throw new Error("Agent template not found or cannot be modified.");
  }

  const data = updateAgentTemplateRequestSchema.parse(input);
  if (data.slug && data.slug !== existing.slug) {
    const conflict = await db.agentTemplate.findFirst({
      where: { slug: data.slug, userId },
    });
    if (conflict) throw new Error(`Agent template slug already exists: ${data.slug}`);
  }

  const updateData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    updateData[key] = key === "defaultDebateSide" ? (value ?? null) : value;
  }

  const row = await db.agentTemplate.update({
    where: { id },
    data: updateData,
  });
  return toDto(row);
}

export async function deleteAgentTemplate(
  id: string,
  userId: string,
  db: PrismaClient = getPrismaClient(),
): Promise<void> {
  const existing = await db.agentTemplate.findFirst({
    where: { id, userId, isBuiltin: false },
  });
  if (!existing) {
    throw new Error("Agent template not found or cannot be deleted.");
  }
  await db.agentTemplate.delete({ where: { id } });
}

export async function duplicateAgentTemplate(
  id: string,
  userId: string,
  db: PrismaClient = getPrismaClient(),
): Promise<AgentTemplateDto> {
  const source = await getAgentTemplate(id, userId, db);
  if (!source) throw new Error("Agent template not found.");

  const baseSlug = `${source.slug}-copy`;
  let slug = baseSlug;
  let n = 1;
  while (await db.agentTemplate.findFirst({ where: { slug, userId } })) {
    slug = `${baseSlug}-${n}`;
    n += 1;
  }

  return createAgentTemplate(userId, {
    slug,
    name: `${source.name} (Copy)`,
    category: source.category,
    role: source.role,
    specialization: source.specialization,
    description: source.description,
    systemPrompt: source.systemPrompt,
    userPromptTemplate: source.userPromptTemplate,
    outputType: source.outputType,
    variables: source.variables,
    toolRefs: source.toolRefs,
    defaultDebateSide: source.defaultDebateSide,
  }, db);
}

export function agentTemplateToDefinition(
  template: AgentTemplateDto,
  overrides: { id: string; order: number; handoffFrom?: string[] },
) {
  return {
    id: overrides.id,
    name: template.name,
    role: template.role,
    systemPrompt: template.systemPrompt,
    userPromptTemplate: template.userPromptTemplate,
    outputType: template.outputType,
    specialization: template.specialization,
    templateId: template.id,
    handoffFrom: overrides.handoffFrom ?? [],
    order: overrides.order,
    enabled: true,
  };
}

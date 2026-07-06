import { getPrismaClient, type PrismaClient, type StrategyTemplate } from "@pasa-trader/db";

export type { StrategyTemplate };

export async function listStrategyTemplates(
  db: PrismaClient = getPrismaClient(),
): Promise<StrategyTemplate[]> {
  return db.strategyTemplate.findMany({
    orderBy: { kind: "asc" },
  });
}

export async function getStrategyTemplateByKind(
  kind: string,
  db: PrismaClient = getPrismaClient(),
): Promise<StrategyTemplate | null> {
  return db.strategyTemplate.findUnique({
    where: { kind: kind as never },
  });
}

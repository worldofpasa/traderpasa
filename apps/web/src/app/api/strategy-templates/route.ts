import { listStrategyTemplates } from "@pasa-trader/core";
import { errorResponseSchema, listStrategyTemplatesResponseSchema } from "@pasa-trader/schemas";
import { getCurrentUser } from "../../current-user";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return Response.json(
      errorResponseSchema.parse({ error: { code: "unauthorized", message: "Authentication is required." } }),
      { status: 401 },
    );
  }

  const templates = await listStrategyTemplates();

  return Response.json(
    listStrategyTemplatesResponseSchema.parse({
      templates: templates.map((t) => ({
        ...t,
        defaultConfig: t.defaultConfig as Record<string, unknown>,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      })),
    }),
  );
}

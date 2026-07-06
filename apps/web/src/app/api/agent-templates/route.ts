import {
  createAgentTemplate,
  listAgentTemplates,
} from "@pasa-trader/core";
import {
  agentCategorySchema,
  createAgentTemplateRequestSchema,
  errorResponseSchema,
  listAgentTemplatesResponseSchema,
  ZodError,
} from "@pasa-trader/schemas";
import { getCurrentUser } from "../../current-user";
import { assertAuthenticatedMutation, SameOriginRequestError } from "../../request-security";

function errorResponse(code: string, message: string, status: number): Response {
  return Response.json(
    errorResponseSchema.parse({ error: { code, message } }),
    { status },
  );
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return errorResponse("unauthorized", "Authentication is required.", 401);
  }

  const url = new URL(request.url);
  const categoryParam = url.searchParams.get("category");
  const category = categoryParam ? agentCategorySchema.parse(categoryParam) : undefined;

  const result = await listAgentTemplates(user.id, category);
  return Response.json(listAgentTemplatesResponseSchema.parse(result));
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return errorResponse("unauthorized", "Authentication is required.", 401);
  }

  try {
    await assertAuthenticatedMutation(request);
    const body = createAgentTemplateRequestSchema.parse(await request.json());
    const template = await createAgentTemplate(user.id, body);
    return Response.json({ template }, { status: 201 });
  } catch (error) {
    if (error instanceof SameOriginRequestError) {
      return errorResponse("forbidden", error.message, 403);
    }
    if (error instanceof ZodError) {
      return errorResponse("validation_error", error.message, 400);
    }
    if (error instanceof Error) {
      return errorResponse("bad_request", error.message, 400);
    }
    throw error;
  }
}

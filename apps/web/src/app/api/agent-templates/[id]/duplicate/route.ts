import { duplicateAgentTemplate } from "@pasa-trader/core";
import { agentTemplateResponseSchema, errorResponseSchema } from "@pasa-trader/schemas";
import { getCurrentUser } from "../../../../current-user";
import { assertAuthenticatedMutation, SameOriginRequestError } from "../../../../request-security";

function errorResponse(code: string, message: string, status: number): Response {
  return Response.json(
    errorResponseSchema.parse({ error: { code, message } }),
    { status },
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return errorResponse("unauthorized", "Authentication is required.", 401);
  }

  try {
    await assertAuthenticatedMutation(request);
    const { id } = await params;
    const template = await duplicateAgentTemplate(id, user.id);
    return Response.json(agentTemplateResponseSchema.parse({ template }), { status: 201 });
  } catch (error) {
    if (error instanceof SameOriginRequestError) {
      return errorResponse("forbidden", error.message, 403);
    }
    if (error instanceof Error) {
      return errorResponse("bad_request", error.message, 400);
    }
    throw error;
  }
}

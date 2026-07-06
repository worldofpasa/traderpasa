import {
  deleteAgentTemplate,
  getAgentTemplate,
  updateAgentTemplate,
} from "@pasa-trader/core";
import {
  agentTemplateResponseSchema,
  errorResponseSchema,
  updateAgentTemplateRequestSchema,
  ZodError,
} from "@pasa-trader/schemas";
import { getCurrentUser } from "../../../current-user";
import { assertAuthenticatedMutation, SameOriginRequestError } from "../../../request-security";

function errorResponse(code: string, message: string, status: number): Response {
  return Response.json(
    errorResponseSchema.parse({ error: { code, message } }),
    { status },
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return errorResponse("unauthorized", "Authentication is required.", 401);
  }

  const { id } = await params;
  const template = await getAgentTemplate(id, user.id);
  if (!template) {
    return errorResponse("not_found", "Agent template not found.", 404);
  }

  return Response.json(agentTemplateResponseSchema.parse({ template }));
}

export async function PATCH(
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
    const body = updateAgentTemplateRequestSchema.parse(await request.json());
    const template = await updateAgentTemplate(id, user.id, body);
    return Response.json(agentTemplateResponseSchema.parse({ template }));
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

export async function DELETE(
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
    await deleteAgentTemplate(id, user.id);
    return Response.json({ ok: true });
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

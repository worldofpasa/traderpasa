import {
  getStrategyInstanceForUser,
  updateStrategyInstance,
  StrategyInstanceNotFoundError,
  CsrfValidationError,
} from "@pasa-trader/core";
import {
  errorResponseSchema,
  updateStrategyInstanceRequestSchema,
  updateStrategyInstanceResponseSchema,
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

function toInstanceSummary(instance: Awaited<ReturnType<typeof getStrategyInstanceForUser>>) {
  return {
    ...instance,
    sourceConfig: instance.sourceConfig as Record<string, unknown>,
    riskConfig: instance.riskConfig as Record<string, unknown>,
    marketSessionRules: instance.marketSessionRules as Record<string, unknown>,
    scheduleConfig: instance.scheduleConfig as Record<string, unknown> | null,
    trailingStopConfig: instance.trailingStopConfig as Record<string, unknown> | null,
    stepModelConfig: instance.stepModelConfig as Record<string, unknown>,
    agentTeamConfig: instance.agentTeamConfig as Record<string, unknown>,
    liveAcknowledgedAt: instance.liveAcknowledgedAt?.toISOString() ?? null,
    createdAt: instance.createdAt.toISOString(),
    updatedAt: instance.updatedAt.toISOString(),
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();

  if (!user) {
    return errorResponse("unauthorized", "Authentication is required.", 401);
  }

  try {
    const { id } = await params;
    const instance = await getStrategyInstanceForUser(id, user.id);
    return Response.json({ instance: toInstanceSummary(instance) });
  } catch (error) {
    if (error instanceof StrategyInstanceNotFoundError) {
      return errorResponse("not_found", error.message, 404);
    }
    throw error;
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await assertAuthenticatedMutation(request);

    const user = await getCurrentUser();

    if (!user) {
      return errorResponse("unauthorized", "Authentication is required.", 401);
    }

    const { id } = await params;
    const body: unknown = await request.json();
    const input = updateStrategyInstanceRequestSchema.parse(body);
    const instance = await updateStrategyInstance(id, user.id, input);

    return Response.json(
      updateStrategyInstanceResponseSchema.parse({ instance: toInstanceSummary(instance) }),
    );
  } catch (error) {
    if (error instanceof SameOriginRequestError) {
      return errorResponse("invalid_request_origin", error.message, 403);
    }

    if (error instanceof CsrfValidationError) {
      return errorResponse("invalid_csrf_token", "A valid CSRF token is required.", 403);
    }

    if (error instanceof StrategyInstanceNotFoundError) {
      return errorResponse("not_found", error.message, 404);
    }

    if (error instanceof ZodError) {
      return Response.json(
        errorResponseSchema.parse({
          error: {
            code: "invalid_config",
            message: "Strategy config is invalid.",
          },
        }),
        { status: 400 },
      );
    }

    throw error;
  }
}

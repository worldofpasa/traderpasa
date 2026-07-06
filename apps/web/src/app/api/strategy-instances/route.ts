import {
  forkStrategyTemplate,
  listStrategyInstancesForUser,
  StrategyTemplateNotFoundError,
  CsrfValidationError,
} from "@pasa-trader/core";
import {
  errorResponseSchema,
  forkStrategyTemplateRequestSchema,
  forkStrategyTemplateResponseSchema,
  listStrategyInstancesResponseSchema,
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

function toInstanceSummary(instance: Awaited<ReturnType<typeof forkStrategyTemplate>>) {
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

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return errorResponse("unauthorized", "Authentication is required.", 401);
  }

  const instances = await listStrategyInstancesForUser(user.id);

  return Response.json(
    listStrategyInstancesResponseSchema.parse({
      instances: instances.map(toInstanceSummary),
    }),
  );
}

export async function POST(request: Request) {
  try {
    await assertAuthenticatedMutation(request);

    const user = await getCurrentUser();

    if (!user) {
      return errorResponse("unauthorized", "Authentication is required.", 401);
    }

    const body: unknown = await request.json();
    const input = forkStrategyTemplateRequestSchema.parse(body);

    const instance = await forkStrategyTemplate({
      userId: user.id,
      templateId: input.templateId,
      ...(input.name !== undefined && { name: input.name }),
    });

    return Response.json(
      forkStrategyTemplateResponseSchema.parse({ instance: toInstanceSummary(instance) }),
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof SameOriginRequestError) {
      return errorResponse("invalid_request_origin", error.message, 403);
    }

    if (error instanceof CsrfValidationError) {
      return errorResponse("invalid_csrf_token", "A valid CSRF token is required.", 403);
    }

    if (error instanceof StrategyTemplateNotFoundError) {
      return errorResponse("template_not_found", error.message, 404);
    }

    if (error instanceof ZodError) {
      return errorResponse("invalid_request", "templateId is required.", 400);
    }

    throw error;
  }
}

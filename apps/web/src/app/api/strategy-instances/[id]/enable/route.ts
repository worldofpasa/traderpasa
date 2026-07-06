import {
  enableStrategyInstance,
  StrategyInstanceNotFoundError,
  StrategyInstanceDeletedError,
  CsrfValidationError,
} from "@pasa-trader/core";
import { errorResponseSchema, strategyInstanceSummarySchema } from "@pasa-trader/schemas";
import { getCurrentUser } from "../../../../current-user";
import { assertAuthenticatedMutation, SameOriginRequestError } from "../../../../request-security";

function errorResponse(code: string, message: string, status: number): Response {
  return Response.json(errorResponseSchema.parse({ error: { code, message } }), { status });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await assertAuthenticatedMutation(request);
    const user = await getCurrentUser();
    if (!user) return errorResponse("unauthorized", "Authentication is required.", 401);

    const { id } = await params;
    const instance = await enableStrategyInstance(id, user.id);

    return Response.json({
      instance: strategyInstanceSummarySchema.parse({
        ...instance,
        sourceConfig: instance.sourceConfig as Record<string, unknown>,
        riskConfig: instance.riskConfig as Record<string, unknown>,
        marketSessionRules: instance.marketSessionRules as Record<string, unknown>,
        scheduleConfig: instance.scheduleConfig as Record<string, unknown> | null,
        trailingStopConfig: instance.trailingStopConfig as Record<string, unknown> | null,
        liveAcknowledgedAt: instance.liveAcknowledgedAt?.toISOString() ?? null,
        createdAt: instance.createdAt.toISOString(),
        updatedAt: instance.updatedAt.toISOString(),
      }),
    });
  } catch (error) {
    if (error instanceof SameOriginRequestError) return errorResponse("invalid_request_origin", error.message, 403);
    if (error instanceof CsrfValidationError) return errorResponse("invalid_csrf_token", error.message, 403);
    if (error instanceof StrategyInstanceNotFoundError) return errorResponse("not_found", error.message, 404);
    if (error instanceof StrategyInstanceDeletedError) return errorResponse("gone", error.message, 410);
    throw error;
  }
}

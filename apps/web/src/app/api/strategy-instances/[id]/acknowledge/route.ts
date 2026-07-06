import { CsrfValidationError } from "@pasa-trader/core";
import { getPrismaClient } from "@pasa-trader/db";
import { errorResponseSchema } from "@pasa-trader/schemas";
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
  try {
    await assertAuthenticatedMutation(request);

    const user = await getCurrentUser();

    if (!user) {
      return errorResponse("unauthorized", "Authentication is required.", 401);
    }

    const { id } = await params;
    const db = getPrismaClient();

    // Verify strategy belongs to user
    const strategy = await db.strategyInstance.findUnique({
      where: { id },
    });

    if (!strategy || strategy.userId !== user.id) {
      return errorResponse("not_found", "Strategy instance not found.", 404);
    }

    // Acknowledge live trading
    await db.$transaction(async (tx) => {
      await tx.strategyInstance.update({
        where: { id },
        data: { liveAcknowledgedAt: new Date() },
      });

      await tx.auditLog.create({
        data: {
          actorType: "USER",
          actorId: user.id,
          action: "strategy.live_acknowledged",
          target: `strategy_instance:${id}`,
          metadata: { version: "v1" },
        },
      });
    });

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof SameOriginRequestError) {
      return errorResponse("invalid_request_origin", error.message, 403);
    }

    if (error instanceof CsrfValidationError) {
      return errorResponse("invalid_csrf_token", "A valid CSRF token is required.", 403);
    }

    return errorResponse(
      "acknowledgment_error",
      error instanceof Error ? error.message : "An error occurred during acknowledgment.",
      400,
    );
  }
}

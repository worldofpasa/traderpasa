import { CsrfValidationError, userHasLiveAccessPin, verifyLiveAccessPin } from "@pasa-trader/core";
import { getPrismaClient } from "@pasa-trader/db";
import { errorResponseSchema } from "@pasa-trader/schemas";
import { getCurrentUser } from "../../../../current-user";
import { assertAuthenticatedMutation, SameOriginRequestError } from "../../../../request-security";
import { enqueueJob } from "../../../../enqueue-job";

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

    const packet = await db.proposedOrderPacket.findUnique({
      where: { id },
      include: { strategyInstance: true },
    });

    if (!packet || packet.strategyInstance.userId !== user.id) {
      return errorResponse("not_found", "Proposed order packet not found.", 404);
    }

    if (packet.status !== "DRAFT") {
      return errorResponse("invalid_state", `Packet is in status ${packet.status} and cannot be executed.`, 409);
    }

    // LIVE execution requires the secondary Live Access PIN (#94).
    // This is enforced server-side; UI prompts are advisory only.
    if (packet.strategyInstance.executionMode === "LIVE") {
      if (!(await userHasLiveAccessPin(user.id))) {
        return errorResponse(
          "live_pin_not_configured",
          "A Live Access PIN must be configured in Settings before executing LIVE orders.",
          403,
        );
      }
      const body = (await request.json().catch(() => ({}))) as { livePin?: string };
      if (typeof body.livePin !== "string" || !(await verifyLiveAccessPin(user.id, body.livePin))) {
        return errorResponse("invalid_live_pin", "Live Access PIN verification failed.", 403);
      }
    }

    const jobId = await enqueueJob("packet.execute", { packetId: id });

    return Response.json({ ok: true, jobId });
  } catch (error) {
    if (error instanceof SameOriginRequestError) {
      return errorResponse("invalid_request_origin", error.message, 403);
    }

    if (error instanceof CsrfValidationError) {
      return errorResponse("invalid_csrf_token", "A valid CSRF token is required.", 403);
    }

    return errorResponse(
      "execution_error",
      error instanceof Error ? error.message : "An error occurred during execution.",
      400,
    );
  }
}

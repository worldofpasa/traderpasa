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

    const packet = await db.proposedOrderPacket.findUnique({
      where: { id },
      include: { strategyInstance: true },
    });

    if (!packet || packet.strategyInstance.userId !== user.id) {
      return errorResponse("not_found", "Proposed order packet not found.", 404);
    }

    if (packet.status !== "DRAFT" && packet.status !== "PENDING_REVIEW") {
      return errorResponse("invalid_state", `Packet is in status ${packet.status} and cannot be rejected.`, 409);
    }

    await db.proposedOrderPacket.update({
      where: { id },
      data: { status: "REJECTED" },
    });

    await db.auditLog.create({
      data: {
        actorType: "USER",
        action: "packet.rejected",
        target: `proposed_order_packet:${id}`,
        metadata: { userId: user.id, strategyInstanceId: packet.strategyInstanceId },
      },
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
      "reject_error",
      error instanceof Error ? error.message : "An error occurred while rejecting the packet.",
      400,
    );
  }
}

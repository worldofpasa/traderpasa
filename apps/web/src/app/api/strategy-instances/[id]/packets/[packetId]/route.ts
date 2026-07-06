import { getPrismaClient } from "@pasa-trader/db";
import { errorResponseSchema } from "@pasa-trader/schemas";
import { getCurrentUser } from "../../../../../current-user";

function errorResponse(code: string, message: string, status: number): Response {
  return Response.json(
    errorResponseSchema.parse({ error: { code, message } }),
    { status },
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; packetId: string }> },
) {
  const user = await getCurrentUser();

  if (!user) {
    return errorResponse("unauthorized", "Authentication is required.", 401);
  }

  const { id, packetId } = await params;
  const db = getPrismaClient();
  const packet = await db.proposedOrderPacket.findFirst({
    where: {
      id: packetId,
      strategyInstanceId: id,
      strategyInstance: { userId: user.id },
    },
    include: {
      proposedOrders: true,
      strategyInstance: true,
      evidenceBundle: { include: { evidenceItems: true } },
    },
  });

  if (!packet) {
    return errorResponse("not_found", "Proposed order packet not found.", 404);
  }

  return Response.json({ packet });
}

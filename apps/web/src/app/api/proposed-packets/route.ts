import { getPrismaClient } from "@pasa-trader/db";
import { errorResponseSchema } from "@pasa-trader/schemas";
import { getCurrentUser } from "../../current-user";

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
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 200);

  const db = getPrismaClient();
  const packets = await db.proposedOrderPacket.findMany({
    where: {
      strategyInstance: { userId: user.id },
    },
    include: {
      proposedOrders: true,
      strategyInstance: true,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return Response.json({ packets });
}

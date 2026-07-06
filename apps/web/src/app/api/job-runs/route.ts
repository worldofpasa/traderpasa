import { getPrismaClient } from "@pasa-trader/db";
import { getCurrentUser } from "../../current-user";

export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: { code: "unauthorized", message: "Authentication is required." } }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10), 100);
  const strategyId = url.searchParams.get("strategyId") ?? undefined;

  const db = getPrismaClient();

  const where = strategyId
    ? { strategyInstanceId: strategyId, strategyInstance: { userId: user.id } }
    : { strategyInstance: { userId: user.id } };

  const runs = await db.jobRun.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      jobType: true,
      status: true,
      errorCode: true,
      errorMessage: true,
      startedAt: true,
      finishedAt: true,
      durationMs: true,
      strategyInstanceId: true,
      createdAt: true,
      outputRefs: true,
      orderPackets: {
        select: { agentRunMetadata: true },
        take: 1,
        orderBy: { createdAt: "desc" },
      },
    },
  });

  const serialized = runs.map(({ orderPackets, ...run }) => ({
    ...run,
    agentRunMetadata: orderPackets[0]?.agentRunMetadata ?? null,
  }));

  return Response.json({ runs: serialized });
}

import { listAuditLogs } from "@pasa-trader/core";
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

  if (user.role !== "ADMIN") {
    return errorResponse("forbidden", "Admin access is required.", 403);
  }

  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? "50");
  const offset = Number(url.searchParams.get("offset") ?? "0");
  const action = url.searchParams.get("action") ?? undefined;

  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    return errorResponse("invalid_limit", "limit must be an integer between 1 and 200.", 400);
  }

  if (!Number.isInteger(offset) || offset < 0) {
    return errorResponse("invalid_offset", "offset must be a non-negative integer.", 400);
  }

  return Response.json(await listAuditLogs({ limit, offset, ...(action !== undefined && { action }) }));
}

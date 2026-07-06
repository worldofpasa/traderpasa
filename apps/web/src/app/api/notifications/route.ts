import { getPrismaClient } from "@pasa-trader/db";
import { errorResponseSchema } from "@pasa-trader/schemas";
import { getCurrentUser } from "../../current-user";
import { assertAuthenticatedMutation, SameOriginRequestError } from "../../request-security";
import { CsrfValidationError } from "@pasa-trader/core";

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
  const unreadOnly = url.searchParams.get("unreadOnly") === "true";

  const db = getPrismaClient();
  const notifications = await db.notification.findMany({
    where: {
      userId: user.id,
      ...(unreadOnly && { read: false }),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return Response.json({ notifications });
}

export async function POST(request: Request) {
  try {
    await assertAuthenticatedMutation(request);

    const user = await getCurrentUser();

    if (!user) {
      return errorResponse("unauthorized", "Authentication is required.", 401);
    }

    const body = await request.json().catch(() => ({}));
    const { notificationIds, markAll } = body;

    const db = getPrismaClient();

    if (markAll) {
      await db.notification.updateMany({
        where: { userId: user.id, read: false },
        data: { read: true, readAt: new Date() },
      });
    } else if (Array.isArray(notificationIds)) {
      await db.notification.updateMany({
        where: {
          userId: user.id,
          id: { in: notificationIds },
          read: false,
        },
        data: { read: true, readAt: new Date() },
      });
    }

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof SameOriginRequestError) {
      return errorResponse("invalid_request_origin", error.message, 403);
    }

    if (error instanceof CsrfValidationError) {
      return errorResponse("invalid_csrf_token", "A valid CSRF token is required.", 403);
    }

    throw error;
  }
}

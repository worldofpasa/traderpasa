import { CsrfValidationError, LivePinError, setLiveAccessPin, userHasLiveAccessPin } from "@pasa-trader/core";
import { errorResponseSchema } from "@pasa-trader/schemas";
import { getCurrentUser } from "../../../current-user";
import { assertAuthenticatedMutation, SameOriginRequestError } from "../../../request-security";

function errorResponse(code: string, message: string, status: number): Response {
  return Response.json(
    errorResponseSchema.parse({ error: { code, message } }),
    { status },
  );
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return errorResponse("unauthorized", "Authentication is required.", 401);
  }
  return Response.json({ configured: await userHasLiveAccessPin(user.id) });
}

export async function POST(request: Request) {
  try {
    await assertAuthenticatedMutation(request);

    const user = await getCurrentUser();
    if (!user) {
      return errorResponse("unauthorized", "Authentication is required.", 401);
    }

    const body = (await request.json()) as { pin?: string; currentPin?: string };
    if (typeof body.pin !== "string") {
      return errorResponse("invalid_payload", "A pin field is required.", 400);
    }

    await setLiveAccessPin(user.id, body.pin, body.currentPin);

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof SameOriginRequestError) {
      return errorResponse("invalid_request_origin", error.message, 403);
    }
    if (error instanceof CsrfValidationError) {
      return errorResponse("invalid_csrf_token", "A valid CSRF token is required.", 403);
    }
    if (error instanceof LivePinError) {
      const status = error.code === "invalid_current_pin" ? 403 : 400;
      return errorResponse(error.code, error.message, status);
    }
    return errorResponse(
      "live_pin_error",
      error instanceof Error ? error.message : "Failed to update the Live Access PIN.",
      400,
    );
  }
}

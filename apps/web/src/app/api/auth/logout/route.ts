import { CsrfValidationError, logoutSession } from "@pasa-trader/core";
import { errorResponseSchema } from "@pasa-trader/schemas";
import { clearAuthCookies, getSessionTokenFromCookies } from "../../../auth-cookies";
import { assertAuthenticatedMutation, SameOriginRequestError } from "../../../request-security";

function errorResponse(code: string, message: string, status: number): Response {
  return Response.json(
    errorResponseSchema.parse({
      error: {
        code,
        message,
      },
    }),
    {
      status,
    },
  );
}

export async function POST(request: Request) {
  try {
    await assertAuthenticatedMutation(request);

    const response = await logoutSession(await getSessionTokenFromCookies());

    await clearAuthCookies();

    return Response.json(response);
  } catch (error) {
    if (error instanceof SameOriginRequestError) {
      return errorResponse("invalid_request_origin", error.message, 403);
    }

    if (error instanceof CsrfValidationError) {
      return errorResponse("invalid_csrf_token", error.message, 403);
    }

    throw error;
  }
}

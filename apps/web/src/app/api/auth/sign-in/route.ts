import { InvalidCredentialsError, signInWithPassword } from "@pasa-trader/core";
import { errorResponseSchema, signInRequestSchema, ZodError } from "@pasa-trader/schemas";
import { setAuthCookies } from "../../../auth-cookies";
import { assertSameOriginRequest, SameOriginRequestError } from "../../../request-security";

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
    assertSameOriginRequest(request);

    const body: unknown = await request.json();
    const input = signInRequestSchema.parse(body);
    const { csrfToken, sessionToken, ...response } = await signInWithPassword(input);

    await setAuthCookies({
      csrfToken,
      expiresAt: response.expiresAt,
      sessionToken,
    });

    return Response.json(response);
  } catch (error) {
    if (error instanceof SameOriginRequestError) {
      return errorResponse("invalid_request_origin", error.message, 403);
    }

    if (error instanceof InvalidCredentialsError) {
      return errorResponse("invalid_credentials", error.message, 401);
    }

    if (error instanceof ZodError) {
      return errorResponse(
        "invalid_sign_in_request",
        "Valid email and password are required.",
        400,
      );
    }

    throw error;
  }
}

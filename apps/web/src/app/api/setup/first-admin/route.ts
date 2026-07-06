import { createFirstAdminAccount, FirstAdminAlreadyExistsError } from "@pasa-trader/core";
import { errorResponseSchema, setupFirstAdminRequestSchema, ZodError } from "@pasa-trader/schemas";
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
    const input = setupFirstAdminRequestSchema.parse(body);
    const response = await createFirstAdminAccount(input);

    return Response.json(response, {
      status: 201,
    });
  } catch (error) {
    if (error instanceof SameOriginRequestError) {
      return errorResponse("invalid_request_origin", error.message, 403);
    }

    if (error instanceof FirstAdminAlreadyExistsError) {
      return errorResponse("first_admin_exists", error.message, 409);
    }

    if (error instanceof ZodError) {
      return errorResponse(
        "invalid_setup_request",
        "Name, valid email, and 12+ character password are required.",
        400,
      );
    }

    throw error;
  }
}

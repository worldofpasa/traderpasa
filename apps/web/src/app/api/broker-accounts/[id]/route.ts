import { deleteBrokerAccount, BrokerAccountNotFoundError, CsrfValidationError } from "@pasa-trader/core";
import { errorResponseSchema } from "@pasa-trader/schemas";
import { getCurrentUser } from "../../../current-user";
import { assertAuthenticatedMutation, SameOriginRequestError } from "../../../request-security";

function errorResponse(code: string, message: string, status: number): Response {
  return Response.json(errorResponseSchema.parse({ error: { code, message } }), { status });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    await assertAuthenticatedMutation(request);

    const user = await getCurrentUser();
    if (!user) {
      return errorResponse("unauthorized", "Authentication is required.", 401);
    }

    const { id } = await params;
    await deleteBrokerAccount({ brokerAccountId: id, userId: user.id });

    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof SameOriginRequestError) {
      return errorResponse("invalid_request_origin", error.message, 403);
    }
    if (error instanceof CsrfValidationError) {
      return errorResponse("invalid_csrf_token", error.message, 403);
    }
    if (error instanceof BrokerAccountNotFoundError) {
      return errorResponse("not_found", error.message, 404);
    }
    throw error;
  }
}

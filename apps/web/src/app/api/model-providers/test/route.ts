import {
  testModelProviderConnection,
  ModelProviderCredentialNotFoundError,
  CsrfValidationError,
} from "@pasa-trader/core";
import {
  errorResponseSchema,
  testModelConnectionRequestSchema,
  testModelConnectionResponseSchema,
} from "@pasa-trader/schemas";
import { getCurrentUser } from "../../../current-user";
import { assertAuthenticatedMutation, SameOriginRequestError } from "../../../request-security";

function errorResponse(code: string, message: string, status: number): Response {
  return Response.json(errorResponseSchema.parse({ error: { code, message } }), { status });
}

export async function POST(request: Request) {
  try {
    await assertAuthenticatedMutation(request);
    const user = await getCurrentUser();
    if (!user) return errorResponse("unauthorized", "Authentication is required.", 401);

    const body: unknown = await request.json();
    const input = testModelConnectionRequestSchema.parse(body);

    const result = await testModelProviderConnection({
      credentialId: input.credentialId,
      provider: input.provider,
      userId: user.id,
    });

    return Response.json(
      testModelConnectionResponseSchema.parse({
        ok: result.ok,
        message: result.message,
        checkedAt: result.checkedAt.toISOString(),
      }),
    );
  } catch (error) {
    if (error instanceof SameOriginRequestError) return errorResponse("invalid_request_origin", error.message, 403);
    if (error instanceof CsrfValidationError) return errorResponse("invalid_csrf_token", error.message, 403);
    if (error instanceof ModelProviderCredentialNotFoundError) return errorResponse("credential_not_found", error.message, 404);
    throw error;
  }
}

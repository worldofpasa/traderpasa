import {
  createEncryptedCredential,
  CsrfValidationError,
  CredentialEncryptionKeyError,
  listCredentialsForUser,
} from "@pasa-trader/core";
import { createCredentialRequestSchema, errorResponseSchema, ZodError } from "@pasa-trader/schemas";
import { getCurrentUser } from "../../current-user";
import { assertAuthenticatedMutation, SameOriginRequestError } from "../../request-security";

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

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return errorResponse("unauthorized", "Authentication is required.", 401);
  }

  return Response.json(await listCredentialsForUser(user.id));
}

export async function POST(request: Request) {
  try {
    await assertAuthenticatedMutation(request);

    const user = await getCurrentUser();

    if (!user) {
      return errorResponse("unauthorized", "Authentication is required.", 401);
    }

    const body: unknown = await request.json();
    const input = createCredentialRequestSchema.parse(body);

    return Response.json(await createEncryptedCredential({ ...input, userId: user.id }), {
      status: 201,
    });
  } catch (error) {
    if (error instanceof SameOriginRequestError) {
      return errorResponse("invalid_request_origin", error.message, 403);
    }

    if (error instanceof CredentialEncryptionKeyError) {
      return errorResponse("credential_encryption_key_missing", error.message, 500);
    }

    if (error instanceof ZodError) {
      return errorResponse(
        "invalid_credential_request",
        "Kind, provider, label, and secret are required.",
        400,
      );
    }

    if (error instanceof CsrfValidationError) {
      return errorResponse("invalid_csrf_token", "A valid CSRF token is required.", 403);
    }

    throw error;
  }
}

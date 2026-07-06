import { deleteCredential } from "@pasa-trader/core";
import { getCurrentUser } from "../../../current-user";
import { assertAuthenticatedMutation, SameOriginRequestError } from "../../../request-security";

function errorResponse(code: string, message: string, status: number): Response {
  return Response.json({ error: { code, message } }, { status });
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
    await deleteCredential({ credentialId: id, userId: user.id });

    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof SameOriginRequestError) {
      return errorResponse("invalid_request_origin", error.message, 403);
    }
    if (error instanceof Error && error.message === "Credential not found.") {
      return errorResponse("not_found", "Credential not found.", 404);
    }
    throw error;
  }
}

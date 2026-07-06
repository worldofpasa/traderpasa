import { getPrismaClient } from "@pasa-trader/db";
import { getCurrentUser } from "../../../current-user";

/**
 * GET /api/setup/required-steps
 *
 * Returns { needsLLMSetup: boolean }
 *
 * needsLLMSetup is true when the signed-in user has no MODEL_PROVIDER
 * credentials saved, signalling the onboarding flow should show the
 * LLM provider selector.
 *
 * This endpoint is intentionally lightweight: it does not decrypt
 * credentials; it only checks for the presence of at least one record.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ needsLLMSetup: true });
  }

  const db = getPrismaClient();
  const count = await db.credential.count({
    where: {
      userId: user.id,
      kind: "MODEL_PROVIDER",
    },
  });

  return Response.json({ needsLLMSetup: count === 0 });
}

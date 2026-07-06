import { getPrismaClient } from "@pasa-trader/db";
import { CsrfValidationError, getResumePoint } from "@pasa-trader/core";
import { errorResponseSchema } from "@pasa-trader/schemas";
import { getCurrentUser } from "../../../../current-user";
import { assertAuthenticatedMutation, SameOriginRequestError } from "../../../../request-security";
import { enqueueJob } from "../../../../enqueue-job";

function err(code: string, message: string, status: number): Response {
  return Response.json(errorResponseSchema.parse({ error: { code, message } }), { status });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    await assertAuthenticatedMutation(request);
    const user = await getCurrentUser();
    if (!user) return err("unauthorized", "Authentication is required.", 401);

    const { id } = await params;
    const db = getPrismaClient();

    const run = await db.jobRun.findUnique({
      where: { id },
      include: {
        strategyInstance: { select: { id: true, userId: true } },
        agentSteps: { orderBy: [{ phase: "asc" }, { stepIndex: "asc" }] },
      },
    });

    if (!run || run.strategyInstance?.userId !== user.id) {
      return err("not_found", "Run not found.", 404);
    }

    if (!run.strategyInstanceId) {
      return err("invalid_state", "Run is not linked to a strategy.", 409);
    }

    const resumePoint = getResumePoint(run.agentSteps);
    const mode = resumePoint ? "resume" : "full_rerun";

    const jobId = await enqueueJob("strategy.run", {
      strategyId: run.strategyInstanceId,
      resumedFromJobRunId: mode === "resume" ? id : undefined,
    });

    return Response.json({ jobId, mode });
  } catch (error) {
    if (error instanceof SameOriginRequestError) {
      return err("invalid_request_origin", error.message, 403);
    }
    if (error instanceof CsrfValidationError) {
      return err("invalid_csrf_token", "A valid CSRF token is required.", 403);
    }
    return err(
      "retry_error",
      error instanceof Error ? error.message : "An error occurred while retrying the run.",
      400,
    );
  }
}

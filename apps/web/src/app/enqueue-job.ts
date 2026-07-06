import { makeWorkerUtils } from "graphile-worker";

export async function enqueueJob(
  taskIdentifier: string,
  payload: Record<string, unknown>,
): Promise<string> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to enqueue jobs.");
  }

  const utils = await makeWorkerUtils({ connectionString });
  try {
    const job = await utils.addJob(taskIdentifier, payload);
    return job.id;
  } finally {
    await utils.release();
  }
}

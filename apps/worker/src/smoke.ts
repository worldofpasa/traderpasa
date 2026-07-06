import { makeWorkerUtils, runOnce } from "graphile-worker";
import { noopTaskIdentifier, taskList } from "./tasks.js";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required to run the worker smoke check.");
}

const workerUtils = await makeWorkerUtils({ connectionString });

try {
  await workerUtils.migrate();
  await workerUtils.addJob(noopTaskIdentifier, { source: "worker-smoke" });
  await runOnce(
    {
      connectionString,
      noHandleSignals: true,
      taskList,
    },
    taskList,
  );
  process.stdout.write("Worker smoke check completed.\n");
} finally {
  await workerUtils.release();
}

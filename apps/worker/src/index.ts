import { run } from "graphile-worker";
import { taskList } from "./tasks.js";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required to start the worker.");
}

const runner = await run({
  connectionString,
  concurrency: 1,
  noHandleSignals: false,
  taskList,
  // Recovery pass for unprotected positions every 10 minutes (#97) and
  // fallback order status polling every 5 minutes (#90)
  crontab: ["*/10 * * * * position.protect ?max=1", "*/5 * * * * order.sync ?max=1"].join("\n"),
});

process.stdout.write("Pasa Trader worker started.\n");

await runner.promise;

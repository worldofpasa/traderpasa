import type { StrategyScheduleConfig } from "./strategy-types";

export function getStrategyCron(
  scheduleConfig: StrategyScheduleConfig | null,
  fallback = "Manual only",
): string {
  return typeof scheduleConfig?.cron === "string" ? scheduleConfig.cron : fallback;
}

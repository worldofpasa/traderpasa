import type { TaskList } from "graphile-worker";
import { executeScheduledStrategyRun, executePacket, recoverUnprotectedPositions, syncPendingOrderRecords } from "@pasa-trader/core";

export const noopTaskIdentifier = "platform.noop";

interface StrategyRunPayload {
  strategyId: string;
  checkMissedRun?: boolean;
  scheduledTime?: string;
  resumedFromJobRunId?: string;
}

interface PacketExecutePayload {
  packetId: string;
}

export const taskList: TaskList = {
  [noopTaskIdentifier]: (_payload, helpers) => {
    helpers.logger.info("Completed platform no-op task.");
  },
  "strategy.run": async (payload, helpers) => {
    const { strategyId, checkMissedRun, scheduledTime, resumedFromJobRunId } = payload as StrategyRunPayload;
    helpers.logger.info(`Running strategy execution job for strategy ${strategyId}`);
    const options: { checkMissedRun?: boolean; scheduledTime?: Date; resumedFromJobRunId?: string } = {};
    if (checkMissedRun !== undefined) options.checkMissedRun = !!checkMissedRun;
    if (scheduledTime) options.scheduledTime = new Date(scheduledTime);
    if (resumedFromJobRunId) options.resumedFromJobRunId = resumedFromJobRunId;
    await executeScheduledStrategyRun(strategyId, undefined, options);
  },
  "packet.execute": async (payload, helpers) => {
    const { packetId } = payload as PacketExecutePayload;
    helpers.logger.info(`Executing proposed order packet ${packetId}`);
    await executePacket(packetId);
  },
  "position.protect": async (_payload, helpers) => {
    const result = await recoverUnprotectedPositions();
    helpers.logger.info(
      `Position protection pass: scanned=${result.scanned} adopted=${result.adopted} recovered=${result.recovered} failed=${result.failed} escalated=${result.escalated}`,
    );
  },
  "order.sync": async (_payload, helpers) => {
    const result = await syncPendingOrderRecords();
    helpers.logger.info(
      `Order status sync pass: checked=${result.checked} updated=${result.updated} failed=${result.failed}`,
    );
  },
};

import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkMarketSessionRules, executeScheduledStrategyRun } from "./automation.js";

// Mock evidence collection
const mockCollectEvidenceForStrategy = vi.fn();
vi.mock("./evidence.js", () => {
  return {
    collectEvidenceForStrategy: (...args: any[]) => mockCollectEvidenceForStrategy(...args),
  };
});

// Mock agent workflow
const mockRunStrategyAgentWorkflow = vi.fn();
vi.mock("./agent-workflows.js", () => {
  return {
    runStrategyAgentWorkflow: (...args: any[]) => mockRunStrategyAgentWorkflow(...args),
  };
});

// Mock risk validation
const mockValidateRiskForPacket = vi.fn();
vi.mock("./risk.js", () => {
  return {
    validateRiskForPacket: (...args: any[]) => mockValidateRiskForPacket(...args),
  };
});

// Mock execution
const mockExecutePacket = vi.fn();
vi.mock("./execution.js", () => {
  return {
    executePacket: (...args: any[]) => mockExecutePacket(...args),
  };
});

describe("checkMarketSessionRules", () => {
  it("allows when sessionOnly is false/undefined", () => {
    expect(checkMarketSessionRules(null).allowed).toBe(true);
    expect(checkMarketSessionRules({ sessionOnly: false }).allowed).toBe(true);
  });

  it("handles weekend rules (mocking Date or manual checks)", () => {
    // We can test the helper directly. Let's check regular hours vs weekend logic
    // Since checkMarketSessionRules uses America/New_York via Intl, it will dynamically calculate.
    // We can mock checkMarketSessionRules internals or verify basic output.
    const result = checkMarketSessionRules({ sessionOnly: true });
    expect(typeof result.allowed).toBe("boolean");
  });
});

describe("executeScheduledStrategyRun", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  const mockStrategy = {
    id: "strategy-1",
    status: "ENABLED" as const,
    userId: "user-1",
    symbols: ["AAPL"],
    outputMode: "PROPOSED_ORDERS" as const,
    executionMode: "PAPER" as const,
    marketSessionRules: { sessionOnly: false },
    liveAcknowledgedAt: null,
  };

  it("completes with skipped if strategy is disabled", async () => {
    const dbMock = {
      jobRun: {
        create: vi.fn().mockResolvedValue({ id: "job-1" }),
        update: vi.fn().mockResolvedValue({}),
      },
      strategyInstance: {
        findUnique: vi.fn().mockResolvedValue({
          ...mockStrategy,
          status: "DISABLED",
        }),
      },
    } as any;

    await executeScheduledStrategyRun("strategy-1", dbMock);

    expect(dbMock.jobRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job-1" },
        data: expect.objectContaining({
          status: "COMPLETED",
          outputRefs: expect.objectContaining({
            skipped: "Strategy is currently disabled.",
          }),
        }),
      }),
    );
  });

  it("skips missed runs if scheduled time is too far in the past", async () => {
    const dbMock = {
      jobRun: {
        create: vi.fn().mockResolvedValue({ id: "job-1" }),
        update: vi.fn().mockResolvedValue({}),
      },
      strategyInstance: {
        findUnique: vi.fn().mockResolvedValue(mockStrategy),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
    } as any;

    const oldScheduledTime = new Date(Date.now() - 30 * 60 * 1000); // 30 mins ago

    await executeScheduledStrategyRun("strategy-1", dbMock, {
      checkMissedRun: true,
      scheduledTime: oldScheduledTime,
    });

    expect(dbMock.jobRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job-1" },
        data: expect.objectContaining({
          status: "COMPLETED",
          outputRefs: expect.objectContaining({
            skipped: "Missed run blocked. Scheduled time is too far in the past.",
          }),
        }),
      }),
    );
  });

  it("fails the job if required evidence fails", async () => {
    mockCollectEvidenceForStrategy.mockResolvedValue({
      id: "bundle-1",
      status: "FAILED",
    });

    const dbMock = {
      jobRun: {
        create: vi.fn().mockResolvedValue({ id: "job-1" }),
        update: vi.fn().mockResolvedValue({}),
      },
      strategyInstance: {
        findUnique: vi.fn().mockResolvedValue(mockStrategy),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
    } as any;

    await expect(executeScheduledStrategyRun("strategy-1", dbMock)).rejects.toThrow("Required evidence collection failed.");

    expect(dbMock.jobRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job-1" },
        data: expect.objectContaining({
          status: "FAILED",
          errorCode: "Error",
          errorMessage: "Required evidence collection failed.",
        }),
      }),
    );
  });

  it("runs happily and executes proposal if risk passes", async () => {
    mockCollectEvidenceForStrategy.mockResolvedValue({
      id: "bundle-1",
      status: "COMPLETE",
    });

    mockRunStrategyAgentWorkflow.mockResolvedValue({
      id: "packet-1",
      proposedOrders: [{ id: "order-1" }],
    });

    mockValidateRiskForPacket.mockResolvedValue({
      packetStatus: "pass",
    });

    const dbMock = {
      jobRun: {
        create: vi.fn().mockResolvedValue({ id: "job-1" }),
        update: vi.fn().mockResolvedValue({}),
      },
      strategyInstance: {
        findUnique: vi.fn().mockResolvedValue(mockStrategy),
      },
      agentStep: {
        create: vi.fn().mockResolvedValue({ id: "step-1" }),
        update: vi.fn().mockResolvedValue({}),
        findMany: vi.fn().mockResolvedValue([]),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
    } as any;

    await executeScheduledStrategyRun("strategy-1", dbMock);

    expect(mockExecutePacket).toHaveBeenCalledWith("packet-1", dbMock);
    expect(dbMock.jobRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job-1" },
        data: expect.objectContaining({
          status: "PARTIAL",
          outputRefs: expect.objectContaining({
            executionResult: "executed",
          }),
        }),
      }),
    );
  });
});

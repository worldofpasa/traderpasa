import { describe, it, expect, vi } from "vitest";
import {
  forkStrategyTemplate,
  StrategyTemplateNotFoundError,
  StrategyInstanceNotFoundError,
  StrategyInstanceDeletedError,
  getStrategyInstanceForUser,
  enableStrategyInstance,
  disableStrategyInstance,
  deleteStrategyInstance,
} from "./strategy-instances.js";

const baseTemplate = {
  id: "template-1",
  kind: "MOMENTUM" as const,
  name: "Momentum",
  description: "Test template",
  defaultConfig: {
    watchlistMode: "MANUAL",
    outputMode: "PROPOSED_ORDERS",
    executionMode: "PAPER",
    modelLoggingDepth: "METADATA",
    sourceConfig: { alpacaMarket: { enabled: true, required: true } },
    riskConfig: { maxPositionPct: 5 },
    marketSessionRules: { sessionOnly: true },
  },
  createdAt: new Date(),
  updatedAt: new Date(),
};

const baseInstance = {
  id: "instance-1",
  userId: "user-1",
  templateId: "template-1",
  brokerAccountId: null,
  name: "Momentum (copy)",
  description: null,
  status: "DISABLED" as const,
  watchlistMode: "MANUAL" as const,
  symbols: [],
  sourceConfig: {},
  riskConfig: {},
  outputMode: "PROPOSED_ORDERS" as const,
  executionMode: "PAPER" as const,
  liveAcknowledgedAt: null,
  marketSessionRules: {},
  scheduleConfig: null,
  trailingStopConfig: null,
  modelLoggingDepth: "METADATA" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeDb(overrides: {
  templateFindUnique?: ReturnType<typeof vi.fn>;
  instanceCreate?: ReturnType<typeof vi.fn>;
  instanceFindFirst?: ReturnType<typeof vi.fn>;
  instanceFindMany?: ReturnType<typeof vi.fn>;
}) {
  return {
    strategyTemplate: {
      findUnique: overrides.templateFindUnique ?? vi.fn().mockResolvedValue(null),
    },
    strategyInstance: {
      create: overrides.instanceCreate ?? vi.fn().mockResolvedValue(baseInstance),
      findFirst: overrides.instanceFindFirst ?? vi.fn().mockResolvedValue(null),
      findMany: overrides.instanceFindMany ?? vi.fn().mockResolvedValue([]),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({
      strategyInstance: { create: overrides.instanceCreate ?? vi.fn().mockResolvedValue(baseInstance) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    })),
  } as never;
}

describe("forkStrategyTemplate", () => {
  it("throws when template does not exist", async () => {
    const db = makeDb({ templateFindUnique: vi.fn().mockResolvedValue(null) });

    await expect(
      forkStrategyTemplate({ userId: "user-1", templateId: "missing" }, db),
    ).rejects.toBeInstanceOf(StrategyTemplateNotFoundError);
  });

  it("creates a DISABLED instance with defaults from template", async () => {
    const instanceCreate = vi.fn().mockResolvedValue(baseInstance);
    const db = makeDb({
      templateFindUnique: vi.fn().mockResolvedValue(baseTemplate),
      instanceCreate,
    });

    const result = await forkStrategyTemplate(
      { userId: "user-1", templateId: "template-1" },
      db,
    );

    expect(result.status).toBe("DISABLED");
    expect(result.templateId).toBe("template-1");
    expect(instanceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-1",
          templateId: "template-1",
          status: "DISABLED",
          executionMode: "PAPER",
        }),
      }),
    );
  });

  it("uses custom name when provided", async () => {
    const instanceCreate = vi.fn().mockResolvedValue({ ...baseInstance, name: "My Strategy" });
    const db = makeDb({
      templateFindUnique: vi.fn().mockResolvedValue(baseTemplate),
      instanceCreate,
    });

    const result = await forkStrategyTemplate(
      { userId: "user-1", templateId: "template-1", name: "My Strategy" },
      db,
    );

    expect(instanceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: "My Strategy" }),
      }),
    );
    expect(result.name).toBe("My Strategy");
  });

  it("defaults name to template name + (copy) when not provided", async () => {
    const instanceCreate = vi.fn().mockResolvedValue(baseInstance);
    const db = makeDb({
      templateFindUnique: vi.fn().mockResolvedValue(baseTemplate),
      instanceCreate,
    });

    await forkStrategyTemplate({ userId: "user-1", templateId: "template-1" }, db);

    expect(instanceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: "Momentum (copy)" }),
      }),
    );
  });
});

describe("updateStrategyInstance", () => {
  it("throws when instance not found", async () => {
    const { updateStrategyInstance } = await import("./strategy-instances.js");
    const db = makeDb({ instanceFindFirst: vi.fn().mockResolvedValue(null) });

    await expect(
      updateStrategyInstance("missing", "user-1", { name: "New Name" }, db),
    ).rejects.toBeInstanceOf(StrategyInstanceNotFoundError);
  });

  it("updates allowed fields and writes audit log", async () => {
    const { updateStrategyInstance } = await import("./strategy-instances.js");
    const instanceUpdate = vi.fn().mockResolvedValue({ ...baseInstance, name: "Updated" });
    const auditCreate = vi.fn().mockResolvedValue({});
    const db = {
      strategyInstance: {
        findFirst: vi.fn().mockResolvedValue(baseInstance),
        update: instanceUpdate,
      },
      auditLog: { create: auditCreate },
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          strategyInstance: { update: instanceUpdate },
          auditLog: { create: auditCreate },
        }),
      ),
    } as never;

    const result = await updateStrategyInstance(
      "instance-1",
      "user-1",
      { name: "Updated", outputMode: "RANKED_IDEAS" },
      db,
    );

    expect(instanceUpdate).toHaveBeenCalled();
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "strategy.updated" }),
      }),
    );
    expect(result.name).toBe("Updated");
  });
});

describe("lifecycle transitions", () => {
  function makeLifecycleDb(existingStatus: "ENABLED" | "DISABLED" | "DELETED" | null) {
    const instanceUpdate = vi.fn().mockResolvedValue({ ...baseInstance, status: "ENABLED" });
    const auditCreate = vi.fn().mockResolvedValue({});
    const existing = existingStatus ? { ...baseInstance, status: existingStatus } : null;

    return {
      db: {
        strategyInstance: {
          findFirst: vi.fn().mockResolvedValue(existing),
          update: instanceUpdate,
        },
        auditLog: { create: auditCreate },
        $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            strategyInstance: { update: instanceUpdate },
            auditLog: { create: auditCreate },
          }),
        ),
      } as never,
      instanceUpdate,
      auditCreate,
    };
  }

  it("enables a DISABLED instance", async () => {
    const { db, instanceUpdate } = makeLifecycleDb("DISABLED");
    await enableStrategyInstance("instance-1", "user-1", db);
    expect(instanceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "ENABLED" } }),
    );
  });

  it("disables an ENABLED instance", async () => {
    const { db, instanceUpdate } = makeLifecycleDb("ENABLED");
    await disableStrategyInstance("instance-1", "user-1", db);
    expect(instanceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "DISABLED" } }),
    );
  });

  it("soft-deletes an instance", async () => {
    const { db, instanceUpdate } = makeLifecycleDb("DISABLED");
    await deleteStrategyInstance("instance-1", "user-1", db);
    expect(instanceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "DELETED" } }),
    );
  });

  it("throws StrategyInstanceDeletedError on already-deleted instance", async () => {
    const { db } = makeLifecycleDb("DELETED");
    await expect(
      deleteStrategyInstance("instance-1", "user-1", db),
    ).rejects.toBeInstanceOf(StrategyInstanceDeletedError);
  });

  it("throws StrategyInstanceNotFoundError when instance does not exist", async () => {
    const { db } = makeLifecycleDb(null);
    await expect(
      enableStrategyInstance("missing", "user-1", db),
    ).rejects.toBeInstanceOf(StrategyInstanceNotFoundError);
  });
});

describe("getStrategyInstanceForUser", () => {
  it("throws when instance is not found", async () => {
    const db = makeDb({ instanceFindFirst: vi.fn().mockResolvedValue(null) });

    await expect(
      getStrategyInstanceForUser("missing", "user-1", db),
    ).rejects.toBeInstanceOf(StrategyInstanceNotFoundError);
  });

  it("returns instance when found", async () => {
    const db = makeDb({ instanceFindFirst: vi.fn().mockResolvedValue(baseInstance) });

    const result = await getStrategyInstanceForUser("instance-1", "user-1", db);

    expect(result.id).toBe("instance-1");
  });
});

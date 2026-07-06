import { describe, it, expect, vi } from "vitest";
import { writeAuditLog, listAuditLogs } from "./audit.js";

function makeDb(overrides: {
  create?: (input: unknown) => Promise<unknown>;
  findMany?: (input: unknown) => Promise<unknown[]>;
  count?: (input: unknown) => Promise<number>;
}) {
  return {
    auditLog: {
      create: overrides.create ?? vi.fn().mockResolvedValue({}),
      findMany: overrides.findMany ?? vi.fn().mockResolvedValue([]),
      count: overrides.count ?? vi.fn().mockResolvedValue(0),
    },
    $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
  } as never;
}

describe("writeAuditLog", () => {
  it("persists a system event without actorId", async () => {
    const create = vi.fn().mockResolvedValue({});
    const db = makeDb({ create });

    await writeAuditLog(
      { actorType: "SYSTEM", action: "auth.login_failed", target: "user:abc" },
      db,
    );

    expect(create).toHaveBeenCalledWith({
      data: {
        actorType: "SYSTEM",
        actorId: null,
        action: "auth.login_failed",
        target: "user:abc",
      },
    });
  });

  it("persists a user event with actorId and metadata", async () => {
    const create = vi.fn().mockResolvedValue({});
    const db = makeDb({ create });

    await writeAuditLog(
      {
        actorType: "USER",
        actorId: "user-1",
        action: "credential.created",
        target: "credential:cred-1",
        metadata: { kind: "BROKER" },
      },
      db,
    );

    expect(create).toHaveBeenCalledWith({
      data: {
        actorType: "USER",
        actorId: "user-1",
        action: "credential.created",
        target: "credential:cred-1",
        metadata: { kind: "BROKER" },
      },
    });
  });
});

describe("listAuditLogs", () => {
  const baseEntry = {
    id: "1",
    actorType: "USER" as const,
    actorId: "user-1",
    action: "auth.login_succeeded",
    target: "user:user-1",
    metadata: null,
    createdAt: new Date("2024-01-01T00:00:00Z"),
  };

  it("returns paginated entries with total count", async () => {
    const db = makeDb({
      findMany: vi.fn().mockResolvedValue([baseEntry]),
      count: vi.fn().mockResolvedValue(5),
    });

    const result = await listAuditLogs({ limit: 10, offset: 0 }, db);

    expect(result.total).toBe(5);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.action).toBe("auth.login_succeeded");
    expect(result.limit).toBe(10);
    expect(result.offset).toBe(0);
  });

  it("caps limit at 200", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const count = vi.fn().mockResolvedValue(0);
    const db = makeDb({ findMany, count });

    const result = await listAuditLogs({ limit: 999 }, db);

    expect(result.limit).toBe(200);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 200 }));
  });

  it("defaults to limit 50 offset 0", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const count = vi.fn().mockResolvedValue(0);
    const db = makeDb({ findMany, count });

    const result = await listAuditLogs({}, db);

    expect(result.limit).toBe(50);
    expect(result.offset).toBe(0);
  });
});

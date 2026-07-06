import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { userHasLiveAccessPin, verifyLiveAccessPin } from "@pasa-trader/core";
import { getPrismaClient } from "@pasa-trader/db";
import { enqueueJob } from "../../../../enqueue-job";

vi.mock("@pasa-trader/core", () => ({
  CsrfValidationError: class CsrfValidationError extends Error {},
  userHasLiveAccessPin: vi.fn(),
  verifyLiveAccessPin: vi.fn(),
}));
vi.mock("@pasa-trader/db", () => ({ getPrismaClient: vi.fn() }));
vi.mock("../../../../current-user", () => ({
  getCurrentUser: vi.fn().mockResolvedValue({ id: "user-1" }),
}));
vi.mock("../../../../request-security", () => ({
  assertAuthenticatedMutation: vi.fn().mockResolvedValue(undefined),
  SameOriginRequestError: class SameOriginRequestError extends Error {},
}));
vi.mock("../../../../enqueue-job", () => ({
  enqueueJob: vi.fn().mockResolvedValue("job-1"),
}));

function mockPacket(executionMode: "PAPER" | "LIVE") {
  vi.mocked(getPrismaClient).mockReturnValue({
    proposedOrderPacket: {
      findUnique: vi.fn().mockResolvedValue({
        id: "packet-1",
        status: "DRAFT",
        strategyInstance: { userId: "user-1", executionMode },
      }),
    },
  } as any);
}

function makeRequest(body?: unknown): Request {
  return new Request("http://localhost/api/proposed-packets/packet-1/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const params = { params: Promise.resolve({ id: "packet-1" }) };

beforeEach(() => {
  vi.mocked(enqueueJob).mockClear();
  vi.mocked(userHasLiveAccessPin).mockReset();
  vi.mocked(verifyLiveAccessPin).mockReset();
});

describe("POST /api/proposed-packets/[id]/execute — live PIN gate", () => {
  it("executes PAPER packets without a PIN", async () => {
    mockPacket("PAPER");

    const res = await POST(makeRequest(), params);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, jobId: "job-1" });
    expect(userHasLiveAccessPin).not.toHaveBeenCalled();
  });

  it("blocks LIVE execution when no PIN is configured", async () => {
    mockPacket("LIVE");
    vi.mocked(userHasLiveAccessPin).mockResolvedValue(false);

    const res = await POST(makeRequest({ livePin: "whatever" }), params);

    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("live_pin_not_configured");
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it("blocks LIVE execution with a wrong or missing PIN", async () => {
    mockPacket("LIVE");
    vi.mocked(userHasLiveAccessPin).mockResolvedValue(true);
    vi.mocked(verifyLiveAccessPin).mockResolvedValue(false);

    const wrong = await POST(makeRequest({ livePin: "wrong" }), params);
    expect(wrong.status).toBe(403);
    expect((await wrong.json()).error.code).toBe("invalid_live_pin");

    mockPacket("LIVE");
    const missing = await POST(makeRequest({}), params);
    expect(missing.status).toBe(403);

    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it("executes LIVE packets when the PIN verifies", async () => {
    mockPacket("LIVE");
    vi.mocked(userHasLiveAccessPin).mockResolvedValue(true);
    vi.mocked(verifyLiveAccessPin).mockResolvedValue(true);

    const res = await POST(makeRequest({ livePin: "correct-pin" }), params);

    expect(res.status).toBe(200);
    expect(verifyLiveAccessPin).toHaveBeenCalledWith("user-1", "correct-pin");
    expect(enqueueJob).toHaveBeenCalledWith("packet.execute", { packetId: "packet-1" });
  });
});

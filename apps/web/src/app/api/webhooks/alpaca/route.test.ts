import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "./route";
import { applyWebhookOrderUpdate } from "@pasa-trader/core";

vi.mock("@pasa-trader/core", () => ({
  applyWebhookOrderUpdate: vi.fn().mockResolvedValue(true),
}));

function makeRequest(body: unknown, secret?: string): Request {
  return new Request("http://localhost/api/webhooks/alpaca", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { "x-webhook-secret": secret } : {}),
    },
    body: JSON.stringify(body),
  });
}

const VALID_PAYLOAD = {
  event: "fill",
  order: { id: "broker-1", status: "filled", filled_at: "2026-06-09T15:30:00Z", filled_avg_price: "151.25" },
};

describe("POST /api/webhooks/alpaca", () => {
  beforeEach(() => {
    process.env.ALPACA_WEBHOOK_SECRET = "test-secret";
    vi.mocked(applyWebhookOrderUpdate).mockClear();
  });

  afterEach(() => {
    delete process.env.ALPACA_WEBHOOK_SECRET;
  });

  it("returns 404 when the webhook secret is not configured", async () => {
    delete process.env.ALPACA_WEBHOOK_SECRET;
    const res = await POST(makeRequest(VALID_PAYLOAD, "anything"));
    expect(res.status).toBe(404);
    expect(applyWebhookOrderUpdate).not.toHaveBeenCalled();
  });

  it("returns 401 for a missing or wrong secret", async () => {
    expect((await POST(makeRequest(VALID_PAYLOAD))).status).toBe(401);
    expect((await POST(makeRequest(VALID_PAYLOAD, "wrong"))).status).toBe(401);
    expect(applyWebhookOrderUpdate).not.toHaveBeenCalled();
  });

  it("returns 400 for a payload that fails schema validation", async () => {
    const res = await POST(makeRequest({ order: { id: "" } }, "test-secret"));
    expect(res.status).toBe(400);
    expect(applyWebhookOrderUpdate).not.toHaveBeenCalled();
  });

  it("applies a valid order update and reports the result", async () => {
    const res = await POST(makeRequest(VALID_PAYLOAD, "test-secret"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, updated: true });
    expect(applyWebhookOrderUpdate).toHaveBeenCalledWith("broker-1", {
      status: "filled",
      filledAt: new Date("2026-06-09T15:30:00Z"),
      filledAvgPrice: 151.25,
    });
  });

  it("reports updated=false for unknown orders", async () => {
    vi.mocked(applyWebhookOrderUpdate).mockResolvedValueOnce(false);
    const res = await POST(makeRequest(VALID_PAYLOAD, "test-secret"));
    expect(await res.json()).toEqual({ ok: true, updated: false });
  });
});

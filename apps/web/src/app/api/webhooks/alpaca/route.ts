import { applyWebhookOrderUpdate } from "@pasa-trader/core";
import { errorResponseSchema } from "@pasa-trader/schemas";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";

function errorResponse(code: string, message: string, status: number): Response {
  return Response.json(
    errorResponseSchema.parse({ error: { code, message } }),
    { status },
  );
}

const webhookPayloadSchema = z.object({
  event: z.string().optional(),
  order: z.object({
    id: z.string().min(1),
    status: z.string().min(1),
    filled_at: z.string().nullable().optional(),
    filled_avg_price: z.string().nullable().optional(),
  }),
});

function mapWebhookStatus(status: string): "filled" | "partially_filled" | "cancelled" | "expired" | "rejected" | "accepted" {
  switch (status) {
    case "filled":
      return "filled";
    case "partially_filled":
      return "partially_filled";
    case "canceled":
    case "cancelled":
      return "cancelled";
    case "expired":
      return "expired";
    case "rejected":
      return "rejected";
    default:
      return "accepted";
  }
}

function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Receiver for Alpaca order lifecycle events (#90). Authenticated with a
 * shared secret: set ALPACA_WEBHOOK_SECRET and configure the same value in
 * the event delivery integration. Disabled (404) when the secret is unset.
 */
export async function POST(request: Request) {
  const secret = process.env.ALPACA_WEBHOOK_SECRET;
  if (!secret) {
    return errorResponse("not_found", "Webhook receiver is not configured.", 404);
  }

  const provided = request.headers.get("x-webhook-secret");
  if (!provided || !secretsMatch(provided, secret)) {
    return errorResponse("unauthorized", "Invalid webhook secret.", 401);
  }

  let payload: z.infer<typeof webhookPayloadSchema>;
  try {
    payload = webhookPayloadSchema.parse(await request.json());
  } catch {
    return errorResponse("invalid_payload", "Webhook payload failed schema validation.", 400);
  }

  const { order } = payload;
  const updated = await applyWebhookOrderUpdate(order.id, {
    status: mapWebhookStatus(order.status),
    filledAt: order.filled_at ? new Date(order.filled_at) : null,
    filledAvgPrice: order.filled_avg_price ? parseFloat(order.filled_avg_price) : null,
  });

  return Response.json({ ok: true, updated });
}

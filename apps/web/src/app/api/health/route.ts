import { healthResponseSchema } from "@pasa-trader/schemas";

export function GET() {
  const response = healthResponseSchema.parse({
    status: "ok",
    service: "pasa-trader-platform",
    checkedAt: new Date().toISOString(),
  });

  return Response.json(response);
}

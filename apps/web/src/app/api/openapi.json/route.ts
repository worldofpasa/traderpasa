import { createOpenApiDocument } from "@pasa-trader/schemas";

export function GET() {
  return Response.json(createOpenApiDocument());
}

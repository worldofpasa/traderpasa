import { getSetupStatus } from "@pasa-trader/core";

export async function GET() {
  return Response.json(await getSetupStatus());
}

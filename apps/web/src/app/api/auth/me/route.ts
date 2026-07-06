import { getCurrentUserFromSessionToken } from "@pasa-trader/core";
import { getSessionTokenFromCookies } from "../../../auth-cookies";

export async function GET() {
  return Response.json(await getCurrentUserFromSessionToken(await getSessionTokenFromCookies()));
}

import { getCurrentUserFromSessionToken } from "@pasa-trader/core";
import { getSessionTokenFromCookies } from "./auth-cookies";

export async function getCurrentUser() {
  const currentUser = await getCurrentUserFromSessionToken(await getSessionTokenFromCookies());

  return currentUser.user;
}

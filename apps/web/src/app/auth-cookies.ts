import { cookies } from "next/headers";
import { csrfCookieName, sessionCookieName } from "@pasa-trader/schemas";

const secureCookie = process.env.AUTH_COOKIE_SECURE === "true";
const sharedCookieOptions = {
  path: "/",
  sameSite: "lax" as const,
  secure: secureCookie,
};

export async function getSessionTokenFromCookies(): Promise<string | undefined> {
  const cookieStore = await cookies();

  return cookieStore.get(sessionCookieName)?.value;
}

export async function getCsrfTokenFromCookies(): Promise<string | undefined> {
  const cookieStore = await cookies();

  return cookieStore.get(csrfCookieName)?.value;
}

export async function setAuthCookies(input: {
  csrfToken: string;
  expiresAt: string;
  sessionToken: string;
}): Promise<void> {
  const cookieStore = await cookies();
  const expires = new Date(input.expiresAt);

  cookieStore.set(sessionCookieName, input.sessionToken, {
    ...sharedCookieOptions,
    expires,
    httpOnly: true,
  });
  cookieStore.set(csrfCookieName, input.csrfToken, {
    ...sharedCookieOptions,
    expires,
    httpOnly: false,
  });
}

export async function clearAuthCookies(): Promise<void> {
  const cookieStore = await cookies();

  cookieStore.delete(sessionCookieName);
  cookieStore.delete(csrfCookieName);
}

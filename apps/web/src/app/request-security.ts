import { CsrfValidationError, validateCsrfTokenForSession } from "@pasa-trader/core";
import { csrfHeaderName } from "@pasa-trader/schemas";
import { getCsrfTokenFromCookies, getSessionTokenFromCookies } from "./auth-cookies";

export class SameOriginRequestError extends Error {
  constructor() {
    super("State-changing browser requests must come from the application origin.");
    this.name = "SameOriginRequestError";
  }
}

function getPublicRequestOrigin(request: Request): string {
  const requestUrl = new URL(request.url);
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = request.headers.get("host");
  const protocol = forwardedProto ?? requestUrl.protocol.replace(":", "");
  const hostname = forwardedHost ?? host ?? requestUrl.host;

  return `${protocol}://${hostname}`;
}

export function assertSameOriginRequest(request: Request): void {
  const requestOrigin = getPublicRequestOrigin(request);
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");

  if (origin && origin !== requestOrigin) {
    throw new SameOriginRequestError();
  }

  if (!origin && referer && new URL(referer).origin !== requestOrigin) {
    throw new SameOriginRequestError();
  }
}

export async function assertAuthenticatedMutation(request: Request): Promise<void> {
  assertSameOriginRequest(request);

  const csrfHeader = request.headers.get(csrfHeaderName);
  const csrfCookie = await getCsrfTokenFromCookies();

  if (!csrfHeader || csrfHeader !== csrfCookie) {
    throw new CsrfValidationError();
  }

  await validateCsrfTokenForSession({
    csrfToken: csrfHeader,
    sessionToken: await getSessionTokenFromCookies(),
  });
}

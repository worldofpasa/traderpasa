"use client";

import { csrfCookieName, csrfHeaderName } from "@pasa-trader/schemas";

export function getCsrfHeader(): Record<string, string> {
  const csrfCookie = document.cookie
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${csrfCookieName}=`));

  const csrfToken = csrfCookie?.slice(csrfCookieName.length + 1);

  return csrfToken
    ? {
        [csrfHeaderName]: decodeURIComponent(csrfToken),
      }
    : {};
}

"use client";

import { useState } from "react";
import { getCsrfHeader } from "./csrf-client";

export function LogoutButton() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <button
      className="button button-secondary"
      disabled={isSubmitting}
      onClick={() => {
        setIsSubmitting(true);
        void fetch("/api/auth/logout", {
          headers: getCsrfHeader(),
          method: "POST",
        }).finally(() => {
          window.location.assign("/sign-in");
        });
      }}
      type="button"
    >
      {isSubmitting ? "Signing out..." : "Sign out"}
    </button>
  );
}

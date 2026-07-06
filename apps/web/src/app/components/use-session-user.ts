"use client";

import { useEffect, useState } from "react";
import type { User } from "../lib/strategy-types";

export function useSessionUser() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/auth/me");
        const data = (await res.json()) as { user?: User };
        if (!data.user) {
          window.location.href = "/sign-in";
          return;
        }
        if (!cancelled) setUser(data.user);
      } catch {
        if (!cancelled) window.location.href = "/sign-in";
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { user, loading };
}

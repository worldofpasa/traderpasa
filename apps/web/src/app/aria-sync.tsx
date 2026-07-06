"use client";

import { useEffect } from "react";

export function AriaSync() {
  useEffect(() => {
    const syncAria = (el: HTMLElement) => {
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLSelectElement ||
        el instanceof HTMLTextAreaElement
      ) {
        const isInvalid = el.matches(":user-invalid");
        if (isInvalid) {
          el.setAttribute("aria-invalid", "true");
        } else {
          el.removeAttribute("aria-invalid");
        }
      }
    };

    const handleBlur = (e: FocusEvent) => {
      if (e.target instanceof HTMLElement) {
        syncAria(e.target);
      }
    };

    const handleInput = (e: Event) => {
      if (e.target instanceof HTMLElement) {
        if (e.target.hasAttribute("aria-invalid")) {
          syncAria(e.target);
        }
      }
    };

    document.addEventListener("blur", handleBlur, true);
    document.addEventListener("input", handleInput, true);

    return () => {
      document.removeEventListener("blur", handleBlur, true);
      document.removeEventListener("input", handleInput, true);
    };
  }, []);

  return null;
}

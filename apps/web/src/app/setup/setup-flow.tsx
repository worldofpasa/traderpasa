"use client";

import { useState } from "react";
import { FirstAdminSetupForm } from "./setup-form";
import { OnboardingLLMSelector } from "./components/OnboardingLLMSelector";

type Step = "admin" | "llm" | "done";

export function SetupFlow() {
  const [step, setStep] = useState<Step>("admin");

  // After admin account is created, the setup-form redirects to "/" normally
  // but we intercept that and show the LLM step instead.
  // We do this by rendering the form with an onSuccess callback.
  if (step === "admin") {
    return (
      <section className="setup-panel">
        <p className="eyebrow">Step 1 of 2 · First boot</p>
        <h1>Create the local admin</h1>
        <p className="setup-copy">
          This self-hosted install starts with one admin account. Setup is locked after this account
          is created.
        </p>
        <FirstAdminSetupForm onSuccess={() => setStep("llm")} />
      </section>
    );
  }

  if (step === "llm") {
    return (
      <section className="setup-panel" style={{ width: "min(100%, 42rem)" }}>
        <OnboardingLLMSelector
          onComplete={() => setStep("done")}
          onSkip={() => setStep("done")}
        />
      </section>
    );
  }

  // done — navigate to main app
  if (typeof window !== "undefined") {
    window.location.assign("/");
  }
  return (
    <section className="setup-panel">
      <p className="eyebrow">Setup complete</p>
      <h1>You&apos;re ready</h1>
      <p className="setup-copy">Redirecting to the dashboard…</p>
    </section>
  );
}

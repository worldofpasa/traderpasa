"use client";

import { useState, type SyntheticEvent } from "react";

type FormState =
  | {
      status: "idle" | "submitting";
      message?: string;
    }
  | {
      status: "error";
      message: string;
    };

export function SignInForm() {
  const [formState, setFormState] = useState<FormState>({
    status: "idle",
  });

  async function submitForm(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormState({ status: "submitting" });

    const formData = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/sign-in", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: formData.get("email"),
        password: formData.get("password"),
      }),
    });

    if (!response.ok) {
      setFormState({
        status: "error",
        message: "Invalid email or password.",
      });
      return;
    }

    window.location.assign("/");
  }

  return (
    <form
      className="setup-form"
      onSubmit={(event) => {
        void submitForm(event);
      }}
    >
      <label>
        Email
        <input autoComplete="email" name="email" required type="email" />
        <span className="error-message">Please enter a valid email address.</span>
      </label>
      <label>
        Password
        <input autoComplete="current-password" name="password" required type="password" />
        <span className="error-message">Password is required.</span>
      </label>
      <button disabled={formState.status === "submitting"} type="submit">
        {formState.status === "submitting" ? "Signing in..." : "Sign in"}
      </button>
      {formState.status === "error" ? <p className="form-error">{formState.message}</p> : null}
    </form>
  );
}

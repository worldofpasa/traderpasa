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

interface Props {
  /** Called after successful admin creation instead of hard-navigating to "/" */
  onSuccess?: () => void;
}

export function FirstAdminSetupForm({ onSuccess }: Props) {
  const [formState, setFormState] = useState<FormState>({
    status: "idle",
  });

  async function submitForm(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormState({ status: "submitting" });

    const formData = new FormData(event.currentTarget);
    const response = await fetch("/api/setup/first-admin", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: formData.get("name"),
        email: formData.get("email"),
        password: formData.get("password"),
      }),
    });

    if (!response.ok) {
      setFormState({
        status: "error",
        message: "Setup failed. Check the fields and try again.",
      });
      return;
    }

    if (onSuccess) {
      onSuccess();
    } else {
      window.location.assign("/");
    }
  }

  return (
    <form
      className="setup-form"
      onSubmit={(event) => {
        void submitForm(event);
      }}
    >
      <label>
        Name
        <input autoComplete="name" name="name" required />
        <span className="error-message">Name is required.</span>
      </label>
      <label>
        Email
        <input autoComplete="email" name="email" required type="email" />
        <span className="error-message">Please enter a valid email address.</span>
      </label>
      <label>
        Password
        <input
          autoComplete="new-password"
          minLength={12}
          name="password"
          required
          type="password"
        />
        <span className="error-message">Password must be at least 12 characters.</span>
      </label>
      <button disabled={formState.status === "submitting"} type="submit">
        {formState.status === "submitting" ? "Creating admin..." : "Create admin"}
      </button>
      {formState.status === "error" ? <p className="form-error">{formState.message}</p> : null}
    </form>
  );
}

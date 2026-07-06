"use client";

import React, { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { getCsrfHeader } from "./csrf-client";

interface Props {
  addToast: (message: string, type?: "success" | "error" | "info" | "warning") => void;
}

/**
 * Settings card for the secondary Live Access PIN that gates LIVE packet
 * execution (#94). Enforcement is server-side; this only manages the PIN.
 */
export function LivePinCard({ addToast }: Props) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [currentPin, setCurrentPin] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/auth/live-pin")
      .then((res) => res.json() as Promise<{ configured?: boolean }>)
      .then((data) => {
        setConfigured(Boolean(data.configured));
      })
      .catch(() => {
        setConfigured(false);
      });
  }, []);

  const handleSubmit = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    if (pin.length < 6) {
      addToast("Live Access PIN must be at least 6 characters.", "error");
      return;
    }
    if (pin !== confirmPin) {
      addToast("PIN confirmation does not match.", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/auth/live-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getCsrfHeader() },
        body: JSON.stringify({ pin, ...(configured ? { currentPin } : {}) }),
      });
      const data = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) {
        addToast(data.error?.message ?? "Failed to update the Live Access PIN.", "error");
        return;
      }
      addToast(configured ? "Live Access PIN updated." : "Live Access PIN configured.", "success");
      setConfigured(true);
      setPin("");
      setConfirmPin("");
      setCurrentPin("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="glass-card settings-card">
      <div className="settings-section-header">
        <p className="eyebrow">Live Trading Security</p>
        <h2 className="card-title-mb-md icon-heading"><ShieldCheck size={18} /> Live Access PIN</h2>
        <p className="card-description">
          A secondary PIN required every time LIVE orders are approved for execution.
          {configured === false && " Not configured yet — LIVE execution is locked until you set one."}
          {configured === true && " Configured. Enter your current PIN to change it."}
        </p>
      </div>
      <form onSubmit={(e) => { void handleSubmit(e); }} className="setup-form">
        {configured && (
          <label>
            Current PIN
            <input
              type="password"
              autoComplete="off"
              value={currentPin}
              onChange={(e) => { setCurrentPin(e.target.value); }}
              required
            />
          </label>
        )}
        <label>
          New PIN (minimum 6 characters)
          <input
            type="password"
            autoComplete="off"
            value={pin}
            onChange={(e) => { setPin(e.target.value); }}
            minLength={6}
            required
          />
        </label>
        <label>
          Confirm New PIN
          <input
            type="password"
            autoComplete="off"
            value={confirmPin}
            onChange={(e) => { setConfirmPin(e.target.value); }}
            minLength={6}
            required
          />
        </label>
        <div className="modal-footer-actions">
          <button type="submit" disabled={saving || configured === null} className="button button-primary">
            {configured ? "Change PIN" : "Set PIN"}
          </button>
        </div>
      </form>
    </div>
  );
}

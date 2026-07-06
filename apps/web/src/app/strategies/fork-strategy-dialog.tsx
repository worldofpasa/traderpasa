"use client";

import { useEffect, useRef } from "react";
import { GitFork } from "lucide-react";
import type { StrategyTemplate } from "../lib/strategy-types";

interface ForkStrategyDialogProps {
  open: boolean;
  onClose: () => void;
  templates: StrategyTemplate[];
  forkTemplateId: string;
  forkName: string;
  forkSourceName: string | null;
  onTemplateChange: (id: string) => void;
  onNameChange: (name: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export function ForkStrategyDialog({
  open,
  onClose,
  templates,
  forkTemplateId,
  forkName,
  forkSourceName,
  onTemplateChange,
  onNameChange,
  onSubmit,
}: ForkStrategyDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog ref={dialogRef} className="modal-content" onClose={onClose}>
      <div className="modal-header">
        <h2 className="margin-0">{forkSourceName ? `Fork "${forkSourceName}"` : "Fork Base Template"}</h2>
        <button type="button" onClick={onClose} className="modal-close-btn">
          ×
        </button>
      </div>
      <div className="modal-scroll-body">
        <form onSubmit={onSubmit} className="setup-form">
          {!forkSourceName && (
            <label>
              Select Template
              <select value={forkTemplateId} onChange={(e) => onTemplateChange(e.target.value)} required>
                <option value="">-- Choose a template --</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.kind})
                  </option>
                ))}
              </select>
            </label>
          )}

          <label>
            New Strategy Name
            <input
              type="text"
              placeholder="My Momentum Strategy"
              value={forkName}
              onChange={(e) => onNameChange(e.target.value)}
            />
          </label>

          <div className="modal-footer-actions">
            <button type="button" onClick={onClose} className="button button-secondary">
              Cancel
            </button>
            <button type="submit" disabled={!forkTemplateId} className="button button-primary">
              <GitFork size={14} /> {forkSourceName ? "Fork Strategy" : "Fork Template"}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}

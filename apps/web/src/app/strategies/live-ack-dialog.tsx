"use client";

import { useEffect, useRef } from "react";
import { TriangleAlert } from "lucide-react";

interface LiveAckDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function LiveAckDialog({ open, onClose, onConfirm }: LiveAckDialogProps) {
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
    <dialog ref={dialogRef} className="modal-content modal-content-danger" onClose={onClose}>
      <h2 className="modal-title-danger icon-heading">
        <TriangleAlert size={18} /> Live Trading Safety Agreement
      </h2>
      <p className="modal-body-text">
        You are about to enable <strong>LIVE trading</strong> using real capital. Please review and acknowledge the following regulatory risk disclosures:
      </p>
      <blockquote className="danger-blockquote">
        I understand that I am enabling live trading for this strategy/account. Live trading uses real money and can result in financial losses, including loss of principal. I understand that Pasa Trader Platform provides trading automation, research, recommendations, and execution tools, but does not guarantee profits or prevent losses. I am responsible for my brokerage account, strategy settings, risk settings, approvals, and account activity. I understand that automated systems can be wrong, delayed, interrupted, or fail to execute as expected. I can disable live trading or auto-execution at any time.
      </blockquote>
      <div className="modal-footer-actions">
        <button type="button" onClick={onClose} className="button button-secondary">
          Decline & Keep Paper
        </button>
        <button type="button" onClick={onConfirm} className="button button-danger">
          I Agree & Acknowledge Risks
        </button>
      </div>
    </dialog>
  );
}

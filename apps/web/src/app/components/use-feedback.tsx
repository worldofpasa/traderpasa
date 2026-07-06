"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, TriangleAlert } from "lucide-react";

export type ToastType = "success" | "error" | "info" | "warning";

interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface ConfirmState {
  title: string;
  message: string;
  onConfirm: () => void;
  danger?: boolean;
  confirmLabel?: string;
}

export function useFeedback() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmState | null>(null);
  const confirmDialogRef = useRef<HTMLDialogElement>(null);

  const addToast = useCallback((message: string, type: ToastType = "info") => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const showConfirm = useCallback(
    (message: string, onConfirm: () => void, options?: { title?: string; danger?: boolean; confirmLabel?: string }) => {
      setConfirmDialog({
        title: options?.title ?? "Are you sure?",
        message,
        onConfirm,
        danger: options?.danger ?? false,
        ...(options?.confirmLabel !== undefined ? { confirmLabel: options.confirmLabel } : {}),
      });
    },
    [],
  );

  useEffect(() => {
    const dialog = confirmDialogRef.current;
    if (!dialog) return;
    if (confirmDialog) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [confirmDialog]);

  const feedbackUi = (
    <>
      <dialog
        ref={confirmDialogRef}
        className={`modal-content ${confirmDialog?.danger ? "modal-content-danger" : ""}`}
        onClose={() => setConfirmDialog(null)}
      >
        {confirmDialog && (
          <>
            <h2 className={`modal-title ${confirmDialog.danger ? "modal-title-danger" : ""} icon-heading`}>
              {confirmDialog.danger ? <TriangleAlert size={18} /> : <FileText size={18} />}
              {confirmDialog.title}
            </h2>
            <p className="modal-body-text">{confirmDialog.message}</p>
            <div className="modal-footer-actions">
              <button type="button" onClick={() => setConfirmDialog(null)} className="button button-secondary">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const onConfirm = confirmDialog.onConfirm;
                  setConfirmDialog(null);
                  onConfirm();
                }}
                className={`button ${confirmDialog.danger ? "button-danger" : "button-primary"}`}
              >
                {confirmDialog.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </>
        )}
      </dialog>

      <div className="toast-container" aria-live="assertive">
        {toasts.map((t) => (
          <div key={t.id} className={`toast-card toast-${t.type}`}>
            <span className="toast-message">{t.message}</span>
            <button
              type="button"
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              className="toast-close"
              aria-label="Close notification"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </>
  );

  return { addToast, showConfirm, feedbackUi };
}

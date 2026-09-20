"use client";

export type ConfirmModalDetail = {
  label: string;
  value: string;
};

type Props = {
  open: boolean;
  title: string;
  description: string;
  details?: ConfirmModalDetail[];
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  busyLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmModal({
  open,
  title,
  description,
  details,
  confirmLabel = "تأكيد",
  cancelLabel = "إلغاء",
  busy = false,
  busyLabel = "جارٍ التنفيذ...",
  onConfirm,
  onCancel
}: Props) {
  if (!open) return null;

  return (
    <div className="modal-backdrop confirm-modal-backdrop" role="presentation">
      <div
        className="card modal-panel confirm-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        aria-describedby="confirm-modal-desc"
      >
        <div className="confirm-modal__icon" aria-hidden>
          !
        </div>
        <h3 id="confirm-modal-title">{title}</h3>
        <p id="confirm-modal-desc" className="confirm-modal__text">
          {description}
        </p>
        {details && details.length > 0 ? (
          <div className="confirm-modal__details">
            {details.map((row) => (
              <div key={row.label}>
                <span>{row.label}</span>
                <strong>{row.value}</strong>
              </div>
            ))}
          </div>
        ) : null}
        <div className="confirm-modal__actions">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={onConfirm}>
            {busy ? (
              <>
                <span className="spinner-inline" aria-hidden />
                {busyLabel}
              </>
            ) : (
              confirmLabel
            )}
          </button>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

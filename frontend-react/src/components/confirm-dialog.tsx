interface ConfirmDialogProps {
  confirmLabel: string;
  description: string;
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
}

export function ConfirmDialog({
  confirmLabel,
  description,
  isOpen,
  onCancel,
  onConfirm,
  title,
}: ConfirmDialogProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        aria-describedby="confirm-dialog-description"
        aria-labelledby="confirm-dialog-title"
        aria-modal="true"
        className="dialog"
        role="dialog"
      >
        <p className="eyebrow">Please confirm</p>
        <h3 id="confirm-dialog-title">{title}</h3>
        <p className="muted-text" id="confirm-dialog-description">
          {description}
        </p>

        <div className="dialog__actions">
          <button
            className="button button--soft"
            onClick={onCancel}
            type="button"
          >
            Keep book
          </button>
          <button
            className="button button--danger"
            onClick={onConfirm}
            type="button"
          >
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

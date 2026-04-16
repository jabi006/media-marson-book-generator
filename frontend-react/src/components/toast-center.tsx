export interface ToastItem {
  id: number;
  message: string;
  title: string;
  tone: 'success' | 'error';
}

interface ToastCenterProps {
  onClose: (id: number) => void;
  toasts: ToastItem[];
}

export function ToastCenter({ onClose, toasts }: ToastCenterProps) {
  return (
    <div aria-live="polite" className="toast-center">
      {toasts.map((toast) => (
        <article
          className={`toast toast--${toast.tone}`}
          key={toast.id}
          role="status"
        >
          <div className="toast__content">
            <strong>{toast.title}</strong>
            <p>{toast.message}</p>
          </div>
          <button
            aria-label={`Close ${toast.title.toLowerCase()} message`}
            className="toast__close"
            onClick={() => onClose(toast.id)}
            type="button"
          >
            x
          </button>
        </article>
      ))}
    </div>
  );
}

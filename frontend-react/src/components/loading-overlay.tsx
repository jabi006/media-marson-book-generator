interface LoadingOverlayProps {
  isVisible: boolean;
  message: string;
}

export function LoadingOverlay({
  isVisible,
  message,
}: LoadingOverlayProps) {
  if (!isVisible) {
    return null;
  }

  return (
    <div className="loading-overlay" role="status" aria-live="polite">
      <div className="loading-card">
        <div aria-hidden="true" className="loading-spinner" />
        <strong>Please wait</strong>
        <p>{message}</p>
      </div>
    </div>
  );
}

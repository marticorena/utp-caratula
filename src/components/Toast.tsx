import { Check, X } from 'lucide-react';

export interface ToastProps {
  message: string;
  onClose: () => void;
}

/** Render a dismissible live-region notification. */
export function Toast({ message, onClose }: ToastProps) {
  if (!message) return null;

  return (
    <div className="toast" role="status">
      <Check size={17} />
      {message}
      <button
        className="icon-button"
        aria-label="Cerrar aviso"
        onClick={onClose}
      >
        <X size={15} />
      </button>
    </div>
  );
}

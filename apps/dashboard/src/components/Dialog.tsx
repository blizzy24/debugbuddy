import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  /** When false, Escape and backdrop clicks do nothing (used for the one-time key reveal). */
  dismissible?: boolean;
  size?: 'md' | 'lg';
}

export function Dialog({ open, onClose, title, description, children, dismissible = true, size = 'md' }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        if (dismissible) onClose();
      }}
      onClick={(e) => {
        if (dismissible && e.target === ref.current) onClose();
      }}
      className={`w-[calc(100%-2rem)] ${size === 'lg' ? 'max-w-xl' : 'max-w-md'} rounded-2xl border border-stone-200 bg-white p-0 text-ink shadow-lift backdrop:bg-ink/40 backdrop:backdrop-blur-[2px] open:animate-fade-in motion-reduce:open:animate-none`}
    >
      {open && (
        <div className="p-6">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          {description && <div className="mt-1.5 text-sm leading-6 text-stone-600">{description}</div>}
          <div className="mt-5">{children}</div>
        </div>
      )}
    </dialog>
  );
}

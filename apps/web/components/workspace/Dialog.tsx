'use client';

import { useEffect, useId, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import { CloseIcon } from './icons';
import { FOCUS_RING } from './styles';

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  busy?: boolean;
  size?: 'md' | 'lg';
  initialFocusRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
};

export default function Dialog({
  open,
  onClose,
  title,
  description,
  busy = false,
  size = 'md',
  initialFocusRef,
  children,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
      document.body.style.overflow = 'hidden';
      initialFocusRef?.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }

    return () => {
      if (dialog.open) dialog.close();
      document.body.style.overflow = '';
    };
  }, [open, initialFocusRef]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const handleCancel = (event: Event) => {
      event.preventDefault();
      if (!busy) onClose();
    };
    dialog.addEventListener('cancel', handleCancel);
    return () => dialog.removeEventListener('cancel', handleCancel);
  }, [busy, onClose]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClick={event => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
      className={`m-auto max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-drift-line bg-white p-0 text-drift-ink shadow-[0_30px_90px_rgba(15,23,42,0.25)] backdrop:bg-slate-950/40 backdrop:backdrop-blur-[2px] ${
        size === 'lg' ? 'max-w-xl' : 'max-w-lg'
      }`}
    >
      <div className="max-h-[calc(100dvh-2rem)] overflow-y-auto p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold tracking-[-0.02em] text-drift-ink">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-1.5 text-sm leading-6 text-drift-body">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close dialog"
            className={`-mr-1 -mt-1 grid size-9 shrink-0 place-items-center rounded-lg text-drift-muted transition hover:bg-slate-100 hover:text-drift-ink disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS_RING}`}
          >
            <CloseIcon />
          </button>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </dialog>
  );
}

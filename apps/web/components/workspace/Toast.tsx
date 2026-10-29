'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertIcon, CheckIcon, CloseIcon, SparkIcon } from './icons';
import { FOCUS_RING } from './styles';

type ToastKind = 'success' | 'error' | 'info';
type ToastItem = { id: number; kind: ToastKind; message: string };

type ToastContextValue = {
  push: (toast: { kind: ToastKind; message: string }) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const nextId = useRef(0);

  const remove = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setToasts(items => items.filter(item => item.id !== id));
  }, []);

  const push = useCallback(
    ({ kind, message }: { kind: ToastKind; message: string }) => {
      const id = ++nextId.current;
      setToasts(items => [...items.slice(-3), { id, kind, message }]);
      timers.current.set(
        id,
        setTimeout(() => remove(id), kind === 'error' ? 7000 : 5000),
      );
    },
    [remove],
  );

  useEffect(
    () => () => {
      for (const timer of timers.current.values()) clearTimeout(timer);
      timers.current.clear();
    },
    [],
  );

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-end gap-2 sm:left-auto sm:w-96"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map(toast => (
          <div
            key={toast.id}
            className="pointer-events-auto flex w-full items-start gap-3 rounded-xl border border-drift-line bg-white px-4 py-3 text-sm text-drift-ink shadow-[0_16px_40px_rgba(15,23,42,0.14)]"
          >
            <span
              className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full ${
                toast.kind === 'success'
                  ? 'bg-emerald-50 text-emerald-600'
                  : toast.kind === 'error'
                    ? 'bg-red-50 text-red-600'
                    : 'bg-drift-accent-soft text-drift-accent'
              }`}
            >
              {toast.kind === 'success' ? (
                <CheckIcon className="size-3.5" />
              ) : toast.kind === 'error' ? (
                <AlertIcon className="size-3.5" />
              ) : (
                <SparkIcon className="size-3.5" />
              )}
            </span>
            <span className="min-w-0 flex-1 leading-5">{toast.message}</span>
            <button
              type="button"
              onClick={() => remove(toast.id)}
              aria-label="Dismiss notification"
              className={`-mr-1 grid size-6 shrink-0 place-items-center rounded-md text-drift-muted transition hover:bg-slate-100 hover:text-drift-ink ${FOCUS_RING}`}
            >
              <CloseIcon className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
}

'use client';

/**
 * ToastContext
 *
 * The place failures become visible. Contexts that save in the background have
 * no UI of their own, so without this a rejected save is only a console line —
 * the user goes on believing their change was stored.
 */

import React, { createContext, useCallback, useContext, useMemo, useRef, useState, ReactNode } from 'react';
import './Toast.scss';

export type ToastTone = 'error' | 'success';

export type Toast = {
  id: number;
  message: string;
  tone: ToastTone;
};

type ToastContextType = {
  toasts: Toast[];
  /** Shows a message; returns its id so it can be dismissed early. */
  showToast: (message: string, tone?: ToastTone) => number;
  dismissToast: (id: number) => void;
};

const ToastContext = createContext<ToastContextType | null>(null);

/** Errors stay long enough to read; confirmations get out of the way. */
const TONE_DURATION_MS: Record<ToastTone, number> = {
  error: 8000,
  success: 3000,
};

export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismissToast = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts(current => current.filter(toast => toast.id !== id));
  }, []);

  const showToast = useCallback((message: string, tone: ToastTone = 'error') => {
    const id = nextId.current++;
    setToasts(current => {
      // The same failure repeating (an autosave retrying, say) should not stack.
      const withoutDuplicate = current.filter(toast => toast.message !== message);
      return [...withoutDuplicate, { id, message, tone }];
    });

    timers.current.set(
      id,
      setTimeout(() => {
        timers.current.delete(id);
        setToasts(current => current.filter(toast => toast.id !== id));
      }, TONE_DURATION_MS[tone])
    );

    return id;
  }, []);

  const value = useMemo(
    () => ({ toasts, showToast, dismissToast }),
    [toasts, showToast, dismissToast]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast toast-${toast.tone}`}>
            <span className="toast-message">{toast.message}</span>
            <button
              type="button"
              className="toast-dismiss"
              onClick={() => dismissToast(toast.id)}
              aria-label="Dismiss notification"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

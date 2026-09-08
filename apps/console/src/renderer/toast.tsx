/**
 * Toast/snackbar system — the replacement for the blocking `alert()` calls.
 * Stacked, auto-dismissing, keyboard-dismissible, with an optional action.
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { IconCheck, IconClock, IconClose, IconInfo } from './icons';

type ToastKind = 'success' | 'error' | 'info' | 'warn';

export interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  detail?: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastCtx {
  push(t: Omit<Toast, 'id'>): void;
}

const Ctx = createContext<ToastCtx>({ push: () => undefined });

let seq = 0;

const KIND_ICON: Record<ToastKind, ReactNode> = {
  success: <IconCheck size={16} />,
  error: <IconClose size={16} />,
  info: <IconInfo size={16} />,
  warn: <IconClock size={16} />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const push = useCallback(
    (t: Omit<Toast, 'id'>) => {
      const id = `toast-${++seq}`;
      setToasts((prev) => [...prev, { ...t, id }]);
      const timer = setTimeout(() => dismiss(id), t.kind === 'error' ? 9000 : 4500);
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  const ctx = useMemo(() => ({ push }), [push]);

  return (
    <Ctx.Provider value={ctx}>
      {children}
      <div className="toast-host" role="status" aria-live="polite">
        {toasts.map((t) => {
          const Icon = KIND_ICON[t.kind];
          return (
            <div key={t.id} className={`toast toast-${t.kind}`}>
              {KIND_ICON[t.kind]}
              <div className="toast-body">
                <div className="toast-title">{t.title}</div>
                {t.detail && <div className="toast-detail">{t.detail}</div>}
                {t.actionLabel && t.onAction && (
                  <button
                    className="toast-action"
                    onClick={() => {
                      t.onAction?.();
                      dismiss(t.id);
                    }}
                  >
                    {t.actionLabel}
                  </button>
                )}
              </div>
              <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss">
                <IconClose size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastCtx {
  return useContext(Ctx);
}

'use client';

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  success: (message: string, durationMs?: number) => void;
  error: (message: string, durationMs?: number) => void;
  info: (message: string, durationMs?: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

// Errors get more time on screen than success/info -- they're more likely
// to need actually reading, not just a glance.
const DEFAULT_DURATION_MS: Record<ToastType, number> = { success: 4000, info: 4000, error: 6500 };

const TYPE_STYLES: Record<ToastType, { color: string; icon: ReactNode }> = {
  success: {
    color: 'var(--success)',
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M4 12l5 5L20 6" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  error: {
    color: 'var(--danger)',
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M12 8v5M12 16.5h.01" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    ),
  },
  info: {
    color: 'var(--accent)',
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M12 11v5.5M12 7.5h.01" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    ),
  },
};

/**
 * App-wide toast notifications. Mounted once in app/layout.tsx; call
 * useToast() from anywhere under it. Not specific to sign-in -- reusable
 * for any success/error/info feedback across hashpass.club.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (type: ToastType, message: string, durationMs?: number) => {
      const id = ++idRef.current;
      setToasts((prev) => [...prev, { id, type, message }]);
      const duration = durationMs ?? DEFAULT_DURATION_MS[type];
      if (duration > 0) {
        window.setTimeout(() => remove(id), duration);
      }
    },
    [remove],
  );

  const value: ToastContextValue = {
    success: (message, durationMs) => push('success', message, durationMs),
    error: (message, durationMs) => push('error', message, durationMs),
    info: (message, durationMs) => push('info', message, durationMs),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        style={{
          position: 'fixed',
          top: 'max(16px, env(safe-area-inset-top))',
          right: 16,
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          width: 'min(360px, calc(100vw - 32px))',
          pointerEvents: 'none',
        }}
      >
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onDismiss={() => remove(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const { color, icon } = TYPE_STYLES[toast.type];

  return (
    <div
      role="status"
      style={{
        pointerEvents: 'auto',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '12px 12px 12px 14px',
        borderRadius: 14,
        background: 'var(--bg-surface-raised)',
        border: '1px solid var(--border-strong)',
        borderLeft: `3px solid ${color}`,
        boxShadow: 'var(--shadow-lg)',
        animation: 'toast-in 0.22s cubic-bezier(0.22,1,0.36,1) both',
      }}
    >
      <div
        style={{
          width: 20,
          height: 20,
          marginTop: 1,
          borderRadius: '50%',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color,
        }}
        aria-hidden
      >
        {icon}
      </div>
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.45, color: 'var(--text-primary)', flex: 1 }}>
        {toast.message}
      </p>
      <button
        onClick={onDismiss}
        aria-label="Dismiss notification"
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text-faint)',
          padding: 4,
          marginTop: -2,
          lineHeight: 0,
          flexShrink: 0,
        }}
      >
        <svg width="11" height="11" viewBox="0 0 14 14" fill="none" aria-hidden>
          <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(-8px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a <ToastProvider>');
  return ctx;
}

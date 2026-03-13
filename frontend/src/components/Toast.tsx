"use client";

import React, { createContext, useCallback, useContext, useState, useRef, useEffect } from "react";
import { explorerUrl } from "@/lib/constants";

type ToastType = "success" | "error" | "info";

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  txSig?: string;
  exiting?: boolean;
}

interface ToastContextValue {
  success: (message: string, txSig?: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue>({
  success: () => {},
  error: () => {},
  info: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timeoutRefs = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 150);
  }, []);

  const add = useCallback(
    (type: ToastType, message: string, txSig?: string) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setToasts((prev) => [...prev, { id, type, message, txSig }]);
      const timeout = setTimeout(() => remove(id), 6000);
      timeoutRefs.current.set(id, timeout);
    },
    [remove]
  );

  useEffect(() => {
    return () => {
      timeoutRefs.current.forEach((t) => clearTimeout(t));
    };
  }, []);

  const value: ToastContextValue = {
    success: (msg, txSig) => add("success", msg, txSig),
    error: (msg) => add("error", msg),
    info: (msg) => add("info", msg),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-md">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onClose={() => remove(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const typeStyles: Record<ToastType, string> = {
  success: "border-emerald-500/30 bg-emerald-500/10",
  error: "border-red-500/30 bg-red-500/10",
  info: "border-cyan-500/30 bg-cyan-500/10",
};

const typeIcons: Record<ToastType, string> = {
  success: "\u2713",
  error: "\u2717",
  info: "\u24D8",
};

const typeTextColors: Record<ToastType, string> = {
  success: "text-emerald-400",
  error: "text-red-400",
  info: "text-cyan-400",
};

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  return (
    <div
      className={`
        ${toast.exiting ? "toast-exit" : "toast-enter"}
        flex items-start gap-3 px-4 py-3 rounded-lg border backdrop-blur-sm
        ${typeStyles[toast.type]}
      `}
    >
      <span className={`text-lg font-bold ${typeTextColors[toast.type]} mt-px`}>
        {typeIcons[toast.type]}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-text-primary">{toast.message}</p>
        {toast.txSig && (
          <a
            href={explorerUrl(toast.txSig, "tx")}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-cyan-400 hover:text-cyan-300 font-mono mt-1 block truncate"
          >
            {toast.txSig}
          </a>
        )}
      </div>
      <button
        onClick={onClose}
        className="text-text-muted hover:text-text-primary text-sm cursor-pointer flex-shrink-0"
      >
        \u2715
      </button>
    </div>
  );
}

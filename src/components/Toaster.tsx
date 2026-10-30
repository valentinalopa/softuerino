"use client";

import { useEffect, useState } from "react";
import { CircleCheck, X } from "lucide-react";
import { dismissToast, subscribeToasts, type Toast } from "@/lib/toast";

// Conferme in basso (al centro su telefono, a destra su desktop), annunciate
// anche agli screen reader.
export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => subscribeToasts(setToasts), []);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-4 z-[100] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:items-end"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className="pointer-events-auto flex w-full max-w-sm animate-in items-center gap-2.5 rounded-xl border border-surface-border bg-card px-4 py-3 text-sm text-foreground shadow-lg fade-in slide-in-from-bottom-2 sm:w-auto"
        >
          <CircleCheck className="size-4.5 shrink-0 text-success" aria-hidden />
          <span className="flex-1">{t.message}</span>
          <button
            type="button"
            onClick={() => dismissToast(t.id)}
            aria-label="Chiudi"
            className="-mr-1 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

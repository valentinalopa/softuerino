"use client";

import { useState, useTransition } from "react";
import { updateTaskStatus } from "@/lib/actions";
import { TASK_STATUSES, TASK_STATUS_LABELS, type TaskStatus } from "@/lib/constants";
import { NativeSelect } from "@/components/ui/native-select";
import { TONE_SOFT, type Tone } from "@/lib/tones";
import { cn } from "@/lib/utils";

// Un colore per stato, per distinguerli a colpo d'occhio nella tabella.
export const TASK_STATUS_TONES: Record<TaskStatus, Tone> = {
  not_started: "neutral",
  in_progress: "accent",
  in_pausa: "aqua",
  done: "success",
};

export function TaskStatusSelect({
  taskId,
  status,
}: {
  taskId: string;
  status: string;
}) {
  const [value, setValue] = useState(status);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-1">
      {/* Select a forma di badge: resta modificabile dalla riga. */}
      <NativeSelect
        aria-label="Stato"
        className={cn(
          "h-7 rounded-full border-transparent pr-7 pl-2.5 text-xs font-semibold shadow-none",
          TONE_SOFT[TASK_STATUS_TONES[value as TaskStatus] ?? "neutral"]
        )}
        iconClassName="right-2 size-3.5 text-current opacity-70"
        value={value}
        disabled={isPending}
        onChange={(event) => {
          const next = event.target.value as TaskStatus;
          const previous = value;
          setError(null);
          setValue(next);
          startTransition(async () => {
            try {
              const result = await updateTaskStatus(taskId, next);
              if (result?.error) {
                setValue(previous);
                setError(result.error);
              }
            } catch {
              setValue(previous);
              setError("Errore imprevisto");
            }
          });
        }}
      >
        {TASK_STATUSES.map((s) => (
          <option key={s} value={s}>
            {TASK_STATUS_LABELS[s]}
          </option>
        ))}
      </NativeSelect>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

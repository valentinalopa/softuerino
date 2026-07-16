"use client";

import { useState, useTransition } from "react";
import { updateTaskStatus } from "@/lib/actions";
import { TASK_STATUSES, TASK_STATUS_LABELS, type TaskStatus } from "@/lib/constants";
import { NativeSelect } from "@/components/ui/native-select";

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
      <NativeSelect
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

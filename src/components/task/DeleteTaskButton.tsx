"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteTask } from "@/lib/actions";
import { Button } from "@/components/ui/button";

export function DeleteTaskButton({ taskId }: { taskId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        size="icon"
        variant="ghost"
        disabled={pending}
        aria-label="Elimina task"
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              const result = await deleteTask(taskId);
              if (result?.error) {
                setError(result.error);
              }
            } catch {
              setError("Errore imprevisto");
            }
          });
        }}
      >
        <Trash2 className="size-4" />
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { setDayNotWorked } from "@/lib/actions";
import { Checkbox } from "@/components/ui/checkbox";
import { unexpectedErrorMessage } from "@/lib/action-error";
import { toast } from "@/lib/toast";

// "Oggi non ho lavorato": la giornata non va registrata, quindi niente
// promemoria serale né avviso di ore mancanti. Si toglie spuntandola di
// nuovo, o registrando delle ore.
export function DayNotWorkedToggle({
  userId,
  dateValue,
  isToday,
  checked,
}: {
  userId: string;
  dateValue: string;
  isToday: boolean;
  checked: boolean;
}) {
  const [value, setValue] = useState(checked);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(next: boolean) {
    setValue(next);
    setError(null);
    const formData = new FormData();
    formData.set("userId", userId);
    formData.set("date", dateValue);
    formData.set("notWorked", next ? "1" : "0");
    startTransition(async () => {
      try {
        const result = await setDayNotWorked(formData);
        if (result?.error) {
          setValue(!next);
          setError(result.error);
          return;
        }
        toast(
          next
            ? "Segnata come giornata non lavorata"
            : "Giornata di nuovo da registrare",
        );
      } catch (err) {
        setValue(!next);
        setError(unexpectedErrorMessage(err));
      }
    });
  }

  return (
    <div className="space-y-1.5">
      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-surface-border bg-card px-4 py-3 text-sm">
        <Checkbox
          checked={value}
          onCheckedChange={(next) => toggle(next === true)}
          disabled={pending}
          className="mt-0.5"
        />
        <span>
          <span className="block font-medium text-foreground">
            {isToday
              ? "Oggi non ho lavorato"
              : "Non ho lavorato in questa giornata"}
          </span>
          <span className="block text-xs text-muted-foreground">
            Niente ore da registrare e niente promemoria. Se è ferie, permesso o
            malattia, meglio fare una richiesta.
          </span>
        </span>
      </label>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

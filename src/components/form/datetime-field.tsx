"use client";

import { useState } from "react";
import { format, parse } from "date-fns";
import { it } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { TimeField } from "@/components/form/time-field";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const DEFAULT_TIME = "09:00";

export function DateTimeField({
  name,
  id,
  defaultValue,
  placeholder = "Seleziona data",
  className,
  onValueChange,
}: {
  name: string;
  id?: string;
  defaultValue?: string;
  placeholder?: string;
  className?: string;
  // Valore "yyyy-MM-ddTHH:mm" ad ogni modifica (vuoto finché manca la data).
  onValueChange?: (value: string) => void;
}) {
  const [defaultDatePart, defaultTimePart] = defaultValue
    ? defaultValue.split("T")
    : [undefined, undefined];

  const [date, setDate] = useState<Date | undefined>(
    defaultDatePart
      ? parse(defaultDatePart, "yyyy-MM-dd", new Date())
      : undefined
  );
  const [time, setTime] = useState(defaultTimePart ?? DEFAULT_TIME);
  const [open, setOpen] = useState(false);

  const isoValue = date ? `${format(date, "yyyy-MM-dd")}T${time}` : "";

  function toIso(nextDate: Date | undefined, nextTime: string) {
    return nextDate ? `${format(nextDate, "yyyy-MM-dd")}T${nextTime}` : "";
  }

  return (
    <>
      <input type="hidden" name={name} value={isoValue} />
      {/* La data si allarga per riempire lo spazio disponibile, l'ora resta
          compatta: niente overflow orizzontale nei contenitori stretti. */}
      <div className="flex w-full items-center gap-1.5">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={
              <Button
                type="button"
                id={id}
                variant="outline"
                className={cn(
                  "min-w-0 flex-1 justify-start gap-2 font-normal",
                  !date && "text-muted-foreground",
                  className
                )}
              >
                <CalendarIcon className="size-4 shrink-0" />
                {date ? format(date, "dd/MM/yyyy") : placeholder}
              </Button>
            }
          />
          <PopoverContent className="w-auto p-0">
            <Calendar
              mode="single"
              selected={date}
              defaultMonth={date}
              locale={it}
              onSelect={(next) => {
                setDate(next);
                setOpen(false);
                onValueChange?.(toIso(next, time));
              }}
            />
          </PopoverContent>
        </Popover>
        <TimeField
          value={time}
          onChange={(next) => {
            setTime(next);
            onValueChange?.(toIso(date, next));
          }}
        />
      </div>
    </>
  );
}

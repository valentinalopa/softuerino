"use client";

import { useState } from "react";
import { format, parse } from "date-fns";
import { it } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export function DateField({
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
  onValueChange?: (date: Date | undefined) => void;
}) {
  const [date, setDate] = useState<Date | undefined>(
    defaultValue ? parse(defaultValue, "yyyy-MM-dd", new Date()) : undefined
  );
  const [open, setOpen] = useState(false);

  return (
    <>
      <input
        type="hidden"
        name={name}
        value={date ? format(date, "yyyy-MM-dd") : ""}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              id={id}
              variant="outline"
              className={cn(
                "w-[10rem] justify-start gap-2 font-normal",
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
              onValueChange?.(next);
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </>
  );
}

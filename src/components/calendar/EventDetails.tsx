"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { deleteEvent } from "@/lib/actions";
import { EVENT_TYPE_LABELS } from "@/lib/constants";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatFullDate, formatTime } from "@/lib/calendar-utils";
import { eventTypeStyle, type CalendarEventData } from "./types";

export function EventDetails({
  event,
  onClose,
  canDelete,
}: {
  event: CalendarEventData;
  onClose: () => void;
  canDelete: boolean;
}) {
  const [error, setError] = useState<string | null>(null);

  return (
    <Card className="w-72 shrink-0 self-start">
      <CardHeader>
        <CardTitle>{event.title}</CardTitle>
        <CardAction>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3">
        <Badge variant="outline" className={eventTypeStyle(event.type).chip}>
          {EVENT_TYPE_LABELS[event.type as keyof typeof EVENT_TYPE_LABELS] ??
            event.type}
        </Badge>
        <p className="text-sm text-muted-foreground capitalize">
          {formatFullDate(event.startAt)}
          <br />
          {formatTime(event.startAt)} – {formatTime(event.endAt)}
          {event.location ? ` · ${event.location}` : ""}
        </p>
        {event.description && <p className="text-sm">{event.description}</p>}
        {event.participants.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Partecipanti:{" "}
            {event.participants.map((p) => p.user.name).join(", ")}
          </p>
        )}
        {canDelete && (
          <form
            action={async () => {
              setError(null);
              const result = await deleteEvent(event.id);
              if (result?.error) {
                setError(result.error);
                return;
              }
              onClose();
            }}
          >
            <Button type="submit" variant="destructive" size="sm">
              Elimina
            </Button>
            {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
          </form>
        )}
      </CardContent>
    </Card>
  );
}

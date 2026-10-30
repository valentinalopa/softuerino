"use client";

import { CalendarPlus, ExternalLink, Pencil, X } from "lucide-react";
import { googleCalendarUrl } from "@/lib/ics";
import { deleteEvent } from "@/lib/actions";
import { EVENT_TYPE_LABELS } from "@/lib/constants";
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { formatFullDate, formatTime, isSameDay } from "@/lib/calendar-utils";
import { eventTypeStyle, type CalendarEventData } from "./types";

// Dettaglio di un evento: riquadro accanto al calendario su schermi larghi,
// popup a tutta larghezza su mobile (inDialog).
export function EventDetails({
  event,
  onClose,
  onEdit,
  canManage,
  inDialog = false,
}: {
  event: CalendarEventData;
  onClose: () => void;
  onEdit: () => void;
  // Modifica ed eliminazione: admin, chi ha creato l'evento, o un partecipante.
  canManage: boolean;
  inDialog?: boolean;
}) {
  return (
    <Card
      className={
        inDialog ? "w-full gap-4 rounded-none border-0 bg-transparent py-0 shadow-none [--card-spacing:0]" : "w-72 shrink-0 self-start"
      }
    >
      <CardHeader>
        <CardTitle className="pr-8 break-words">{event.title}</CardTitle>
        {!inDialog && (
          <CardAction>
            <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="Chiudi">
              <X className="size-4" />
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <Badge variant={eventTypeStyle(event.type).tone}>
          {EVENT_TYPE_LABELS[event.type as keyof typeof EVENT_TYPE_LABELS] ??
            event.type}
        </Badge>
        <p className="text-sm text-muted-foreground">
          <span className="capitalize">{formatFullDate(event.startAt)}</span>
          {isSameDay(event.startAt, event.endAt) ? (
            <>
              <br />
              {formatTime(event.startAt)} – {formatTime(event.endAt)}
            </>
          ) : (
            // Evento su più giorni: serve anche la data di fine.
            <>
              , {formatTime(event.startAt)} –
              <br />
              <span className="capitalize">{formatFullDate(event.endAt)}</span>, {formatTime(event.endAt)}
            </>
          )}
        </p>
        {event.location && <p className="text-sm break-words text-muted-foreground">{event.location}</p>}
        {event.description && <p className="text-sm break-words whitespace-pre-line">{event.description}</p>}
        <div className="flex flex-wrap gap-2">
          <a href={`/api/calendario/${event.id}/ics`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <CalendarPlus className="size-4" />
            Aggiungi al calendario
          </a>
          <a
            href={googleCalendarUrl(event)}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            Google Calendar
            <ExternalLink className="size-3.5" />
          </a>
        </div>
        {event.participants.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Partecipanti:{" "}
            {event.participants.map((p) => p.user.name).join(", ")}
          </p>
        )}
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onEdit}>
              <Pencil className="size-4" />
              Modifica
            </Button>
            {/* Stessa conferma dei task: l'eliminazione vale per tutti i partecipanti. */}
            <ConfirmDeleteButton
              successMessage="Evento eliminato"
              withText
              label={`Elimina ${event.title}`}
              title={`Eliminare "${event.title}"?`}
              description="L'evento viene eliminato dal calendario di tutti i partecipanti. L'operazione non è reversibile."
              onConfirm={async () => {
                const result = await deleteEvent(event.id);
                if (!result?.error) onClose();
                return result;
              }}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

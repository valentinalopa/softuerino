import { cn } from "@/lib/utils";
import {
  LEAVE_STATUS_LABELS,
  PRESENCE_SLOT_LABELS,
  type PresenceMode,
  type PresenceSlot,
} from "@/lib/constants";
import type { DayEntry, HourlyLeaveInfo } from "@/lib/attendance-utils";
import { formatAmount, formatHourlySlot, formatTimeRange } from "@/lib/leave-format";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  LEAVE_STYLES,
  MODE_STYLES,
  NEUTRAL_CHIP,
  HOURLY_STYLES,
} from "./attendance-styles";

export function AttendanceDayContent({
  entry,
  interactive = false,
  isSlotSelected,
  onToggleSlot,
}: {
  entry?: DayEntry;
  interactive?: boolean;
  isSlotSelected?: (slot: PresenceSlot) => boolean;
  onToggleSlot?: (slot: PresenceSlot, mode: PresenceMode) => void;
}) {
  if (!entry) return null;

  if (entry.leave) {
    const style = LEAVE_STYLES[entry.leave.type];
    const Icon = style.icon;
    const pending = entry.leave.status === "pending";
    return (
      <div
        className={cn(
          "flex h-full flex-col items-center justify-center gap-1 rounded-lg border",
          pending ? NEUTRAL_CHIP : style.chip
        )}
      >
        <Icon className="size-4" />
        <span className="text-xs font-medium">{style.title}</span>
        {pending && <span className="text-3xs">In attesa</span>}
      </div>
    );
  }

  const giornataIntera = entry.presences.find(
    (p) => p.slot === "giornata_intera"
  );
  const mattina = entry.presences.find((p) => p.slot === "mattina");
  const pomeriggio = entry.presences.find((p) => p.slot === "pomeriggio");

  type PresenceBlockData = {
    key: string;
    mode: PresenceMode;
    slot: PresenceSlot;
  };

  const blocks: PresenceBlockData[] = [];
  if (giornataIntera) {
    blocks.push({ key: "full", mode: giornataIntera.mode, slot: "giornata_intera" });
  } else {
    if (mattina) blocks.push({ key: "am", mode: mattina.mode, slot: "mattina" });
    if (pomeriggio)
      blocks.push({ key: "pm", mode: pomeriggio.mode, slot: "pomeriggio" });
  }

  return (
    <div className="flex h-full flex-col gap-1">
      {blocks.map((block) => (
        <PresenceBlock
          key={block.key}
          mode={block.mode}
          slot={block.slot}
          interactive={interactive}
          selected={interactive ? Boolean(isSlotSelected?.(block.slot)) : false}
          onToggle={
            interactive ? () => onToggleSlot?.(block.slot, block.mode) : undefined
          }
        />
      ))}
      {entry.hourly && <HourlyLeaveChip hourly={entry.hourly} />}
    </div>
  );
}

function PresenceBlock({
  mode,
  slot,
  interactive = false,
  selected = false,
  onToggle,
}: {
  mode: PresenceMode;
  slot: PresenceSlot;
  interactive?: boolean;
  selected?: boolean;
  onToggle?: () => void;
}) {
  const style = MODE_STYLES[mode];
  const Icon = style.icon;
  const content = (
    <>
      <Icon className="size-3.5 shrink-0" />
      <span className="leading-tight">
        {style.title} · {PRESENCE_SLOT_LABELS[slot]}
      </span>
    </>
  );

  if (interactive) {
    return (
      <button
        type="button"
        aria-pressed={selected}
        onClick={(e) => {
          e.stopPropagation();
          onToggle?.();
        }}
        className={cn(
          "flex flex-1 cursor-pointer flex-col items-start gap-1 rounded-sm border px-2 py-1.5 text-left text-xs font-medium outline-none transition-colors hover:brightness-95",
          style.chip,
          selected && "ring-2 ring-inset ring-primary"
        )}
      >
        {content}
      </button>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-1 flex-col items-start gap-1 rounded-sm border px-2 py-1.5 text-xs font-medium",
        style.chip
      )}
    >
      {content}
    </div>
  );
}

// Assenza a ore: il blocco mostra la fascia se c'è; al clic si aprono i
// dettagli (fascia, ore, stato). I clic restano qui: la cella del calendario
// ha la sua azione (selezione dei giorni), e i portal risalgono fin lì.
function HourlyLeaveChip({ hourly }: { hourly: HourlyLeaveInfo }) {
  const style = HOURLY_STYLES[hourly.type];
  const Icon = style.icon;
  const range = formatTimeRange(hourly);
  const stop = (event: React.SyntheticEvent) => event.stopPropagation();
  return (
    <Popover>
      <PopoverTrigger
        onClick={stop}
        onKeyDown={stop}
        className={cn(
          "flex w-full cursor-pointer items-center justify-center gap-1 rounded-sm border px-1.5 py-1 text-2xs font-medium outline-none transition-colors hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring",
          hourly.status === "pending" ? NEUTRAL_CHIP : style.chip
        )}
      >
        <Icon className="size-3" />
        {style.title} {formatHourlySlot(hourly)}
      </PopoverTrigger>
      <PopoverContent className="w-60" onClick={stop} onKeyDown={stop}>
        <PopoverHeader>
          <PopoverTitle className="flex items-center gap-1.5">
            <Icon className="size-4" />
            {style.title}
          </PopoverTitle>
        </PopoverHeader>
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Fascia</dt>
            <dd className="text-foreground">{range ?? "non indicata"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Durata</dt>
            <dd className="text-foreground">
              {formatAmount(hourly.hours)} {hourly.hours === 1 ? "ora" : "ore"}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Stato</dt>
            <dd className="text-foreground">{LEAVE_STATUS_LABELS[hourly.status]}</dd>
          </div>
        </dl>
        {!range && (
          <p className="text-xs text-muted-foreground">
            Richiesta fatta prima che si potesse indicare la fascia oraria.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

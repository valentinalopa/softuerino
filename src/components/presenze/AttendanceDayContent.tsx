import { Clock3 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PRESENCE_SLOT_LABELS,
  type PresenceMode,
  type PresenceSlot,
} from "@/lib/constants";
import type { DayEntry } from "@/lib/attendance-utils";
import {
  LEAVE_STYLES,
  MODE_STYLES,
  NEUTRAL_CHIP,
  PERMESSO_CHIP,
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
        {pending && <span className="text-[10px]">In attesa</span>}
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
      {entry.permesso && (
        <div
          className={cn(
            "flex items-center justify-center gap-1 rounded-[0.4rem] border px-1.5 py-1 text-[11px] font-medium",
            entry.permesso.status === "pending" ? NEUTRAL_CHIP : PERMESSO_CHIP
          )}
        >
          <Clock3 className="size-3" />
          Permesso {entry.permesso.hours}h
        </div>
      )}
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
          "flex flex-1 cursor-pointer flex-col items-start gap-1 rounded-[0.4rem] border px-2 py-1.5 text-left text-xs font-medium outline-none transition-colors hover:brightness-95",
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
        "flex flex-1 flex-col items-start gap-1 rounded-[0.4rem] border px-2 py-1.5 text-xs font-medium",
        style.chip
      )}
    >
      {content}
    </div>
  );
}

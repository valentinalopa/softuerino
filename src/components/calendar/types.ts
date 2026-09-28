import { TONE_CHIP, TONE_DOT, type Tone } from "@/lib/tones";

export type CalendarEventData = {
  id: string;
  title: string;
  type: string;
  startAt: Date;
  endAt: Date;
  location: string | null;
  description: string | null;
  createdById: string | null;
  participants: { user: { id: string; name: string } }[];
};

const EVENT_TYPE_TONES: Record<string, Tone> = {
  riunione: "aqua",
  shooting: "accent",
  altro: "neutral",
};

export function eventTypeStyle(type: string) {
  const tone = EVENT_TYPE_TONES[type] ?? "neutral";
  return { tone, chip: TONE_CHIP[tone], dot: TONE_DOT[tone] };
}

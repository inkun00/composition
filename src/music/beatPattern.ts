import { isBeatInstrumentId, type BeatInstrumentId } from "./beatInstruments";
import type { Meter } from "./meter";

export type BeatPatternEvent = Readonly<{
  id: string;
  instrumentId: BeatInstrumentId;
  measureIndex: number;
  offsetBeats: number;
}>;

export const BEAT_PATTERN_MEASURES = 4;
export const MAX_BEAT_PATTERN_EVENTS = 288;
export const MAX_BEAT_PATTERN_INSTRUMENTS = 3;
export type BeatPatternSubdivision = 1 | 2 | 4;

export function beatPatternStep(meter: Meter): number {
  return 4 / meter.beatUnit;
}

export function beatPatternMeasureBeats(meter: Meter): number {
  return meter.beats * beatPatternStep(meter);
}

export function beatPatternSlotOffset(
  meter: Meter,
  slotIndex: number,
  subdivision: BeatPatternSubdivision = 1
): number {
  return slotIndex * beatPatternStep(meter) / subdivision;
}

function isAlignedOffset(offsetBeats: number, meter: Meter): boolean {
  const step = beatPatternStep(meter) / 4;
  return Math.abs(offsetBeats / step - Math.round(offsetBeats / step)) < .0001;
}

export function beatPatternSubdivision(
  events: readonly BeatPatternEvent[],
  instrumentId: BeatInstrumentId,
  meter: Meter,
  measureIndex?: number
): BeatPatternSubdivision {
  const offsets = events.filter((event) => event.instrumentId === instrumentId &&
      (measureIndex === undefined || event.measureIndex === measureIndex))
    .map((event) => event.offsetBeats);
  const baseStep = beatPatternStep(meter);
  if (offsets.every((offset) => Math.abs(offset / baseStep - Math.round(offset / baseStep)) < .0001)) return 1;
  if (offsets.every((offset) => Math.abs(offset / (baseStep / 2) - Math.round(offset / (baseStep / 2))) < .0001)) return 2;
  return 4;
}

export function isBeatPatternEvent(value: unknown, meter: Meter): value is BeatPatternEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<BeatPatternEvent>;
  return typeof event.id === "string" && event.id.length > 0 && event.id.length <= 120 &&
    isBeatInstrumentId(event.instrumentId) &&
    Number.isInteger(event.measureIndex) && (event.measureIndex ?? -1) >= 0 &&
    (event.measureIndex ?? BEAT_PATTERN_MEASURES) < BEAT_PATTERN_MEASURES &&
    typeof event.offsetBeats === "number" && Number.isFinite(event.offsetBeats) &&
    event.offsetBeats >= 0 && event.offsetBeats < beatPatternMeasureBeats(meter) &&
    isAlignedOffset(event.offsetBeats, meter);
}

export function normalizeBeatPattern(
  value: readonly unknown[],
  meter: Meter
): BeatPatternEvent[] {
  const seen = new Set<string>();
  const instruments = new Set<BeatInstrumentId>();
  const normalized: BeatPatternEvent[] = [];
  value.forEach((item) => {
    if (normalized.length >= MAX_BEAT_PATTERN_EVENTS || !isBeatPatternEvent(item, meter)) return;
    if (!instruments.has(item.instrumentId) && instruments.size >= MAX_BEAT_PATTERN_INSTRUMENTS) return;
    const key = `${item.instrumentId}:${item.measureIndex}:${item.offsetBeats}`;
    if (seen.has(key)) return;
    instruments.add(item.instrumentId);
    seen.add(key);
    normalized.push(item);
  });
  return normalized.sort((a, b) =>
    a.measureIndex - b.measureIndex ||
    a.offsetBeats - b.offsetBeats ||
    a.instrumentId.localeCompare(b.instrumentId));
}

export function isValidBeatPattern(
  value: unknown,
  meter: Meter
): value is readonly BeatPatternEvent[] {
  if (!Array.isArray(value) || value.length > MAX_BEAT_PATTERN_EVENTS ||
    !value.every((event) => isBeatPatternEvent(event, meter))) return false;
  const seen = new Set<string>();
  return value.every((event) => {
    const key = `${event.instrumentId}:${event.measureIndex}:${event.offsetBeats}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function beatPatternInstrumentIds(events: readonly BeatPatternEvent[]): BeatInstrumentId[] {
  return [...new Set(events.map((event) => event.instrumentId))];
}

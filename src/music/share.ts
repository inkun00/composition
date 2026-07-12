import { INSTRUMENTS, isValidInstrumentId, type InstrumentId } from "./instruments";
import { ACCOMPANIMENT_STYLES, MAX_ACCOMPANIMENT_INSTRUMENTS, type AccompanimentStyleId } from "./accompaniment";
import type { Meter } from "./meter";
import type { NoteEvent } from "./types";
import { isSoundEffectId } from "./soundEffects";
import type { SoundEffectEvent } from "./types";

export type SharedMeasure = Readonly<{
  candidateName: string;
  notes: readonly NoteEvent[];
  effects?: readonly SoundEffectEvent[];
}>;

export type SharedComposition = Readonly<{
  version: 1;
  title: string;
  description?: string;
  creator: string;
  originalCreator: string;
  presetId: string;
  meter: Meter;
  songLength: 8 | 12 | 16;
  instrumentId: InstrumentId;
  accompanimentStyleId?: AccompanimentStyleId;
  accompanimentInstrumentIds?: readonly InstrumentId[];
  bpm?: number;
  lyrics: readonly string[];
  measures: readonly SharedMeasure[];
}>;

function toBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): string {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

function isSharedComposition(value: unknown): value is SharedComposition {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<SharedComposition>;
  if (item.version !== 1 || typeof item.title !== "string" || typeof item.creator !== "string") return false;
  if (typeof item.originalCreator !== "string" || typeof item.presetId !== "string") return false;
  if (![8, 12, 16].includes(item.songLength ?? 0) || !item.meter || !item.instrumentId) return false;
  if (!isValidInstrumentId(item.instrumentId)) return false;
  if (item.accompanimentStyleId !== undefined &&
    !ACCOMPANIMENT_STYLES.some((style) => style.id === item.accompanimentStyleId)) return false;
  if (item.accompanimentInstrumentIds !== undefined && (!Array.isArray(item.accompanimentInstrumentIds) ||
    item.accompanimentInstrumentIds.length > MAX_ACCOMPANIMENT_INSTRUMENTS ||
    new Set(item.accompanimentInstrumentIds).size !== item.accompanimentInstrumentIds.length ||
    !item.accompanimentInstrumentIds.every(isValidInstrumentId))) return false;
  if (item.bpm !== undefined && (!Number.isInteger(item.bpm) || item.bpm < 40 || item.bpm > 220)) return false;
  if (![2, 3, 4, 6].includes(item.meter.beats) || ![2, 4, 8].includes(item.meter.beatUnit)) return false;
  if (!Array.isArray(item.lyrics) || item.lyrics.length !== item.songLength) return false;
  if (!Array.isArray(item.measures) || item.measures.length !== item.songLength) return false;
  if (item.title.length > 60 || item.creator.length > 40 || item.originalCreator.length > 40) return false;
  if (item.description !== undefined && (typeof item.description !== "string" || item.description.length > 600)) return false;
  return item.measures.every((measure) =>
    measure && typeof measure.candidateName === "string" && Array.isArray(measure.notes) &&
    measure.notes.length > 0 && measure.notes.length <= 32 &&
    (measure.effects === undefined || (Array.isArray(measure.effects) && measure.effects.length <= 16 &&
      measure.effects.every((effect: unknown) => {
        const candidate = effect as Partial<SoundEffectEvent>;
        return candidate && typeof candidate.id === "string" && typeof candidate.effectId === "string" &&
          isSoundEffectId(candidate.effectId) && typeof candidate.offsetBeats === "number" &&
          Number.isFinite(candidate.offsetBeats) && candidate.offsetBeats >= 0 && candidate.offsetBeats <= 16;
      }))) &&
    measure.notes.every((note: unknown) => {
      const candidate = note as Partial<NoteEvent>;
      return candidate && typeof candidate.id === "string" &&
        (candidate.pitch === null || Number.isInteger(candidate.pitch)) &&
        Number.isInteger(candidate.duration?.numerator) && Number.isInteger(candidate.duration?.denominator) &&
        (candidate.duration?.denominator ?? 0) > 0 &&
        (candidate.dotted === undefined || typeof candidate.dotted === "boolean") &&
        (candidate.beamGroup === undefined ||
          (typeof candidate.beamGroup === "string" && candidate.beamGroup.length <= 120)) &&
        (candidate.beamBreak === undefined || typeof candidate.beamBreak === "boolean") &&
        (candidate.linkToNext === undefined || typeof candidate.linkToNext === "boolean") &&
        (candidate.restY === undefined || (typeof candidate.restY === "number" && Number.isFinite(candidate.restY) &&
          candidate.restY >= 20 && candidate.restY <= 98)) &&
        (candidate.lyric === undefined || (typeof candidate.lyric === "string" && candidate.lyric.length <= 2));
    })
  );
}

export function encodeSharedComposition(composition: SharedComposition): string {
  return toBase64Url(JSON.stringify(composition));
}

export function decodeSharedComposition(value: string): SharedComposition | null {
  try {
    const parsed: unknown = JSON.parse(fromBase64Url(value));
    return isSharedComposition(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function readCompositionFromHash(hash: string): SharedComposition | null {
  const match = hash.match(/(?:^#|&)song=([^&]+)/);
  return match ? decodeSharedComposition(match[1]) : null;
}

export function buildShareUrl(composition: SharedComposition, location: Pick<Location, "origin" | "pathname">): string {
  return `${location.origin}${location.pathname}#song=${encodeSharedComposition(composition)}`;
}

import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";
import { INSTRUMENTS, isValidInstrumentId, type InstrumentId } from "./instruments";
import { ACCOMPANIMENT_STYLES, MAX_SAVED_ACCOMPANIMENT_INSTRUMENTS, type AccompanimentStyleId } from "./accompaniment";
import type { Meter } from "./meter";
import type { NoteEvent } from "./types";
import { isSoundEffectId } from "./soundEffects";
import type { SoundEffectEvent } from "./types";
import { MAX_BEAT_PATTERN_EVENTS, isValidBeatPattern, type BeatPatternEvent } from "./beatPattern";
import {
  BEAT_INSTRUMENTS,
  isValidBeatInstrumentSelection,
  isValidBeatVolume,
  type BeatInstrumentId
} from "./beatInstruments";

export type SharedMeasure = Readonly<{
  candidateName: string;
  notes: readonly NoteEvent[];
  chords?: readonly string[];
  keyFifths?: number;
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
  songLength: 8 | 12 | 16 | 20 | 24 | 28 | 32;
  instrumentId: InstrumentId;
  accompanimentStyleId?: AccompanimentStyleId;
  accompanimentInstrumentIds?: readonly InstrumentId[];
  beatInstrumentIds?: readonly BeatInstrumentId[];
  beatPattern?: readonly BeatPatternEvent[];
  beatVolume?: number;
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

type CompactNoteV1 = [string, number | null, number, number, boolean?, string?, boolean?, boolean?, number?, string?];
type CompactEffectV1 = [string, string, number];
type CompactMeasureV1 = [string, CompactNoteV1[], CompactEffectV1[]?];
type CompactCompositionV1 = [
  1,
  string,
  string | undefined,
  string,
  string,
  string,
  number,
  2 | 4 | 8,
  8 | 12 | 16 | 20 | 24 | 28 | 32,
  string,
  string | undefined,
  readonly string[] | undefined,
  number | undefined,
  readonly string[],
  CompactMeasureV1[]
];

type CompactNote = [number | null, number, number, boolean?, number?, boolean?, boolean?, number?, string?, NoteEvent["accidental"]?];
type CompactEffect = [string, number];
type CompactMeasure = [string, CompactNote[], CompactEffect[] | null | undefined, readonly string[] | undefined, number?];
type CompactBeatEvent = [number, number, number];
type CompactComposition = [
  2,
  string,
  string | undefined,
  string,
  string,
  string,
  number,
  2 | 4 | 8,
  8 | 12 | 16 | 20 | 24 | 28 | 32,
  string,
  string | undefined,
  readonly string[] | undefined,
  number | undefined,
  readonly string[],
  CompactMeasure[],
  readonly number[] | null | undefined,
  number | null | undefined,
  readonly CompactBeatEvent[] | null | undefined
];

function trimTrailingEmpty<T>(items: T[]): T[] {
  while (items.length > 0 && items[items.length - 1] === undefined) items.pop();
  return items;
}

function optional<T>(value: T | null | undefined): T | undefined {
  return value ?? undefined;
}

function compactComposition(composition: SharedComposition): CompactComposition {
  return [
    2,
    composition.title,
    composition.description || undefined,
    composition.creator,
    composition.originalCreator,
    composition.presetId,
    composition.meter.beats,
    composition.meter.beatUnit,
    composition.songLength,
    composition.instrumentId,
    composition.accompanimentStyleId,
    composition.accompanimentInstrumentIds,
    composition.bpm,
    composition.lyrics,
    composition.measures.map((measure) => {
      const beamGroups = new Map<string, number>();
      const notes = measure.notes.map((note) => {
        let beamGroup: number | undefined;
        if (note.beamGroup) {
          if (!beamGroups.has(note.beamGroup)) beamGroups.set(note.beamGroup, beamGroups.size);
          beamGroup = beamGroups.get(note.beamGroup);
        }
        return trimTrailingEmpty([
          note.pitch,
          note.duration.numerator,
          note.duration.denominator,
          note.dotted,
          beamGroup,
          note.beamBreak,
          note.linkToNext,
          note.restY,
          note.lyric,
          note.accidental
        ]) as CompactNote;
      });
      return trimTrailingEmpty([
        measure.candidateName,
        notes,
        measure.effects?.map((effect) => [effect.effectId, effect.offsetBeats] as CompactEffect),
        measure.chords,
        measure.keyFifths
      ]) as CompactMeasure;
    }),
    composition.beatInstrumentIds?.map((id) =>
      BEAT_INSTRUMENTS.findIndex((instrument) => instrument.id === id)),
    composition.beatVolume,
    composition.beatPattern?.map((event) => [
      BEAT_INSTRUMENTS.findIndex((instrument) => instrument.id === event.instrumentId),
      event.measureIndex,
      event.offsetBeats
    ])
  ];
}

function expandCompactComposition(compact: CompactComposition): SharedComposition {
  const expanded: SharedComposition = {
    version: 1,
    title: compact[1],
    description: optional(compact[2]),
    creator: compact[3],
    originalCreator: compact[4],
    presetId: compact[5],
    meter: { beats: compact[6], beatUnit: compact[7] },
    songLength: compact[8],
    instrumentId: compact[9],
    accompanimentStyleId: optional(compact[10]) as AccompanimentStyleId | undefined,
    accompanimentInstrumentIds: optional(compact[11]) as readonly InstrumentId[] | undefined,
    bpm: optional(compact[12]),
    beatInstrumentIds: compact[15]?.flatMap((index) => {
      const id = BEAT_INSTRUMENTS[index]?.id;
      return id ? [id] : [];
    }),
    beatVolume: optional(compact[16]),
    beatPattern: compact[17]?.flatMap((event, eventIndex) => {
      const instrumentId = BEAT_INSTRUMENTS[event[0]]?.id;
      return instrumentId ? [{
        id: `shared-beat-${eventIndex}`,
        instrumentId,
        measureIndex: event[1],
        offsetBeats: event[2]
      }] : [];
    }),
    lyrics: compact[13],
    measures: compact[14].map((measure, measureIndex) => ({
      candidateName: measure[0],
      notes: measure[1].map((note, noteIndex) => ({
        id: `shared-${measureIndex}-${noteIndex}`,
        pitch: note[0],
        duration: { numerator: note[1], denominator: note[2] },
        dotted: optional(note[3]),
        beamGroup: note[4] === null || note[4] === undefined ? undefined : `shared-beam-${measureIndex}-${note[4]}`,
        beamBreak: optional(note[5]),
        linkToNext: optional(note[6]),
        restY: optional(note[7]),
        lyric: optional(note[8]),
        accidental: optional(note[9])
      })),
      effects: measure[2]?.map((effect, effectIndex) => ({
        id: `shared-effect-${measureIndex}-${effectIndex}`,
        effectId: effect[0],
        offsetBeats: effect[1]
      })),
      chords: optional(measure[3]),
      keyFifths: optional(measure[4])
    }))
  };
  return JSON.parse(JSON.stringify(expanded)) as SharedComposition;
}

function isCompactComposition(value: unknown): value is CompactComposition {
  return Array.isArray(value) && value[0] === 2 && typeof value[1] === "string" &&
    typeof value[3] === "string" && typeof value[4] === "string" && typeof value[5] === "string" &&
    Number.isInteger(value[6]) && [2, 4, 8].includes(value[7]) && [8, 12, 16, 20, 24, 28, 32].includes(value[8]) &&
    typeof value[9] === "string" && Array.isArray(value[13]) && Array.isArray(value[14]) &&
    (value[15] == null || (Array.isArray(value[15]) && value[15].length <= 3 &&
      value[15].every((index) => Number.isInteger(index) && index >= 0 && index < BEAT_INSTRUMENTS.length))) &&
    (value[16] == null || isValidBeatVolume(value[16])) &&
    (value[17] == null || (Array.isArray(value[17]) && value[17].length <= MAX_BEAT_PATTERN_EVENTS &&
      value[17].every((event) => Array.isArray(event) && event.length === 3 &&
        Number.isInteger(event[0]) && event[0] >= 0 && event[0] < BEAT_INSTRUMENTS.length &&
        Number.isInteger(event[1]) && event[1] >= 0 && event[1] < 4 &&
        typeof event[2] === "number" && Number.isFinite(event[2]))));
}

function isCompactCompositionV1(value: unknown): value is CompactCompositionV1 {
  return Array.isArray(value) && value[0] === 1 && typeof value[1] === "string" &&
    typeof value[3] === "string" && typeof value[4] === "string" && typeof value[5] === "string" &&
    Number.isInteger(value[6]) && [2, 4, 8].includes(value[7]) && [8, 12, 16, 20, 24, 28, 32].includes(value[8]) &&
    typeof value[9] === "string" && Array.isArray(value[13]) && Array.isArray(value[14]);
}

function expandCompactCompositionV1(compact: CompactCompositionV1): SharedComposition {
  const expanded: SharedComposition = {
    version: 1,
    title: compact[1],
    description: optional(compact[2]),
    creator: compact[3],
    originalCreator: compact[4],
    presetId: compact[5],
    meter: { beats: compact[6], beatUnit: compact[7] },
    songLength: compact[8],
    instrumentId: compact[9],
    accompanimentStyleId: optional(compact[10]) as AccompanimentStyleId | undefined,
    accompanimentInstrumentIds: optional(compact[11]) as readonly InstrumentId[] | undefined,
    bpm: optional(compact[12]),
    lyrics: compact[13],
    measures: compact[14].map((measure) => ({
      candidateName: measure[0],
      notes: measure[1].map((note) => ({
        id: note[0],
        pitch: note[1],
        duration: { numerator: note[2], denominator: note[3] },
        dotted: optional(note[4]),
        beamGroup: optional(note[5]),
        beamBreak: optional(note[6]),
        linkToNext: optional(note[7]),
        restY: optional(note[8]),
        lyric: optional(note[9])
      })),
      effects: measure[2]?.map((effect) => ({ id: effect[0], effectId: effect[1], offsetBeats: effect[2] }))
    }))
  };
  return JSON.parse(JSON.stringify(expanded)) as SharedComposition;
}

function isSharedComposition(value: unknown): value is SharedComposition {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<SharedComposition>;
  if (item.version !== 1 || typeof item.title !== "string" || typeof item.creator !== "string") return false;
  if (typeof item.originalCreator !== "string" || typeof item.presetId !== "string") return false;
  if (![8, 12, 16, 20, 24, 28, 32].includes(item.songLength ?? 0) || !item.meter || !item.instrumentId) return false;
  if (!isValidInstrumentId(item.instrumentId)) return false;
  if (item.accompanimentStyleId !== undefined &&
    !ACCOMPANIMENT_STYLES.some((style) => style.id === item.accompanimentStyleId)) return false;
  if (item.accompanimentInstrumentIds !== undefined && (!Array.isArray(item.accompanimentInstrumentIds) ||
    item.accompanimentInstrumentIds.length > MAX_SAVED_ACCOMPANIMENT_INSTRUMENTS ||
    new Set(item.accompanimentInstrumentIds).size !== item.accompanimentInstrumentIds.length ||
    !item.accompanimentInstrumentIds.every(isValidInstrumentId))) return false;
  if (item.beatInstrumentIds !== undefined &&
    !isValidBeatInstrumentSelection(item.beatInstrumentIds)) return false;
  if (item.beatPattern !== undefined && !isValidBeatPattern(item.beatPattern, item.meter)) return false;
  if (item.beatVolume !== undefined && !isValidBeatVolume(item.beatVolume)) return false;
  if (item.bpm !== undefined && (!Number.isInteger(item.bpm) || item.bpm < 40 || item.bpm > 220)) return false;
  if (![2, 3, 4, 6].includes(item.meter.beats) || ![2, 4, 8].includes(item.meter.beatUnit)) return false;
  if (!Array.isArray(item.lyrics) || item.lyrics.length !== item.songLength) return false;
  if (!Array.isArray(item.measures) || item.measures.length !== item.songLength) return false;
  if (item.title.length > 60 || item.creator.length > 40 || item.originalCreator.length > 40) return false;
  if (item.description !== undefined && (typeof item.description !== "string" || item.description.length > 600)) return false;
  return item.measures.every((measure) =>
    measure && typeof measure.candidateName === "string" && Array.isArray(measure.notes) &&
    measure.notes.length > 0 && measure.notes.length <= 32 &&
    (measure.chords === undefined || (Array.isArray(measure.chords) && measure.chords.length > 0 &&
      measure.chords.length <= 4 && measure.chords.every((chord: unknown) => typeof chord === "string" &&
        chord.length <= 16 && /^[A-G](?:#|b)?(?:maj7|m7b5|m7|m|dim|aug|sus4|7|5)?(?:\/[A-G](?:#|b)?)?$/.test(chord)))) &&
    (measure.keyFifths === undefined || (Number.isInteger(measure.keyFifths) &&
      measure.keyFifths >= -7 && measure.keyFifths <= 7)) &&
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
        (candidate.accidental === undefined || candidate.accidental === "sharp" || candidate.accidental === "flat" || candidate.accidental === "natural") &&
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
  return compressToEncodedURIComponent(JSON.stringify(compactComposition(composition)));
}

export function decodeSharedComposition(value: string): SharedComposition | null {
  try {
    const compactJson = decompressFromEncodedURIComponent(value);
    if (compactJson) {
      const parsed: unknown = JSON.parse(compactJson);
      if (isCompactComposition(parsed)) {
        const expanded = expandCompactComposition(parsed);
        return isSharedComposition(expanded) ? expanded : null;
      }
      if (isCompactCompositionV1(parsed)) {
        const expanded = expandCompactCompositionV1(parsed);
        return isSharedComposition(expanded) ? expanded : null;
      }
    }
  } catch {
    // Fall back to legacy base64url shares below.
  }
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

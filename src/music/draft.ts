import { INSTRUMENTS, isValidInstrumentId, type InstrumentId } from "./instruments";
import { ACCOMPANIMENT_STYLES, MAX_ACCOMPANIMENT_INSTRUMENTS, type AccompanimentStyleId } from "./accompaniment";
import type { Meter } from "./meter";
import type { NoteEvent } from "./types";
import { isSoundEffectId } from "./soundEffects";
import type { SoundEffectEvent } from "./types";

export const DRAFT_STORAGE_KEY = "maeum-melody:draft:v1";

export type DraftMeasure = Readonly<{
  candidateId: string | null;
  candidateName: string | null;
  notes: readonly NoteEvent[] | null;
  effects?: readonly SoundEffectEvent[];
}>;

export type SavedDraft = Readonly<{
  version: 1;
  updatedAt: number;
  sourceHash: string;
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
  measures: readonly DraftMeasure[];
  showArrangement: boolean;
}>;

function isNoteEvent(value: unknown): value is NoteEvent {
  if (!value || typeof value !== "object") return false;
  const note = value as Partial<NoteEvent>;
  return typeof note.id === "string" && note.id.length <= 120 &&
    (note.pitch === null || (Number.isInteger(note.pitch) && (note.pitch ?? 0) >= 0 && (note.pitch ?? 0) <= 127)) &&
    Number.isInteger(note.duration?.numerator) && Number.isInteger(note.duration?.denominator) &&
    (note.duration?.denominator ?? 0) > 0 &&
    (note.dotted === undefined || typeof note.dotted === "boolean") &&
    (note.beamGroup === undefined || (typeof note.beamGroup === "string" && note.beamGroup.length <= 120)) &&
    (note.beamBreak === undefined || typeof note.beamBreak === "boolean") &&
    (note.linkToNext === undefined || typeof note.linkToNext === "boolean") &&
    (note.restY === undefined || (typeof note.restY === "number" && Number.isFinite(note.restY) &&
      note.restY >= 20 && note.restY <= 98)) &&
    (note.lyric === undefined || (typeof note.lyric === "string" && note.lyric.length <= 2));
}

function isSoundEffectEvent(value: unknown): value is SoundEffectEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<SoundEffectEvent>;
  return typeof event.id === "string" && event.id.length <= 120 &&
    typeof event.effectId === "string" && isSoundEffectId(event.effectId) &&
    typeof event.offsetBeats === "number" && Number.isFinite(event.offsetBeats) &&
    event.offsetBeats >= 0 && event.offsetBeats <= 16;
}

export function isSavedDraft(value: unknown): value is SavedDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<SavedDraft>;
  if (draft.version !== 1 || !Number.isFinite(draft.updatedAt)) return false;
  if (typeof draft.sourceHash !== "string" || draft.sourceHash.length > 50_000) return false;
  if (typeof draft.title !== "string" || draft.title.length > 60) return false;
  if (draft.description !== undefined && (typeof draft.description !== "string" || draft.description.length > 600)) return false;
  if (typeof draft.creator !== "string" || draft.creator.length > 40) return false;
  if (typeof draft.originalCreator !== "string" || draft.originalCreator.length > 40) return false;
  if (typeof draft.presetId !== "string" || draft.presetId.length > 20) return false;
  if (![8, 12, 16].includes(draft.songLength ?? 0) || !draft.meter || !draft.instrumentId) return false;
  if (![[2, 4], [3, 4], [4, 4], [6, 8]].some(([beats, unit]) =>
    draft.meter?.beats === beats && draft.meter?.beatUnit === unit)) return false;
  if (!isValidInstrumentId(draft.instrumentId)) return false;
  if (draft.accompanimentStyleId !== undefined &&
    !ACCOMPANIMENT_STYLES.some((style) => style.id === draft.accompanimentStyleId)) return false;
  if (draft.accompanimentInstrumentIds !== undefined && (!Array.isArray(draft.accompanimentInstrumentIds) ||
    draft.accompanimentInstrumentIds.length > MAX_ACCOMPANIMENT_INSTRUMENTS ||
    new Set(draft.accompanimentInstrumentIds).size !== draft.accompanimentInstrumentIds.length ||
    !draft.accompanimentInstrumentIds.every(isValidInstrumentId))) return false;
  if (draft.bpm !== undefined && (!Number.isInteger(draft.bpm) || draft.bpm < 40 || draft.bpm > 220)) return false;
  if (typeof draft.showArrangement !== "boolean") return false;
  if (!Array.isArray(draft.lyrics) || draft.lyrics.length !== draft.songLength ||
    !draft.lyrics.every((lyric) => typeof lyric === "string" && lyric.length <= 30)) return false;
  if (!Array.isArray(draft.measures) || draft.measures.length !== draft.songLength) return false;
  return draft.measures.every((measure) => {
    if (!measure || typeof measure !== "object") return false;
    if (measure.candidateId !== null && typeof measure.candidateId !== "string") return false;
    if (measure.candidateName !== null && typeof measure.candidateName !== "string") return false;
    if (measure.effects !== undefined && (!Array.isArray(measure.effects) || measure.effects.length > 16 ||
      !measure.effects.every(isSoundEffectEvent))) return false;
    return measure.notes === null || (Array.isArray(measure.notes) && measure.notes.length <= 32 &&
      measure.notes.every(isNoteEvent));
  });
}

export function readDraft(storage: Pick<Storage, "getItem">): SavedDraft | null {
  try {
    const raw = storage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isSavedDraft(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeDraft(storage: Pick<Storage, "setItem">, draft: SavedDraft): boolean {
  try {
    storage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

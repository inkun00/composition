import { MAX_SAVED_ACCOMPANIMENT_INSTRUMENTS } from "./accompaniment";
import { findInstrument, isValidInstrumentId, type InstrumentId } from "./instruments";

export type AccompanimentTrackMix = Readonly<{ volume: number; muted: boolean }>;
export type AccompanimentTrackMixMap = Readonly<Record<InstrumentId, AccompanimentTrackMix>>;

export const DEFAULT_ACCOMPANIMENT_TRACK_MIX: AccompanimentTrackMix = { volume: 100, muted: false };

export function accompanimentTrackSettings(
  tracks: AccompanimentTrackMixMap | undefined,
  instrumentId: InstrumentId
): AccompanimentTrackMix {
  const canonicalId = findInstrument(instrumentId).id;
  return tracks?.[canonicalId] ?? Object.entries(tracks ?? {})
    .find(([id]) => findInstrument(id).id === canonicalId)?.[1] ?? DEFAULT_ACCOMPANIMENT_TRACK_MIX;
}

export function isValidAccompanimentTrackMix(value: unknown): value is AccompanimentTrackMixMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  return entries.length <= MAX_SAVED_ACCOMPANIMENT_INSTRUMENTS && entries.every(([id, settings]) => {
    if (!isValidInstrumentId(id) || !settings || typeof settings !== "object") return false;
    const track = settings as Partial<AccompanimentTrackMix>;
    return Number.isInteger(track.volume) && (track.volume ?? -1) >= 0 && (track.volume ?? 151) <= 150 &&
      typeof track.muted === "boolean";
  });
}

export function normalizeAccompanimentTrackMix(
  value: unknown,
  instrumentIds?: readonly InstrumentId[]
): AccompanimentTrackMixMap {
  if (!isValidAccompanimentTrackMix(value)) return {};
  const selected = instrumentIds ? new Set(instrumentIds.map((id) => findInstrument(id).id)) : null;
  return Object.fromEntries(Object.entries(value).flatMap(([id, settings]) => {
    const canonicalId = findInstrument(id).id;
    return selected && !selected.has(canonicalId) ? [] : [[canonicalId, { ...settings }]];
  }));
}

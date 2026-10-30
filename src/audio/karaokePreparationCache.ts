import { toNumber } from "../music/rational";
import type { AccompanimentOptions, PlaybackMeasure } from "./accompanimentScore";
import type { KaraokeGuideSettings } from "./karaokeGuide";
import { KaraokeStemCache } from "./karaokeStemCache";

export const karaokePreparationCache = new KaraokeStemCache();

/** Text, IDs and UI callbacks never change the sound of a prepared stem. */
export function karaokePreparationKeys(measures: readonly PlaybackMeasure[], bpm: number,
  sampleRate: number, instrumentId: string, accompaniment: AccompanimentOptions | undefined,
  guide: KaraokeGuideSettings): Readonly<{ backing: string; guide: string }> {
  const notes = measures.map((measure) => measure.notes.map((note) =>
    [note.pitch, toNumber(note.duration), Boolean(note.linkToNext)]));
  const mix = Object.entries(accompaniment?.trackMix ?? {}).sort(([left], [right]) => left.localeCompare(right));
  const backing = JSON.stringify({ version: 1, kind: "backing", sampleRate, bpm, notes,
    measures: measures.map((measure) => ({ harmony: measure.harmony, chords: measure.chords,
      measureIndex: measure.measureIndex, ending: measure.isSongEnding,
      effects: measure.effects?.map((effect) => [effect.effectId, effect.offsetBeats]) })),
    accompaniment: accompaniment ? {
      styleId: accompaniment.styleId, instrumentIds: accompaniment.instrumentIds,
      beatPattern: accompaniment.beatPattern?.map((event) => [event.instrumentId, event.measureIndex, event.offsetBeats]),
      beatVolume: accompaniment.beatVolume, meter: accompaniment.meter,
      trackMix: mix, soloInstrumentId: accompaniment.soloInstrumentId
    } : null });
  return { backing, guide: JSON.stringify({ version: 1, kind: "guide", sampleRate, bpm, notes,
    instrumentId, melodyMode: guide.melodyMode, volume: guide.volume,
    solo: Boolean(accompaniment?.soloInstrumentId) }) };
}

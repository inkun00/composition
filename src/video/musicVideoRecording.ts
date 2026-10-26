import type { AccompanimentOptions, PlaybackMeasure } from "../audio/accompanimentScore";
import type { InstrumentId } from "../music/instruments";
import { buildLyricVideoPlan, type LyricVideoPlan } from "./lyricVideoPlan";

const recordingSources = new WeakMap<LyricVideoPlan, string>();

function sourceKey(measures: readonly PlaybackMeasure[], bpm: number, instrumentId: InstrumentId,
  accompaniment: AccompanimentOptions): string {
  return JSON.stringify({ measures: measures.map(({ notes, harmony, chords, effects, measureIndex }) =>
    ({ notes, harmony, chords, effects, measureIndex })), bpm, instrumentId,
    accompaniment: { styleId: accompaniment.styleId, instrumentIds: accompaniment.instrumentIds,
      beatPattern: accompaniment.beatPattern, beatVolume: accompaniment.beatVolume, meter: accompaniment.meter,
      trackMix: accompaniment.trackMix, soloInstrumentId: accompaniment.soloInstrumentId } });
}

/** The recording closure supplies the actual score and mix used at recording time. */
export function buildRecordedMusicVideoPlan(title: string, measures: readonly PlaybackMeasure[], bpm: number,
  instrumentId: InstrumentId, accompaniment: AccompanimentOptions, introSeconds: number, duration: number): LyricVideoPlan {
  const plan = buildLyricVideoPlan(title, measures, bpm, introSeconds, duration);
  recordingSources.set(plan, sourceKey(measures, bpm, instrumentId, accompaniment));
  return plan;
}

export function matchingMusicVideoRecording(audioUrl: string, plan: LyricVideoPlan | null,
  measures: readonly PlaybackMeasure[], bpm: number, instrumentId: InstrumentId, accompaniment: AccompanimentOptions) {
  if (!audioUrl || !plan || recordingSources.get(plan) !== sourceKey(measures, bpm, instrumentId, accompaniment)) return undefined;
  return { audioUrl, plan };
}

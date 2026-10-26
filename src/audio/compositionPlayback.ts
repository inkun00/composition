import {
  buildIntroMeasures,
  createProtectedMaster,
  scheduleMeasure,
  songArrangementPlan,
  type AccompanimentOptions,
  type PlaybackMeasure
} from "./accompanimentScore";
import { loadAccompanimentLayers, loadSampleWithTimeout } from "./accompanimentRuntime";
import { createArrangementVoiceState } from "./accompanimentPerformance";
import { findInstrument, type InstrumentId } from "../music/instruments";
import type { loadSampleInstrument } from "./samplePlayer";

export type CompositionPlaybackClock = Readonly<{
  /** Signed before the first scheduled sound, then follows AudioContext time through pauses. */
  getElapsedSeconds: () => number;
  durationSeconds: number;
}>;

export type CompositionPlaybackControl = Readonly<{
  signal?: AbortSignal;
  onEnded?: () => void;
  onStarted?: (clock: CompositionPlaybackClock) => void;
}>;

/** Prepare and schedule one composition without owning another playback's lifetime. */
export async function renderCompositionPlayback(
  context: AudioContext,
  isCurrent: () => boolean,
  measures: readonly PlaybackMeasure[],
  instrumentId: InstrumentId,
  bpm: number,
  accompaniment?: AccompanimentOptions,
  withIntro = false,
  control?: CompositionPlaybackControl
): Promise<number | null> {
  if (!isCurrent() || context.state === "closed") return null;
  const master = createProtectedMaster(context, context.destination, 0.72);
  const secondsPerBeat = 60 / bpm;
  const instrument = findInstrument(instrumentId);
  let sampledInstrument: Awaited<ReturnType<typeof loadSampleInstrument>> | null = null;
  try {
    sampledInstrument = await loadSampleWithTimeout(context, master, instrumentId);
  } catch (error) {
    if (!isCurrent()) return null;
    console.warn("악기 샘플을 불러오지 못해 합성 음색을 사용합니다.", error);
  }
  if (!isCurrent() || (context.state as string) === "closed") return null;
  const accompanimentLayers = await loadAccompanimentLayers(context, master, accompaniment);
  if (!isCurrent() || (context.state as string) === "closed") return null;
  const voiceState = createArrangementVoiceState();
  const start = context.currentTime + 0.08;
  let songCursor = 0;

  if (withIntro) {
    const introMeasures = buildIntroMeasures(measures);
    introMeasures.forEach((measure, introIndex) => {
      songCursor += scheduleMeasure(context, master, { ...measure, measureIndex: introIndex },
        start + songCursor, secondsPerBeat, {
          instrument,
          sampledInstrument,
          accompaniment,
          accompanimentLayers,
          includeMelody: false,
          includeEffects: false,
          arrangementSection: "intro",
          voiceState,
          arrangementLayerCount: accompanimentLayers.length,
          arrangementEnergy: .98,
          transitionFill: introIndex === introMeasures.length - 1
        });
    });
  }

  measures.forEach((measure, measureIndex) => {
    const plan = songArrangementPlan(measureIndex, measures.length, accompanimentLayers.length);
    songCursor += scheduleMeasure(context, master, { ...measure, measureIndex: measure.measureIndex ?? measureIndex },
      start + songCursor, secondsPerBeat, {
        instrument,
        sampledInstrument,
        accompaniment,
        accompanimentLayers,
        includeMelody: true,
        includeEffects: true,
        arrangementSection: "song",
        voiceState,
        arrangementLayerCount: plan.layerCount,
        ending: measure.isSongEnding ?? (measures.length > 1 && measureIndex === measures.length - 1),
        transitionFill: ((measure.measureIndex ?? measureIndex) + 1) % 4 === 0,
        arrangementEnergy: plan.energy
      });
  });

  if (!isCurrent() || (context.state as string) === "closed") return null;
  control?.onStarted?.({
    getElapsedSeconds: () => context.currentTime - start,
    durationSeconds: songCursor
  });
  return songCursor + 0.5;
}

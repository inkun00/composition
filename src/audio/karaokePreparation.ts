import {
  buildIntroMeasures, buildOutroMeasures, compositionSeconds, prepareAccompaniment,
  recordingArrangementPlan, scheduleMeasure, type AccompanimentOptions, type PlaybackMeasure
} from "./accompanimentScore";
import { createArrangementVoiceState } from "./accompanimentPerformance";
import { loadAccompanimentLayers, loadSampleWithTimeout, releaseAccompanimentRuntime } from "./accompanimentRuntime";
import { findInstrument, type InstrumentId } from "../music/instruments";
import { isSoundEffectId } from "../music/soundEffects";
import { karaokeGuideSettings, type KaraokeGuideMode } from "./karaokeGuide";
import { releaseSampleContext } from "./samplePlayer";
import { preloadSoundEffects } from "./soundEffects";

export type PreparedKaraokeAudio = Readonly<{
  backing: AudioBuffer;
  guide: AudioBuffer | null;
  introSeconds: number;
  songSeconds: number;
  outroSeconds: number;
  durationSeconds: number;
}>;

type Options = Readonly<{
  sampleRate: number;
  mode: "practice" | "recording";
  guideMode?: KaraokeGuideMode;
  signal?: AbortSignal;
}>;

function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("반주 준비를 중단했어요.", "AbortError");
}

/** Stop waiting immediately; late sample loads still run their normal disposal. */
function abortable<T>(pending: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return pending;
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException("반주 준비를 중단했어요.", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    pending.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
    if (signal.aborted) abort();
  });
}

/** Render before the live microphone starts: live playback needs only two sources. */
export async function prepareKaraokeAudio(
  measures: readonly PlaybackMeasure[], instrumentId: InstrumentId, bpm: number,
  accompaniment: AccompanimentOptions | undefined, options: Options
): Promise<PreparedKaraokeAudio> {
  checkAbort(options.signal);
  if (typeof OfflineAudioContext === "undefined") {
    throw new Error("안정적인 노래 연습·녹음을 위해 최신 크롬이나 엣지에서 다시 열어 주세요.");
  }
  if (!Number.isFinite(bpm) || bpm <= 0 || !Number.isFinite(options.sampleRate) ||
      options.sampleRate < 8000 || options.sampleRate > 192000 || measures.length === 0) {
    throw new Error("노래의 빠르기와 악보를 확인한 뒤 다시 시작해 주세요.");
  }
  const secondsPerBeat = 60 / bpm;
  const intro = buildIntroMeasures(measures);
  const outro = buildOutroMeasures(measures);
  const introSeconds = compositionSeconds(intro, secondsPerBeat);
  const songSeconds = compositionSeconds(measures, secondsPerBeat);
  const outroSeconds = compositionSeconds(outro, secondsPerBeat);
  const durationSeconds = introSeconds + songSeconds + outroSeconds + (options.mode === "practice" ? .55 : .8);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > 600 || songSeconds <= 0) {
    throw new Error("노래 길이를 확인한 뒤 다시 시작해 주세요. 10분 안의 곡을 사용할 수 있어요.");
  }
  const prepared = prepareAccompaniment(accompaniment, measures);
  const instrument = findInstrument(instrumentId);
  const guideSettings = options.mode === "practice"
    ? { includeMelody: true, melodyMode: "all" as const, volume: .82 }
    : karaokeGuideSettings(options.guideMode ?? "first-note");

  async function renderStem(isGuide: boolean): Promise<AudioBuffer> {
    checkAbort(options.signal);
    const context = new OfflineAudioContext(2, Math.ceil(durationSeconds * options.sampleRate), options.sampleRate);
    const destination = context.createGain();
    destination.gain.value = 1;
    destination.connect(context.destination);
    try {
      const layers = isGuide ? [] : await abortable(
        loadAccompanimentLayers(context, destination, prepared), options.signal
      );
      checkAbort(options.signal);
      let sampledInstrument: Awaited<ReturnType<typeof loadSampleWithTimeout>> | null = null;
      if (isGuide) {
        try {
          sampledInstrument = await abortable(loadSampleWithTimeout(context, destination, instrumentId), options.signal);
        } catch (error) {
          checkAbort(options.signal);
          console.warn("가락 도움 샘플을 불러오지 못해 합성 음색을 사용합니다.", error);
        }
      } else {
        await abortable(preloadSoundEffects(context, measures.flatMap((measure) =>
          (measure.effects ?? []).map((effect) => effect.effectId).filter(isSoundEffectId)), options.signal), options.signal);
      }
      checkAbort(options.signal);
      const voiceState = createArrangementVoiceState();
      let cursor = 0;
      if (!isGuide) {
        intro.forEach((measure, index) => {
          cursor += scheduleMeasure(context, destination, measure, cursor, secondsPerBeat, {
            instrument, sampledInstrument: null, accompaniment: prepared, accompanimentLayers: layers, voiceState,
            includeMelody: false, includeEffects: false, arrangementSection: "intro",
            transitionFill: index === intro.length - 1, arrangementLayerCount: layers.length, arrangementEnergy: .98
          });
        });
      } else cursor = introSeconds;

      measures.forEach((measure, index) => {
        const plan = recordingArrangementPlan(index, measures.length, layers.length);
        cursor += scheduleMeasure(context, destination, { ...measure, measureIndex: measure.measureIndex ?? index },
          cursor, secondsPerBeat, {
            instrument, sampledInstrument, accompaniment: prepared, accompanimentLayers: layers, voiceState,
            includeBacking: !isGuide, includeMelody: isGuide, includeEffects: !isGuide,
            melodyMode: guideSettings.melodyMode, melodyVolumeMultiplier: guideSettings.volume,
            arrangementLayerCount: plan.layerCount, arrangementEnergy: plan.energy,
            ending: measure.isSongEnding ?? (measures.length > 1 && index === measures.length - 1),
            transitionFill: ((measure.measureIndex ?? index) + 1) % 4 === 0
          });
      });
      if (!isGuide) {
        outro.forEach((measure, index) => {
          cursor += scheduleMeasure(context, destination, measure, cursor, secondsPerBeat, {
            instrument, sampledInstrument: null, accompaniment: prepared, accompanimentLayers: layers, voiceState,
            includeMelody: false, includeEffects: false, arrangementSection: "outro",
            ending: index === outro.length - 1, arrangementLayerCount: layers.length, arrangementEnergy: .98
          });
        });
      }
      checkAbort(options.signal);
      const buffer = await abortable(context.startRendering(), options.signal);
      checkAbort(options.signal);
      return buffer;
    } finally {
      releaseAccompanimentRuntime(context);
      releaseSampleContext(context);
      destination.disconnect();
    }
  }

  const backing = await renderStem(false);
  const guide = guideSettings.includeMelody ? await renderStem(true) : null;
  checkAbort(options.signal);
  return { backing, guide, introSeconds, songSeconds, outroSeconds, durationSeconds };
}

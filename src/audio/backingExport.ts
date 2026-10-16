import { buildIntroMeasures, buildOutroMeasures, compositionSeconds, createProtectedMaster,
  prepareAccompaniment, scheduleMeasure, songArrangementPlan,
  type AccompanimentOptions, type PlaybackMeasure } from "./accompanimentScore";
import { loadAccompanimentLayers, releaseAccompanimentRuntime } from "./accompanimentRuntime";
import { createArrangementVoiceState } from "./accompanimentPerformance";
import { encodeAudioBufferToMp3, renderedAudioPeak } from "./audioExport";
import { findInstrument, type InstrumentId } from "../music/instruments";
import { releaseSampleContext } from "./samplePlayer";
import { selectRecorderMimeType } from "./vocalCapture";

export async function renderRealtimeBackingMp3(
  measures: readonly PlaybackMeasure[],
  instrumentId: InstrumentId = "piano",
  bpm = 96,
  accompaniment?: AccompanimentOptions,
  onContext?: (context: AudioContext) => void
): Promise<Blob | null> {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("이 브라우저에서는 MP3 저장을 사용할 수 없어요.");
  }

  const AudioContextClass = window.AudioContext ||
    (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) {
    throw new Error("이 브라우저에서는 오디오 저장을 사용할 수 없어요.");
  }

  const context = new AudioContextClass();
  onContext?.(context);
  accompaniment = prepareAccompaniment(accompaniment, measures);
  try {
    if (context.state === "suspended") await context.resume();
    const secondsPerBeat = 60 / bpm;
    const introMeasures = buildIntroMeasures(measures);
    const outroMeasures = buildOutroMeasures(measures);
    const tailSeconds = 0.8;

    const recordingDestination = context.createMediaStreamDestination();
    const master = createProtectedMaster(context, recordingDestination, 0.76);

    const instrument = findInstrument(instrumentId);
    const accompanimentLayers = await loadAccompanimentLayers(context, master, accompaniment);
    const voiceState = createArrangementVoiceState();

    const recorderMimeType = selectRecorderMimeType();
    const recorderOptions: MediaRecorderOptions = {
      audioBitsPerSecond: 128000,
      ...(recorderMimeType ? { mimeType: recorderMimeType } : {})
    };
    const recorder = new MediaRecorder(recordingDestination.stream, recorderOptions);
    const chunks: BlobPart[] = [];
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    });
    const stopped = new Promise<Blob>((resolve) => {
      recorder.addEventListener("stop", () => {
        resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
      }, { once: true });
    });

    const start = context.currentTime + 0.25;
    let cursor = 0;
    recorder.start(250);
    introMeasures.forEach((measure, introIndex) => {
      cursor += scheduleMeasure(context, master, measure, start + cursor, secondsPerBeat, {
        instrument,
        sampledInstrument: null,
        accompaniment,
        accompanimentLayers,
        voiceState,
        includeMelody: false,
        includeEffects: false,
        arrangementSection: "intro",
        transitionFill: introIndex === introMeasures.length - 1,
        arrangementLayerCount: accompanimentLayers.length,
        arrangementEnergy: .98
      });
    });
    measures.forEach((measure, measureIndex) => {
      const plan = songArrangementPlan(measureIndex, measures.length, accompanimentLayers.length);
      cursor += scheduleMeasure(context, master, { ...measure, measureIndex: measure.measureIndex ?? measureIndex }, start + cursor, secondsPerBeat, {
        instrument,
        sampledInstrument: null,
        accompaniment,
        accompanimentLayers,
        voiceState,
        includeMelody: false,
        includeEffects: true,
        arrangementLayerCount: plan.layerCount,
        ending: measure.isSongEnding ?? (measures.length > 1 && measureIndex === measures.length - 1),
        transitionFill: ((measure.measureIndex ?? measureIndex) + 1) % 4 === 0,
        arrangementEnergy: plan.energy
      });
    });
    outroMeasures.forEach((measure, outroIndex) => {
      cursor += scheduleMeasure(context, master, measure, start + cursor, secondsPerBeat, {
        instrument,
        sampledInstrument: null,
        accompaniment,
        accompanimentLayers,
        voiceState,
        includeMelody: false,
        includeEffects: false,
        arrangementSection: "outro",
        ending: outroIndex === outroMeasures.length - 1,
        arrangementLayerCount: accompanimentLayers.length,
        arrangementEnergy: .98
      });
    });

    window.setTimeout(() => {
      if (recorder.state !== "inactive") recorder.stop();
    }, Math.max(0, (start - context.currentTime + cursor + tailSeconds) * 1000));

    const recordedBlob = await stopped;
    const recordedBuffer = await recordedBlob.arrayBuffer();
    const decoded = await context.decodeAudioData(recordedBuffer);
    return encodeAudioBufferToMp3(decoded);
  } finally {
    releaseAccompanimentRuntime(context);
    releaseSampleContext(context);
    if (context.state !== "closed") await context.close();
  }
}

export type RenderedBackingAudio = Readonly<{
  audioBuffer: AudioBuffer;
  /** Includes the short scheduling lead-in, so lyrics align with the first song note. */
  introSeconds: number;
}>;

export async function renderOfflineBackingAudio(
  measures: readonly PlaybackMeasure[],
  instrumentId: InstrumentId = "piano",
  bpm = 96,
  accompaniment?: AccompanimentOptions,
  signal?: AbortSignal
): Promise<RenderedBackingAudio> {
  const checkAbort = () => {
    if (signal?.aborted) throw new DOMException("파일 만들기를 멈췄어요.", "AbortError");
  };
  checkAbort();
  let context: OfflineAudioContext | undefined;
  accompaniment = prepareAccompaniment(accompaniment, measures);
  try {
    const secondsPerBeat = 60 / bpm;
    const introMeasures = buildIntroMeasures(measures);
    const outroMeasures = buildOutroMeasures(measures);
    const start = 0.08;
    const tailSeconds = 0.8;
    const totalSeconds = start + compositionSeconds(introMeasures, secondsPerBeat) +
      compositionSeconds(measures, secondsPerBeat) + compositionSeconds(outroMeasures, secondsPerBeat) + tailSeconds;
    const renderContext = new OfflineAudioContext(2, Math.ceil(totalSeconds * 44100), 44100);
    context = renderContext;
    const master = createProtectedMaster(renderContext, renderContext.destination, 0.76);

    const instrument = findInstrument(instrumentId);
    const accompanimentLayers = await loadAccompanimentLayers(renderContext, master, accompaniment);
    checkAbort();
    const voiceState = createArrangementVoiceState();
    let cursor = 0;

    introMeasures.forEach((measure, introIndex) => {
      cursor += scheduleMeasure(renderContext, master, measure, start + cursor, secondsPerBeat, {
        instrument,
        sampledInstrument: null,
        accompaniment,
        accompanimentLayers,
        voiceState,
        includeMelody: false,
        includeEffects: false,
        arrangementSection: "intro",
        transitionFill: introIndex === introMeasures.length - 1,
        arrangementLayerCount: accompanimentLayers.length,
        arrangementEnergy: .98
      });
    });
    measures.forEach((measure, measureIndex) => {
      const plan = songArrangementPlan(measureIndex, measures.length, accompanimentLayers.length);
      cursor += scheduleMeasure(renderContext, master, { ...measure, measureIndex: measure.measureIndex ?? measureIndex }, start + cursor, secondsPerBeat, {
        instrument,
        sampledInstrument: null,
        accompaniment,
        accompanimentLayers,
        voiceState,
        includeMelody: false,
        includeEffects: true,
        arrangementLayerCount: plan.layerCount,
        ending: measure.isSongEnding ?? (measures.length > 1 && measureIndex === measures.length - 1),
        transitionFill: ((measure.measureIndex ?? measureIndex) + 1) % 4 === 0,
        arrangementEnergy: plan.energy
      });
    });
    outroMeasures.forEach((measure, outroIndex) => {
      cursor += scheduleMeasure(renderContext, master, measure, start + cursor, secondsPerBeat, {
        instrument,
        sampledInstrument: null,
        accompaniment,
        accompanimentLayers,
        voiceState,
        includeMelody: false,
        includeEffects: false,
        arrangementSection: "outro",
        ending: outroIndex === outroMeasures.length - 1,
        arrangementLayerCount: accompanimentLayers.length,
        arrangementEnergy: .98
      });
    });

    checkAbort();
    const rendered = await renderContext.startRendering();
    checkAbort();
    if (renderedAudioPeak(rendered) < 0.0001) {
      if (accompanimentLayers.length > 0 && accompanimentLayers.every((layer) => layer.destination.gain.value === 0)) {
        throw new Error("반주 악기 음소거를 해제하거나 음량을 올려 주세요.");
      }
      throw new Error("반주 소리를 만들지 못했어요. 다시 시도해 주세요.");
    }
    return {
      audioBuffer: rendered,
      introSeconds: start + compositionSeconds(introMeasures, secondsPerBeat)
    };
  } finally {
    if (context) {
      releaseAccompanimentRuntime(context);
      releaseSampleContext(context);
    }
  }
}

export async function renderOfflineBackingMp3(
  measures: readonly PlaybackMeasure[],
  instrumentId: InstrumentId = "piano",
  bpm = 96,
  accompaniment?: AccompanimentOptions,
  onContext?: (context: AudioContext) => void
): Promise<Blob | null> {
  void onContext;
  const { audioBuffer } = await renderOfflineBackingAudio(measures, instrumentId, bpm, accompaniment);
  return encodeAudioBufferToMp3(audioBuffer);
}

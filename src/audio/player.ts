import { renderRealtimeBackingMp3, renderOfflineBackingMp3 } from "./backingExport";
import { renderMelodyPreview } from "./melodyPreview";
import { renderCompositionPlayback, type CompositionPlaybackControl } from "./compositionPlayback";
export type { CompositionPlaybackClock, CompositionPlaybackControl } from "./compositionPlayback";
import { prepareAccompaniment, type PlaybackMeasure, type AccompanimentOptions } from "./accompanimentScore";
import { releaseAccompanimentRuntime } from "./accompanimentRuntime";
export type { PlaybackMeasure, AccompanimentOptions } from "./accompanimentScore";
export { compositionIntroDuration, recordingArrangementPlan } from "./accompanimentScore";
import type { InstrumentId } from "../music/instruments";
import { releaseSampleContext } from "./samplePlayer";
import type { HarmonyStory, NoteEvent, SoundEffectEvent } from "../music/types";
export { renderProcessedKaraokeMp3, renderKaraokePreviewMix } from "./audioExport";
export type { KaraokePostProcessPreset } from "./audioExport";
export { karaokeBackingGainForRms } from "./vocalCapture";
import { runKaraokePractice, runKaraokeRecording } from "./karaokeSession";
import type { KaraokeCountIn, KaraokeRecordingCallbacks, KaraokeRecordingResult } from "./karaokeTypes";
export type { KaraokeRecordingCallbacks, KaraokeRecordingResult } from "./karaokeTypes";

let activePlaybackContext: AudioContext | null = null;
let sharedAudioContext: AudioContext | null = null;
let activeOfflineExport = false;
const completionTimers = new Map<AudioContext, number>();
const playbackControls = new Map<AudioContext, Readonly<{
  control: CompositionPlaybackControl;
  dedicated: boolean;
  onAbort: () => void;
}>>();

async function finishPlayback(context: AudioContext, closeContext = false): Promise<void> {
  const timer = completionTimers.get(context);
  if (timer !== undefined) window.clearInterval(timer);
  completionTimers.delete(context);
  const playback = playbackControls.get(context);
  playbackControls.delete(context);
  playback?.control.signal?.removeEventListener("abort", playback.onAbort);
  if (activePlaybackContext === context) activePlaybackContext = null;
  if (closeContext && sharedAudioContext === context) sharedAudioContext = null;
  releaseAccompanimentRuntime(context);
  releaseSampleContext(context);
  const closing = (closeContext || playback?.dedicated) && context.state !== "closed"
    ? context.close() : undefined;
  try {
    playback?.control.onEnded?.();
  } catch (error) {
    console.error("음악 재생 종료 알림을 처리하지 못했어요.", error);
  }
  await closing;
}

async function claimPlayback(control?: CompositionPlaybackControl): Promise<AudioContext | null> {
  if (control?.signal?.aborted || activePlaybackContext || activeOfflineExport) return null;
  const dedicated = Boolean(control?.signal);
  const context = dedicated ? new AudioContext() : (sharedAudioContext ??= new AudioContext());
  activePlaybackContext = context;
  if (control) {
    const onAbort = () => { void finishPlayback(context, true).catch(console.error); };
    playbackControls.set(context, { control, dedicated, onAbort });
    control.signal?.addEventListener("abort", onAbort, { once: true });
  }
  try {
    if (context.state === "suspended") await context.resume();
    if (control?.signal?.aborted || activePlaybackContext !== context || context.state === "closed") return null;
    return context;
  } catch (error) {
    await finishPlayback(context, true);
    if (control?.signal?.aborted) return null;
    throw error;
  }
}

function releasePlayback(context: AudioContext, afterSeconds: number): void {
  const end = context.currentTime + afterSeconds;
  const previous = completionTimers.get(context);
  if (previous !== undefined) window.clearInterval(previous);
  const timer = window.setInterval(() => {
    if (context.state !== "closed" && context.currentTime < end) return;
    void finishPlayback(context).catch(console.error);
  }, 100);
  completionTimers.set(context, timer);
}

export async function pausePlayback(): Promise<boolean> {
  const context = activePlaybackContext ?? sharedAudioContext;
  if (!context || context.state === "closed") return false;
  if (context.state !== "suspended") await context.suspend();
  return true;
}

export async function resumePlayback(): Promise<boolean> {
  const context = activePlaybackContext ?? sharedAudioContext;
  if (!context || context.state === "closed") return false;
  if (context.state !== "running") await context.resume();
  return true;
}

export async function stopPlayback(): Promise<void> {
  const contexts = new Set([activePlaybackContext, sharedAudioContext]);
  activePlaybackContext = null;
  sharedAudioContext = null;
  for (const context of contexts) {
    if (!context) continue;
    await finishPlayback(context, true);
  }
}

export async function playMeasure(
  notes: readonly NoteEvent[],
  harmony: HarmonyStory,
  chords: readonly string[] = [],
  instrumentId: InstrumentId = "piano",
  bpm = 96,
  effects: readonly SoundEffectEvent[] = [],
  playAccompaniment = false
): Promise<number | null> {
  const context = await claimPlayback();
  if (!context) return null;
  const duration = await renderMelodyPreview(context, () => activePlaybackContext === context,
    notes, harmony, chords, instrumentId, bpm, effects, playAccompaniment);
  if (duration !== null) releasePlayback(context, duration);
  return duration;
}

export async function playComposition(
  measures: readonly PlaybackMeasure[],
  instrumentId: InstrumentId = "piano",
  bpm = 96,
  accompaniment?: AccompanimentOptions,
  withIntro = false,
  control?: CompositionPlaybackControl
): Promise<number | null> {
  accompaniment = prepareAccompaniment(accompaniment, measures);
  const context = await claimPlayback(control);
  if (!context) return null;
  try {
    const duration = await renderCompositionPlayback(context,
      () => activePlaybackContext === context && !control?.signal?.aborted,
      measures, instrumentId, bpm, accompaniment, withIntro, control);
    if (duration !== null) releasePlayback(context, duration);
    else await finishPlayback(context, Boolean(control?.signal));
    return duration;
  } catch (error) {
    await finishPlayback(context, true);
    if (control?.signal?.aborted) return null;
    throw error;
  }
}

export async function practiceKaraokeComposition(
  measures: readonly PlaybackMeasure[], instrumentId: InstrumentId = "piano", bpm = 96,
  accompaniment?: AccompanimentOptions, callbacks: KaraokeRecordingCallbacks = {},
  countIn: KaraokeCountIn = { beats: 4, unitBeats: 1 }, signal?: AbortSignal
): Promise<number | null> {
  if (signal?.aborted || activePlaybackContext || activeOfflineExport) return null;
  const Context = window.AudioContext ||
    (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Context) throw new Error("이 브라우저에서는 노래 연습을 사용할 수 없어요.");
  const context = new Context({ latencyHint: "playback" });
  activePlaybackContext = context;
  try {
    return await runKaraokePractice(context, measures, instrumentId, bpm,
      accompaniment, callbacks, countIn, signal);
  } finally {
    if (activePlaybackContext === context) activePlaybackContext = null;
  }
}

export async function recordKaraokeComposition(
  measures: readonly PlaybackMeasure[], instrumentId: InstrumentId = "piano", bpm = 96,
  accompaniment?: AccompanimentOptions, callbacks: KaraokeRecordingCallbacks = {},
  countIn: KaraokeCountIn = { beats: 4, unitBeats: 1 }, signal?: AbortSignal
): Promise<KaraokeRecordingResult | null> {
  if (signal?.aborted || activePlaybackContext || activeOfflineExport) return null;
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("이 브라우저에서는 마이크 녹음을 사용할 수 없어요.");
  const Context = window.AudioContext ||
    (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Context) throw new Error("이 브라우저에서는 오디오 녹음을 사용할 수 없어요.");
  const context = new Context({ latencyHint: "interactive" });
  activePlaybackContext = context;
  try {
    return await runKaraokeRecording(context, measures, instrumentId, bpm,
      accompaniment, callbacks, countIn, signal);
  } finally {
    if (activePlaybackContext === context) activePlaybackContext = null;
  }
}

export async function runExclusiveAudioExport<T>(render: () => Promise<T>): Promise<T | null> {
  if (activePlaybackContext || activeOfflineExport) return null;
  activeOfflineExport = true;
  try {
    return await render();
  } finally {
    activeOfflineExport = false;
  }
}

async function exportBacking(
  render: typeof renderRealtimeBackingMp3,
  measures: readonly PlaybackMeasure[],
  instrumentId: InstrumentId,
  bpm: number,
  accompaniment?: AccompanimentOptions
): Promise<Blob | null> {
  return runExclusiveAudioExport(async () => {
    let exportContext: AudioContext | undefined;
    try {
      return await render(measures, instrumentId, bpm, accompaniment, (context) => {
        exportContext = context;
        activePlaybackContext = context;
      });
    } finally {
      if (activePlaybackContext === exportContext) activePlaybackContext = null;
    }
  });
}

export async function exportBackingCompositionMp3(
  measures: readonly PlaybackMeasure[],
  instrumentId: InstrumentId = "piano",
  bpm = 96,
  accompaniment?: AccompanimentOptions
): Promise<Blob | null> {
  return exportBacking(renderRealtimeBackingMp3, measures, instrumentId, bpm, accompaniment);
}

export async function exportBackingCompositionMp3Offline(
  measures: readonly PlaybackMeasure[],
  instrumentId: InstrumentId = "piano",
  bpm = 96,
  accompaniment?: AccompanimentOptions
): Promise<Blob | null> {
  return exportBacking(renderOfflineBackingMp3, measures, instrumentId, bpm, accompaniment);
}

import { renderRealtimeBackingMp3, renderOfflineBackingMp3 } from "./backingExport";
import { renderMelodyPreview } from "./melodyPreview";
import { renderCompositionPlayback, type CompositionPlaybackControl } from "./compositionPlayback";
export type { CompositionPlaybackClock, CompositionPlaybackControl } from "./compositionPlayback";
import { createProtectedMaster, measureSeconds, compositionSeconds,
  recordingArrangementPlan, buildIntroMeasures, buildOutroMeasures, scheduleMeasure, prepareAccompaniment,
  type PlaybackMeasure, type AccompanimentOptions } from "./accompanimentScore";
import { loadSampleWithTimeout, loadAccompanimentLayers, releaseAccompanimentRuntime } from "./accompanimentRuntime";
export type { PlaybackMeasure, AccompanimentOptions } from "./accompanimentScore";
export { compositionIntroDuration, recordingArrangementPlan } from "./accompanimentScore";
import { toNumber } from "../music/rational";
import { createAccompanimentPattern } from "../music/accompaniment";
import { findInstrument, type InstrumentId } from "../music/instruments";
import { loadSampleInstrument, releaseSampleContext } from "./samplePlayer";
import type { HarmonyStory, NoteEvent, SoundEffectEvent } from "../music/types";
import { renderKaraokePreviewMix } from "./audioExport";
export { renderProcessedKaraokeMp3, renderKaraokePreviewMix } from "./audioExport";
import { karaokeGuideSettings, type KaraokeGuideMode } from "./karaokeGuide";
import { createVocalMonitor, karaokeBackingGainForRms, vocalCaptureProfile, type RecordingCaptureMode } from "./vocalCapture";
import { createAudioBufferFromPcm, encodeAudioBufferToWav, findBuiltInMicrophoneDeviceId, forceBuiltInMicrophoneStream, startPcmStreamCapture, type PcmStreamCapture } from "./pcmRecorder";
import { createArrangementVoiceState } from "./accompanimentPerformance";
export { karaokeBackingGainForRms } from "./vocalCapture";
export type KaraokeRecordingResult = Readonly<{
  blob: Blob;
  audioBuffer: AudioBuffer;
  vocalAudioBuffer: AudioBuffer;
  backingAudioBuffer: AudioBuffer;
  durationSeconds: number;
  introSeconds: number;
  wavBlob?: Blob;
}>;

export type { KaraokePostProcessPreset } from "./audioExport";

export type KaraokeRecordingCallbacks = Readonly<{
  guideMelodyMode?: KaraokeGuideMode;
  recordingMode?: RecordingCaptureMode;
  onStatus?: (message: string) => void;
  onInputLevel?: (level: number) => void;
  onPhase?: (phase: "intro" | "song" | "outro" | "encoding" | "done") => void;
  onCount?: (count: number | null) => void;
  onHighlight?: (highlight: Readonly<{
    section: "intro" | "song" | "outro";
    measureIndex: number | null;
    noteId: string | null;
  }>) => void;
}>;
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
  measures: readonly PlaybackMeasure[],
  instrumentId: InstrumentId = "piano",
  bpm = 96,
  accompaniment?: AccompanimentOptions,
  callbacks: KaraokeRecordingCallbacks = {},
  countIn: Readonly<{ beats: number; unitBeats: number }> = { beats: 4, unitBeats: 1 },
  signal?: AbortSignal
): Promise<number | null> {
  accompaniment = prepareAccompaniment(accompaniment, measures);
  if (activePlaybackContext || activeOfflineExport) return null;
  const AudioContextClass = window.AudioContext ||
    (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) {
    throw new Error("이 브라우저에서는 노래 연습 재생을 사용할 수 없어요.");
  }

  const context = new AudioContextClass();
  activePlaybackContext = context;
  let callbackTimers: number[] = [];
  let finishPractice: ((completed: boolean) => void) | null = null;
  let aborted = signal?.aborted === true;
  const stopPractice = () => {
    aborted = true;
    callbackTimers.forEach((timer) => window.clearTimeout(timer));
    callbackTimers = [];
    finishPractice?.(false);
    finishPractice = null;
    if (context.state !== "closed") void context.close().catch(() => undefined);
  };
  const throwIfAborted = () => {
    if (aborted || signal?.aborted) throw new DOMException("노래 연습이 중단되었어요.", "AbortError");
  };
  signal?.addEventListener("abort", stopPractice, { once: true });

  try {
    throwIfAborted();
    if (context.state === "suspended") await context.resume();
    callbacks.onStatus?.("연습 반주와 메인 가락을 준비하고 있어요.");
    const secondsPerBeat = 60 / bpm;
    const introMeasures = buildIntroMeasures(measures);
    const outroMeasures = buildOutroMeasures(measures);
    const tailSeconds = 0.55;
    const master = createProtectedMaster(context, context.destination, 0.84);
    const instrument = findInstrument(instrumentId);
    let sampledInstrument: Awaited<ReturnType<typeof loadSampleInstrument>> | null = null;
    try {
      sampledInstrument = await loadSampleWithTimeout(context, master, instrumentId);
    } catch (error) {
      console.warn("연습용 메인 악기 샘플을 불러오지 못해 합성 음색을 사용합니다.", error);
    }
    throwIfAborted();
    const accompanimentLayers = await loadAccompanimentLayers(context, master, accompaniment);
    throwIfAborted();
    const voiceState = createArrangementVoiceState();
    const start = context.currentTime + 0.35;
    let cursor = 0;
    const queueCallback = (relativeSeconds: number, callback: () => void) => {
      callbackTimers.push(window.setTimeout(callback,
        Math.max(0, (start - context.currentTime + relativeSeconds) * 1000)));
    };

    callbacks.onPhase?.("intro");
    callbacks.onHighlight?.({ section: "intro", measureIndex: null, noteId: null });
    callbacks.onStatus?.("4마디 인트로를 들으며 준비해요. 마지막 카운트 뒤에 메인 가락이 시작돼요.");
    introMeasures.forEach((measure, introIndex) => {
      const measureStart = cursor;
      const measureBeats = measure.notes.reduce((total, note) => total + toNumber(note.duration), 0);
      const chordSymbols = measure.chords && measure.chords.length > 0 ? measure.chords : [""];
      const chordBeats = measureBeats / chordSymbols.length;
      let eventIndex = 0;
      chordSymbols.forEach((_, chordIndex) => {
        createAccompanimentPattern(accompaniment?.styleId ?? "arpeggio", chordBeats, accompaniment?.meter)
          .forEach((event) => {
            const noteId = `intro-${introIndex}-${eventIndex}`;
            queueCallback(measureStart + (chordIndex * chordBeats + event.offsetBeats) * secondsPerBeat, () => {
              callbacks.onHighlight?.({ section: "intro", measureIndex: introIndex, noteId });
            });
            eventIndex += 1;
          });
      });
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

    const introEndsAfterSeconds = cursor;
    const countDurationSeconds = countIn.beats * countIn.unitBeats * secondsPerBeat;
    const countStartsAfterSeconds = Math.max(0, introEndsAfterSeconds - countDurationSeconds);
    for (let count = countIn.beats; count >= 1; count -= 1) {
      const offset = countStartsAfterSeconds + (countIn.beats - count) * countIn.unitBeats * secondsPerBeat;
      queueCallback(offset, () => callbacks.onCount?.(count));
    }
    queueCallback(introEndsAfterSeconds, () => {
      callbacks.onPhase?.("song");
      callbacks.onCount?.(null);
      callbacks.onStatus?.("메인 가락을 들으며 함께 불러 보세요. 녹음되지는 않아요.");
    });

    let songNoteCursor = introEndsAfterSeconds;
    measures.forEach((measure, measureIndex) => {
      let noteCursor = songNoteCursor;
      measure.notes.forEach((note) => {
        const noteDuration = toNumber(note.duration) * secondsPerBeat;
        if (note.pitch !== null) {
          queueCallback(noteCursor, () => {
            callbacks.onHighlight?.({
              section: "song",
              measureIndex: measure.measureIndex ?? measureIndex,
              noteId: note.id
            });
          });
        }
        noteCursor += noteDuration;
      });
      songNoteCursor += measureSeconds(measure, secondsPerBeat);
      const plan = recordingArrangementPlan(measureIndex, measures.length, accompanimentLayers.length);
      cursor += scheduleMeasure(context, master, { ...measure, measureIndex: measure.measureIndex ?? measureIndex }, start + cursor, secondsPerBeat, {
        instrument,
        sampledInstrument,
        accompaniment,
        accompanimentLayers,
        voiceState,
        includeMelody: true,
        includeEffects: true,
        melodyVolumeMultiplier: .82,
        arrangementLayerCount: plan.layerCount,
        ending: measure.isSongEnding ?? (measures.length > 1 && measureIndex === measures.length - 1),
        transitionFill: ((measure.measureIndex ?? measureIndex) + 1) % 4 === 0,
        arrangementEnergy: plan.energy
      });
    });

    const outroStartsAfterSeconds = cursor;
    queueCallback(outroStartsAfterSeconds, () => {
      callbacks.onPhase?.("outro");
      callbacks.onHighlight?.({ section: "outro", measureIndex: null, noteId: null });
      callbacks.onStatus?.("잘했어요! 4마디 아웃트로까지 편하게 들어 보세요.");
    });
    outroMeasures.forEach((measure, outroIndex) => {
      const measureStart = cursor;
      const measureBeats = measure.notes.reduce((total, note) => total + toNumber(note.duration), 0);
      const chordSymbols = measure.chords && measure.chords.length > 0 ? measure.chords : [""];
      const chordBeats = measureBeats / chordSymbols.length;
      let eventIndex = 0;
      chordSymbols.forEach((_, chordIndex) => {
        createAccompanimentPattern(accompaniment?.styleId ?? "arpeggio", chordBeats, accompaniment?.meter)
          .forEach((event) => {
            const noteId = `outro-${outroIndex}-${eventIndex}`;
            queueCallback(measureStart + (chordIndex * chordBeats + event.offsetBeats) * secondsPerBeat, () => {
              callbacks.onHighlight?.({ section: "outro", measureIndex: outroIndex, noteId });
            });
            eventIndex += 1;
          });
      });
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

    const totalSeconds = cursor + tailSeconds;
    const completed = await new Promise<boolean>((resolve) => {
      finishPractice = resolve;
      queueCallback(totalSeconds, () => {
        callbacks.onHighlight?.({ section: "outro", measureIndex: null, noteId: null });
        callbacks.onCount?.(null);
        callbacks.onPhase?.("done");
        callbacks.onStatus?.("연습이 끝났어요. 이제 가락을 떠올리며 한 번 더 불러 보세요.");
        finishPractice = null;
        resolve(true);
      });
    });
    return completed ? totalSeconds : null;
  } catch (error) {
    if (aborted || signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) return null;
    throw error;
  } finally {
    signal?.removeEventListener("abort", stopPractice);
    callbackTimers.forEach((timer) => window.clearTimeout(timer));
    releaseAccompanimentRuntime(context);
    releaseSampleContext(context);
    if (activePlaybackContext === context) activePlaybackContext = null;
    if (context.state !== "closed") await context.close().catch(() => undefined);
  }
}

export async function recordKaraokeComposition(
  measures: readonly PlaybackMeasure[],
  instrumentId: InstrumentId = "piano",
  bpm = 96,
  accompaniment?: AccompanimentOptions,
  callbacks: KaraokeRecordingCallbacks = {},
  countIn: Readonly<{ beats: number; unitBeats: number }> = { beats: 4, unitBeats: 1 },
  signal?: AbortSignal
): Promise<KaraokeRecordingResult | null> {
  accompaniment = prepareAccompaniment(accompaniment, measures);
  if (activePlaybackContext || activeOfflineExport) return null;
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("이 브라우저에서는 마이크 녹음을 사용할 수 없어요.");
  }

  const AudioContextClass = window.AudioContext ||
    (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) {
    throw new Error("이 브라우저에서는 오디오 녹음을 사용할 수 없어요.");
  }
  const context = new AudioContextClass();
  activePlaybackContext = context;

  // ── iOS / Android AudioContext 유지 대책 ─────────────────────────────────
  // iOS는 마이크 하드웨어가 켜질 때 오디오 라우팅이 바뀌면서 AudioContext를
  // suspended 상태로 되돌린다. statechange 이벤트는 외부 정지 시 발화하지 않을 수
  // 있으므로 세 가지 방어막을 함께 사용한다.
  //
  // 1) statechange + onstatechange: 이벤트로 감지되면 즉시 resume 재시도
  // 2) 폴링: 200ms마다 상태를 직접 확인
  // 3) silent keep-alive: 무음 버퍼를 loop=true로 재생 → iOS가 "오디오 재생 중"
  //    으로 인식해 AudioContext를 자동 정지시키지 않음
  const handleContextStateChange = () => {
    if (context.state === "suspended") {
      void context.resume().catch(() => undefined);
    }
  };
  context.addEventListener("statechange", handleContextStateChange);
  context.onstatechange = handleContextStateChange;

  // silent keep-alive 소스 (gain=0이지만 loop 재생으로 AudioContext를 활성 상태 유지)
  let keepAliveSource: AudioBufferSourceNode | null = null;
  const keepAliveBuffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
  keepAliveSource = context.createBufferSource();
  keepAliveSource.buffer = keepAliveBuffer;
  keepAliveSource.loop = true;
  const keepAliveGain = context.createGain();
  keepAliveGain.gain.value = 0.00001;
  keepAliveSource.connect(keepAliveGain).connect(context.destination);
  keepAliveSource.start();

  // 폴링 fallback: statechange 미발화 시 200ms마다 직접 resume 시도
  const keepAliveInterval = window.setInterval(() => {
    if (context.state === "suspended") {
      void context.resume().catch(() => undefined);
    }
  }, 200);
  // ─────────────────────────────────────────────────────────────────────────

  let callbackTimers: number[] = [];
  let microphoneStream: MediaStream | null = null;
  let stopVocalMonitor: (() => void) | null = null;
  let pcmCaptures: PcmStreamCapture[] = [];
  const abortRecording = () => {
    callbackTimers.forEach((timer) => window.clearTimeout(timer));
    callbackTimers = [];
    pcmCaptures.forEach((capture) => void capture.stop().catch(() => undefined));
    microphoneStream?.getTracks().forEach((track) => track.stop());
    callbacks.onInputLevel?.(0);
    if (context.state !== "closed") void context.close().catch(() => undefined);
  };

  const throwIfAborted = () => {
    if (signal?.aborted) throw new DOMException("녹음을 중단했어요.", "AbortError");
  };
  signal?.addEventListener("abort", abortRecording, { once: true });
  const recordingMode = callbacks.recordingMode ?? "personal";
  const capture = vocalCaptureProfile(recordingMode);

  try {
    throwIfAborted();
    // iOS Safari는 사용자 제스처 스택이 살아있는 동안에만 AudioContext를 활성화할 수 있다.
    // getUserMedia 프롬프트를 기다리면 그 타이밍을 잃으므로, 반드시 getUserMedia 전에 resume한다.
    if (context.state === "suspended") await context.resume();
    callbacks.onStatus?.("마이크 권한을 허용해 주세요.");
    let builtInDeviceId = await findBuiltInMicrophoneDeviceId().catch(() => null);
    const audioConstraints: MediaTrackConstraints = {
      ...capture.constraints,
      ...(builtInDeviceId ? { deviceId: { ideal: builtInDeviceId } } : {})
    };
    try {
      microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
    } catch {
      microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }
    throwIfAborted();

    // 마이크 권한 승인 직후 스마트폰 본체 마이크로 강제 전환 (이어폰/블루투스 연결 시 8kHz/16kHz HFP 대신 본체 48kHz 스튜디오 캡슐 강제)
    const forcedMic = await forceBuiltInMicrophoneStream(microphoneStream, capture.constraints);
    microphoneStream = forcedMic.stream;
    throwIfAborted();
    // getUserMedia 이후에도 suspended 상태가 되는 경우(일부 Android)를 대비해 재시도
    if (context.state === "suspended") await context.resume();

    callbacks.onStatus?.(recordingMode === "choir"
      ? "4마디 반주 동안 교실 소리를 확인한 뒤 합창을 녹음해요."
      : "4마디 반주 뒤에 노래가 녹음돼요.");
    const secondsPerBeat = 60 / bpm;
    const introMeasures = buildIntroMeasures(measures);
    const outroMeasures = buildOutroMeasures(measures);
    const introSeconds = compositionSeconds(introMeasures, secondsPerBeat);
    const songSeconds = compositionSeconds(measures, secondsPerBeat);
    const outroSeconds = compositionSeconds(outroMeasures, secondsPerBeat);
    const tailSeconds = 0.8;
    const guide = karaokeGuideSettings(recordingMode === "choir" ? "off" : callbacks.guideMelodyMode ?? "first-note");

    const master = context.createGain();
    master.gain.value = karaokeBackingGainForRms(0);
    const guideBus = context.createGain();
    const vocalBus = context.createGain();
    vocalBus.gain.value = capture.vocalBusGain;

    master.connect(context.destination);
    guideBus.connect(context.destination);

    const microphone = context.createMediaStreamSource(microphoneStream);
    // 원음 녹음: 필터, 게이트, 컴프레서, 리버브 등 특별한 처리를 배제하고
    // 마이크에서 들어오는 목소리 원음을 있는 그대로 깨끗하게 vocalBus로 연결한다.
    microphone.connect(vocalBus);
    stopVocalMonitor = createVocalMonitor(context, microphone, master, callbacks.onInputLevel, recordingMode);


    const instrument = findInstrument(instrumentId);
    let sampledInstrument: Awaited<ReturnType<typeof loadSampleInstrument>> | null = null;
    if (guide.includeMelody) {
      try {
        sampledInstrument = await loadSampleWithTimeout(context, guideBus, instrumentId);
      } catch (error) {
        console.warn("가락 도움 악기 샘플을 불러오지 못해 합성 음색을 사용합니다.", error);
      }
    }
    const accompanimentLayers = await loadAccompanimentLayers(context, master, accompaniment);
    throwIfAborted();
    const voiceState = createArrangementVoiceState();

    // 샘플·반주 로딩 도중 await가 여러 번 발생한다. 이 구간에 iOS/Android가
    // AudioContext를 정지시켰을 수 있으므로 MediaRecorder 시작 전에 재확인한다.
    // 300ms 대기는 마이크 하드웨어 라우팅이 완전히 안정될 시간을 준다.
    if (context.state === "suspended") await context.resume();
    await new Promise<void>((resolve) => window.setTimeout(resolve, 300));
    if (context.state === "suspended") await context.resume();
    throwIfAborted();
    // 100% 디지털 무손실 32-bit Float PCM 캡처 시작 (vocalBus 원음 + master 반주)
    const vocalPcmCapture = await startPcmStreamCapture(context, vocalBus);
    const backingPcmCapture = await startPcmStreamCapture(context, master);
    pcmCaptures = [vocalPcmCapture, backingPcmCapture];

    const start = context.currentTime + 0.6;
    let cursor = 0;

    const queueCallback = (relativeSeconds: number, callback: () => void) => {
      callbackTimers.push(window.setTimeout(callback, Math.max(0, (start - context.currentTime + relativeSeconds) * 1000)));
    };
    callbacks.onPhase?.("intro");
    callbacks.onHighlight?.({ section: "intro", measureIndex: null, noteId: null });
    callbacks.onStatus?.("4마디 반주 인트로가 먼저 재생돼요. 아직 노래하지 않아도 괜찮아요.");

    introMeasures.forEach((measure, introIndex) => {
      const measureStart = cursor;
      const measureBeats = measure.notes.reduce((total, note) => total + toNumber(note.duration), 0);
      const chordSymbols = measure.chords && measure.chords.length > 0 ? measure.chords : [""];
      const chordBeats = measureBeats / chordSymbols.length;
      let eventIndex = 0;
      chordSymbols.forEach((_, chordIndex) => {
        createAccompanimentPattern(accompaniment?.styleId ?? "arpeggio", chordBeats, accompaniment?.meter).forEach((event) => {
          const noteId = `intro-${introIndex}-${eventIndex}`;
          queueCallback(measureStart + (chordIndex * chordBeats + event.offsetBeats) * secondsPerBeat, () => {
            callbacks.onHighlight?.({ section: "intro", measureIndex: introIndex, noteId });
          });
          eventIndex += 1;
        });
      });
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
    const introEndsAfterSeconds = cursor;
    const countDurationSeconds = countIn.beats * countIn.unitBeats * secondsPerBeat;
    const countStartsAfterSeconds = Math.max(0, introEndsAfterSeconds - countDurationSeconds);
    for (let count = countIn.beats; count >= 1; count -= 1) {
      const offset = countStartsAfterSeconds + (countIn.beats - count) * countIn.unitBeats * secondsPerBeat;
      queueCallback(offset, () => callbacks.onCount?.(count));
    }
    const songStartsAfterSeconds = introEndsAfterSeconds;
    queueCallback(songStartsAfterSeconds, () => {
      callbacks.onPhase?.("song");
      callbacks.onCount?.(null);
      callbacks.onStatus?.("지금부터 노래를 불러 주세요. 녹음 중이에요.");
    });
    cursor = songStartsAfterSeconds;
    let songNoteCursor = songStartsAfterSeconds;
    measures.forEach((measure, measureIndex) => {
      const measureStart = songNoteCursor;
      let noteCursor = measureStart;
      measure.notes.forEach((note) => {
        const noteDuration = toNumber(note.duration) * secondsPerBeat;
        if (note.pitch !== null) {
          queueCallback(noteCursor, () => {
            callbacks.onHighlight?.({
              section: "song",
              measureIndex: measure.measureIndex ?? null,
              noteId: note.id
            });
          });
        }
        noteCursor += noteDuration;
      });
      songNoteCursor += measureSeconds(measure, secondsPerBeat);
      const plan = recordingArrangementPlan(measureIndex, measures.length, accompanimentLayers.length);
      cursor += scheduleMeasure(context, master, { ...measure, measureIndex: measure.measureIndex ?? measureIndex }, start + cursor, secondsPerBeat, {
        instrument,
        sampledInstrument,
        accompaniment,
        accompanimentLayers,
        voiceState,
        includeMelody: guide.includeMelody,
        includeEffects: true,
        melodyDestination: guideBus,
        melodyMode: guide.melodyMode,
        melodyVolumeMultiplier: guide.volume,
        arrangementLayerCount: plan.layerCount,
        ending: measure.isSongEnding ?? (measures.length > 1 && measureIndex === measures.length - 1),
        transitionFill: ((measure.measureIndex ?? measureIndex) + 1) % 4 === 0,
        arrangementEnergy: plan.energy
      });
    });
    const outroStartsAfterSeconds = cursor;
    queueCallback(outroStartsAfterSeconds, () => {
      callbacks.onPhase?.("outro");
      callbacks.onHighlight?.({ section: "outro", measureIndex: null, noteId: null });
      callbacks.onStatus?.("노래가 끝났어요. 4마디 아웃트로 반주 뒤 자동 저장돼요.");
    });
    outroMeasures.forEach((measure, outroIndex) => {
      const measureStart = cursor;
      const measureBeats = measure.notes.reduce((total, note) => total + toNumber(note.duration), 0);
      const chordSymbols = measure.chords && measure.chords.length > 0 ? measure.chords : [""];
      const chordBeats = measureBeats / chordSymbols.length;
      let eventIndex = 0;
      chordSymbols.forEach((_, chordIndex) => {
        createAccompanimentPattern(accompaniment?.styleId ?? "arpeggio", chordBeats, accompaniment?.meter).forEach((event) => {
          const noteId = `outro-${outroIndex}-${eventIndex}`;
          queueCallback(measureStart + (chordIndex * chordBeats + event.offsetBeats) * secondsPerBeat, () => {
            callbacks.onHighlight?.({ section: "outro", measureIndex: outroIndex, noteId });
          });
          eventIndex += 1;
        });
      });
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

    const [vocalPcm, backingPcm] = await new Promise<[Float32Array, Float32Array]>((resolve, reject) => {
      const handleAbort = () => {
        reject(new DOMException("녹음을 중단했어요.", "AbortError"));
      };
      if (signal?.aborted) {
        handleAbort();
        return;
      }
      signal?.addEventListener("abort", handleAbort, { once: true });

      queueCallback(cursor + tailSeconds, async () => {
        signal?.removeEventListener("abort", handleAbort);
        try {
          const results = await Promise.all([vocalPcmCapture.stop(), backingPcmCapture.stop()]);
          resolve(results);
        } catch (err) {
          reject(err);
        }
      });
    });

    callbackTimers.forEach((timer) => window.clearTimeout(timer));
    callbackTimers = [];
    throwIfAborted();
    callbacks.onHighlight?.({ section: "outro", measureIndex: null, noteId: null });
    callbacks.onPhase?.("encoding");
    callbacks.onStatus?.("고음질 오디오로 변환하는 중이에요.");

    // 손실 압축(MediaRecorder/WebM/Opus) 및 decodeAudioData 없이 32-bit Float PCM에서 직접 AudioBuffer 생성
    const vocalAudioBuffer = createAudioBufferFromPcm(context, vocalPcm, 1);
    throwIfAborted();
    const backingAudioBuffer = createAudioBufferFromPcm(context, backingPcm, 2);
    throwIfAborted();
    const initialMix = await renderKaraokePreviewMix(vocalAudioBuffer, backingAudioBuffer, 1.0, introSeconds + 0.6, outroSeconds);
    throwIfAborted();
    const wavBlob = encodeAudioBufferToWav(initialMix.audioBuffer);
    callbacks.onStatus?.("녹음 저장 준비가 끝났어요.");
    callbacks.onPhase?.("done");
    return {
      blob: initialMix.blob,
      audioBuffer: initialMix.audioBuffer,
      vocalAudioBuffer,
      backingAudioBuffer,
      durationSeconds: introSeconds + songSeconds + outroSeconds + tailSeconds,
      introSeconds: introSeconds + 0.6,
      wavBlob
    };

  } finally {
    signal?.removeEventListener("abort", abortRecording);
    context.removeEventListener("statechange", handleContextStateChange);
    context.onstatechange = null;
    window.clearInterval(keepAliveInterval);
    try { keepAliveSource?.stop(); } catch { /* already stopped */ }
    callbackTimers.forEach((timer) => window.clearTimeout(timer));
    stopVocalMonitor?.();
    microphoneStream?.getTracks().forEach((track) => track.stop());
    releaseAccompanimentRuntime(context);
    releaseSampleContext(context);
    if (activePlaybackContext === context) activePlaybackContext = null;
    if (context.state !== "closed") await context.close().catch(() => undefined);
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

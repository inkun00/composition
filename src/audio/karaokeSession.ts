import type { InstrumentId } from "../music/instruments";
import { createProtectedMaster, type AccompanimentOptions, type PlaybackMeasure } from "./accompanimentScore";
import { renderKaraokePreviewMix } from "./audioExport";
import { prepareKaraokeAudio, type PreparedKaraokeAudio } from "./karaokePreparation";
import { prepareKaraokeTimeline, startKaraokeClock } from "./karaokeTimeline";
import type { KaraokeCountIn, KaraokeRecordingCallbacks, KaraokeRecordingResult } from "./karaokeTypes";
import { createAudioBufferFromPcm, encodeAudioBufferToWav, findBuiltInMicrophoneDeviceId,
  forceBuiltInMicrophoneStream, startPcmStreamCapture, type PcmStreamCapture } from "./pcmRecorder";
import { createVocalMonitor, karaokeBackingGainForRms, vocalCaptureProfile } from "./vocalCapture";

function checkAbort(context: AudioContext, signal?: AbortSignal) {
  if (signal?.aborted || context.state === "closed") throw new DOMException("노래 재생을 중단했어요.", "AbortError");
}

/** Permission prompts cannot be canceled, but late streams must never stay live. */
function awaitMicrophone(pending: Promise<MediaStream>, signal: AbortSignal): Promise<MediaStream> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException("녹음을 중단했어요.", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    pending.then((stream) => {
      if (signal.aborted) stream.getTracks().forEach((track) => track.stop());
      else resolve(stream);
    }, reject).finally(() => signal.removeEventListener("abort", abort));
    if (signal.aborted) abort();
  });
}

function startBuffers(context: AudioContext, audio: PreparedKaraokeAudio, start: number,
  backing: AudioNode, guide: AudioNode): () => void {
  const sources: AudioBufferSourceNode[] = [];
  try {
    for (const [buffer, destination] of [[audio.backing, backing], [audio.guide, guide]] as const) {
      if (!buffer) continue;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(destination);
      sources.push(source);
      source.start(start);
    }
  } catch (error) {
    for (const source of sources) {
      try { source.stop(); } catch { /* not started */ }
      source.disconnect();
    }
    throw error;
  }
  return () => {
    for (const source of sources) {
      try { source.stop(); } catch { /* already ended */ }
      source.disconnect();
    }
  };
}

/** Microphone routing can suspend a mobile context; keep only this session alive. */
function keepContextRunning(context: AudioContext): () => void {
  const resume = () => { if (context.state === "suspended") void context.resume().catch(() => undefined); };
  context.addEventListener("statechange", resume);
  const timer = window.setInterval(resume, 200);
  const source = context.createBufferSource();
  source.buffer = context.createBuffer(1, 1, context.sampleRate);
  source.loop = true;
  const gain = context.createGain();
  gain.gain.value = .00001;
  source.connect(gain).connect(context.destination);
  source.start();
  return () => {
    context.removeEventListener("statechange", resume);
    window.clearInterval(timer);
    try { source.stop(); } catch { /* already closed */ }
    source.disconnect();
    gain.disconnect();
  };
}

export async function runKaraokePractice(context: AudioContext, measures: readonly PlaybackMeasure[],
  instrumentId: InstrumentId, bpm: number, accompaniment: AccompanimentOptions | undefined,
  callbacks: KaraokeRecordingCallbacks, countIn: KaraokeCountIn, signal?: AbortSignal): Promise<number | null> {
  const preparation = new AbortController();
  let stopClock: (() => void) | undefined;
  let stopSources: (() => void) | undefined;
  const stop = () => {
    preparation.abort();
    stopClock?.();
    stopSources?.();
    if (context.state !== "closed") void context.close().catch(() => undefined);
  };
  signal?.addEventListener("abort", stop, { once: true });
  try {
    checkAbort(context, signal);
    if (context.state === "suspended") await context.resume();
    callbacks.onStatus?.("끊김 없이 연습할 반주와 가락을 준비하고 있어요.");
    const audio = await prepareKaraokeAudio(measures, instrumentId, bpm, accompaniment,
      { sampleRate: context.sampleRate, mode: "practice", signal: preparation.signal });
    const events = prepareKaraokeTimeline(measures, bpm, accompaniment, countIn, true);
    checkAbort(context, signal);
    if (context.state === "suspended") await context.resume();
    const master = createProtectedMaster(context, context.destination, .84);
    const start = context.currentTime + .35;
    stopSources = startBuffers(context, audio, start, master, master);
    const completed = await new Promise<boolean>((resolve) => {
      stopClock = startKaraokeClock(context, start, audio.durationSeconds, events, callbacks, resolve);
    });
    checkAbort(context, signal);
    if (!completed) return null;
    callbacks.onHighlight?.({ section: "outro", measureIndex: null, noteId: null });
    callbacks.onCount?.(null);
    callbacks.onPhase?.("done");
    callbacks.onStatus?.("연습이 끝났어요. 이제 가락을 떠올리며 한 번 더 불러 보세요.");
    return audio.durationSeconds;
  } catch (error) {
    if (preparation.signal.aborted || signal?.aborted || context.state === "closed") return null;
    throw error;
  } finally {
    signal?.removeEventListener("abort", stop);
    stopClock?.();
    stopSources?.();
    if (context.state !== "closed") await context.close().catch(() => undefined);
  }
}

export async function runKaraokeRecording(context: AudioContext, measures: readonly PlaybackMeasure[],
  instrumentId: InstrumentId, bpm: number, accompaniment: AccompanimentOptions | undefined,
  callbacks: KaraokeRecordingCallbacks, countIn: KaraokeCountIn, signal?: AbortSignal): Promise<KaraokeRecordingResult | null> {
  const preparation = new AbortController();
  let microphoneStream: MediaStream | null = null;
  let stopClock: (() => void) | undefined;
  let stopSources: (() => void) | undefined;
  let stopMonitor: (() => void) | undefined;
  let stopKeepAlive: (() => void) | undefined;
  const captures: PcmStreamCapture[] = [];
  const abort = () => {
    preparation.abort();
    stopClock?.();
    stopSources?.();
    for (const capture of captures) void capture.stop().catch(() => undefined);
    microphoneStream?.getTracks().forEach((track) => track.stop());
    callbacks.onInputLevel?.(0);
    if (context.state !== "closed") void context.close().catch(() => undefined);
  };
  signal?.addEventListener("abort", abort, { once: true });
  const mode = callbacks.recordingMode ?? "personal";
  const profile = vocalCaptureProfile(mode);
  try {
    checkAbort(context, signal);
    if (context.state === "suspended") await context.resume();
    stopKeepAlive = keepContextRunning(context);
    callbacks.onStatus?.("끊김 없이 녹음할 반주와 비트를 준비하고 있어요.");
    const audio = await prepareKaraokeAudio(measures, instrumentId, bpm, accompaniment,
      { sampleRate: context.sampleRate, mode: "recording",
        guideMode: mode === "choir" ? "off" : callbacks.guideMelodyMode ?? "first-note", signal: preparation.signal });
    const events = prepareKaraokeTimeline(measures, bpm, accompaniment, countIn, false);
    checkAbort(context, signal);
    callbacks.onStatus?.("마이크 권한을 허용해 주세요.");
    const builtInDeviceId = await findBuiltInMicrophoneDeviceId().catch(() => null);
    checkAbort(context, signal);
    try {
      microphoneStream = await awaitMicrophone(navigator.mediaDevices.getUserMedia({ audio: {
        ...profile.constraints, ...(builtInDeviceId ? { deviceId: { ideal: builtInDeviceId } } : {})
      } }), preparation.signal);
    } catch (error) {
      checkAbort(context, signal);
      microphoneStream = await awaitMicrophone(navigator.mediaDevices.getUserMedia({ audio: true }), preparation.signal);
    }
    checkAbort(context, signal);
    microphoneStream = await awaitMicrophone(forceBuiltInMicrophoneStream(microphoneStream, profile.constraints)
      .then((forced) => forced.stream), preparation.signal);
    checkAbort(context, signal);
    if (context.state === "suspended") await context.resume();
    const master = context.createGain();
    master.gain.value = karaokeBackingGainForRms(0);
    master.connect(context.destination);
    const guide = context.createGain();
    guide.connect(context.destination);
    const vocal = context.createGain();
    vocal.gain.value = profile.vocalBusGain;
    const microphone = context.createMediaStreamSource(microphoneStream);
    microphone.connect(vocal);
    stopMonitor = createVocalMonitor(context, microphone, master, callbacks.onInputLevel, mode);
    // Capture only the microphone and post-ducking backing; guide is monitor-only.
    captures.push(await startPcmStreamCapture(context, vocal));
    checkAbort(context, signal);
    captures.push(await startPcmStreamCapture(context, master));
    checkAbort(context, signal);
    if (context.state === "suspended") await context.resume();
    const start = context.currentTime + .6;
    stopSources = startBuffers(context, audio, start, master, guide);
    const completed = await new Promise<boolean>((resolve) => {
      stopClock = startKaraokeClock(context, start, audio.durationSeconds, events, callbacks, resolve);
    });
    checkAbort(context, signal);
    if (!completed) throw new DOMException("녹음을 중단했어요.", "AbortError");
    const [vocalPcm, backingPcm] = await Promise.all(captures.map((capture) => capture.stop()));
    checkAbort(context, signal);
    stopMonitor();
    stopMonitor = undefined;
    callbacks.onHighlight?.({ section: "outro", measureIndex: null, noteId: null });
    callbacks.onPhase?.("encoding");
    callbacks.onStatus?.("고음질 오디오로 변환하는 중이에요.");
    const vocalAudioBuffer = createAudioBufferFromPcm(context, vocalPcm, 1);
    const backingAudioBuffer = createAudioBufferFromPcm(context, backingPcm, 2);
    const introSeconds = audio.introSeconds + .6;
    const mix = await renderKaraokePreviewMix(vocalAudioBuffer, backingAudioBuffer, 1, introSeconds, audio.outroSeconds);
    checkAbort(context, signal);
    const wavBlob = encodeAudioBufferToWav(mix.audioBuffer);
    callbacks.onPhase?.("done");
    callbacks.onStatus?.("녹음 저장 준비가 끝났어요.");
    return { blob: mix.blob, audioBuffer: mix.audioBuffer, vocalAudioBuffer, backingAudioBuffer,
      durationSeconds: audio.durationSeconds, introSeconds, wavBlob };
  } finally {
    preparation.abort();
    signal?.removeEventListener("abort", abort);
    stopClock?.();
    stopSources?.();
    stopMonitor?.();
    stopKeepAlive?.();
    microphoneStream?.getTracks().forEach((track) => track.stop());
    await Promise.allSettled(captures.map((capture) => capture.stop()));
    if (context.state !== "closed") await context.close().catch(() => undefined);
  }
}

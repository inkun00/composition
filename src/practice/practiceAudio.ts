import { Mp3Encoder } from "@breezystack/lamejs";
import { preloadBeatSamples, scheduleLoadedBeatSample } from "../audio/beatSamples";
import { loadSampleInstrument, queueSampleNote, releaseSampleInstrument } from "../audio/samplePlayer";
import { isBeatInstrumentId } from "../music/beatInstruments";
import { findInstrument, isValidInstrumentId, type Instrument } from "../music/instruments";
import { buildPracticeAudioPlan } from "./practiceAudioTimeline";
import type { PracticeAudioEvent, PracticeAudioInput, PracticeAudioTrack, PracticeRenderedAudio, PracticeTimeline } from "./practiceAudioTypes";

export {
  buildPracticeTimeline,
  practiceMeasureAudioInput,
  practiceScoreAudioInput,
  practiceNoteAtTime,
  practiceNotesAtTime
} from "./practiceAudioTimeline";
export type {
  PracticeAudioEvent,
  PracticeAudioInput,
  PracticeRenderedAudio,
  PracticeTimeline
} from "./practiceAudioTypes";

type RenderOptions = Readonly<{
  signal?: AbortSignal;
  onProgress?: (percent: number) => void;
}>;

function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("작업을 멈췄어요.", "AbortError");
}

async function prepareWithTimeout<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abortListener: (() => void) | undefined;
  try {
    checkAbort(signal);
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("악기 샘플을 준비하는 시간이 길어졌어요.")), 4000);
        abortListener = () => reject(new DOMException("작업을 멈췄어요.", "AbortError"));
        signal?.addEventListener("abort", abortListener, { once: true });
      })
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (abortListener) signal?.removeEventListener("abort", abortListener);
  }
}

function scheduleFallbackTone(
  context: BaseAudioContext,
  destination: AudioNode,
  pitch: number,
  start: number,
  duration: number,
  instrument: Instrument,
  percussion: boolean
): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = percussion ? "triangle" : instrument.wave;
  oscillator.frequency.setValueAtTime(440 * 2 ** ((pitch - 69) / 12), start);
  const end = start + duration;
  const attack = Math.min(duration / 4, Math.max(0.003, instrument.attack));
  const release = Math.min(duration / 3, Math.max(0.008, instrument.release));
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(instrument.volume, start + attack);
  gain.gain.setValueAtTime(instrument.volume, end - release);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  oscillator.connect(gain).connect(destination);
  oscillator.start(start);
  oscillator.stop(end);
}

function soundEvents(timeline: PracticeTimeline): PracticeAudioEvent[] {
  const result: PracticeAudioEvent[] = [];
  let previous: PracticeAudioEvent | undefined;
  for (const event of timeline.events) {
    if (event.pitch !== null) {
      const last = result[result.length - 1];
      if (last && previous?.linkToNext && previous.pitch === event.pitch && Math.abs(last.endSeconds - event.startSeconds) < 0.000001) {
        result[result.length - 1] = { ...last, endSeconds: event.endSeconds };
      } else {
        result.push(event);
      }
    }
    previous = event;
  }
  return result;
}

type PreparedTrack = {
  track: PracticeAudioTrack;
  destination: GainNode;
  instrument: Instrument;
  percussion: boolean;
  beatId: string;
  sample: Awaited<ReturnType<typeof loadSampleInstrument>> | null;
};

function normalizeBuffer(buffer: AudioBuffer): void {
  let peak = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    for (const value of buffer.getChannelData(channel)) peak = Math.max(peak, Math.abs(value));
  }
  if (peak <= 0.95) return;
  const factor = 0.95 / peak;
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const samples = buffer.getChannelData(channel);
    for (let index = 0; index < samples.length; index += 1) samples[index] *= factor;
  }
}

/** Render all entered scores together, without adding a count-in or tail. */
export async function renderPracticeAudio(
  input: PracticeAudioInput,
  options: RenderOptions = {}
): Promise<PracticeRenderedAudio> {
  checkAbort(options.signal);
  const plan = buildPracticeAudioPlan(input);
  const timeline = plan.timeline;
  if (typeof OfflineAudioContext === "undefined") {
    throw new Error("이 브라우저에서는 연습 곡을 연주할 수 없어요. 최신 크롬이나 엣지에서 열어 주세요.");
  }
  const sampleRate = 44100;
  const context = new OfflineAudioContext(2, Math.ceil(timeline.durationSeconds * sampleRate), sampleRate);
  const destination = context.createGain();
  destination.gain.value = 0.9;
  destination.connect(context.destination);
  const prepared: PreparedTrack[] = plan.tracks.filter((track) =>
    track.timeline.events.some((event) => event.pitch !== null)
  ).map((track) => {
    const bus = context.createGain();
    bus.gain.value = 1;
    bus.connect(destination);
    const beatId = track.instrumentId.startsWith("beat:") ? track.instrumentId.slice(5) : track.instrumentId;
    return {
      track,
      destination: bus,
      instrument: findInstrument(track.instrumentId),
      percussion: track.rhythm && isBeatInstrumentId(beatId) &&
        (track.instrumentId.startsWith("beat:") || !isValidInstrumentId(track.instrumentId)),
      beatId,
      sample: null
    };
  });
  let usedFallback = false;
  options.onProgress?.(5);
  try {
    await Promise.all(prepared.map(async (voice) => {
      try {
        if (voice.percussion && isBeatInstrumentId(voice.beatId)) {
          await prepareWithTimeout(preloadBeatSamples(context, [voice.beatId]), options.signal);
        } else {
          voice.sample = await prepareWithTimeout(
            loadSampleInstrument(context, voice.destination, voice.track.instrumentId), options.signal
          );
        }
      } catch (error) {
        checkAbort(options.signal);
        usedFallback = true;
        console.warn("연습 악기 샘플 대신 기본 연주 소리를 사용합니다.", error);
      }
    }));
    checkAbort(options.signal);
    options.onProgress?.(30);
    for (const voice of prepared) {
      for (const [index, event] of soundEvents(voice.track.timeline).entries()) {
        const duration = event.endSeconds - event.startSeconds;
        if (voice.percussion && isBeatInstrumentId(voice.beatId) && scheduleLoadedBeatSample(
          context, voice.destination, event.startSeconds, 0.65, voice.beatId, index
        )) continue;
        if (voice.sample) {
          queueSampleNote(voice.sample, context, voice.destination, event.pitch!, event.startSeconds, duration, voice.instrument.volume);
        } else {
          usedFallback = true;
          scheduleFallbackTone(context, voice.destination, event.pitch!, event.startSeconds, duration, voice.instrument, voice.percussion);
        }
      }
    }
    // Prevent a cut-off sample tail from clicking, without adding extra time.
    const fadeStart = Math.max(0, timeline.durationSeconds - 0.008);
    destination.gain.setValueAtTime(0.9, fadeStart);
    destination.gain.linearRampToValueAtTime(0, timeline.durationSeconds);
    options.onProgress?.(50);
    const buffer = await context.startRendering();
    checkAbort(options.signal);
    normalizeBuffer(buffer);
    options.onProgress?.(100);
    return {
      buffer,
      timeline,
      ...(plan.tracks.length > 1 ? { layerTimelines: plan.tracks.slice(1).map((track) => track.timeline) } : {}),
      usedFallback
    };
  } finally {
    for (const voice of prepared) {
      if (!voice.percussion) releaseSampleInstrument(context, voice.destination, voice.track.instrumentId);
      voice.destination.disconnect();
    }
    destination.disconnect();
  }
}

function pcm16(samples: Float32Array): Int16Array {
  return Int16Array.from(samples, (sample) => {
    const limited = Math.max(-1, Math.min(1, sample));
    return limited < 0 ? limited * 0x8000 : limited * 0x7fff;
  });
}

export async function encodePracticeMp3(
  buffer: AudioBuffer,
  options: RenderOptions = {}
): Promise<Blob> {
  checkAbort(options.signal);
  const channels = Math.min(2, buffer.numberOfChannels);
  const encoder = new Mp3Encoder(channels, buffer.sampleRate, 192);
  const left = buffer.getChannelData(0);
  const right = channels > 1 ? buffer.getChannelData(1) : null;
  const chunks: BlobPart[] = [];
  for (let offset = 0; offset < left.length; offset += 1152) {
    checkAbort(options.signal);
    const first = pcm16(left.subarray(offset, offset + 1152));
    const chunk = right
      ? encoder.encodeBuffer(first, pcm16(right.subarray(offset, offset + 1152)))
      : encoder.encodeBuffer(first);
    if (chunk.length) chunks.push(new Uint8Array(chunk));
    if (offset % (1152 * 32) === 0) {
      options.onProgress?.(Math.round(offset / left.length * 95));
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }
  checkAbort(options.signal);
  const final = encoder.flush();
  if (final.length) chunks.push(new Uint8Array(final));
  options.onProgress?.(100);
  return new Blob(chunks, { type: "audio/mpeg" });
}

export async function exportPracticeMp4(
  rendered: PracticeRenderedAudio,
  input: PracticeAudioInput,
  options: RenderOptions = {}
): Promise<Blob> {
  checkAbort(options.signal);
  const { exportPracticeVideoMp4 } = await import("./exportPracticeVideoMp4");
  checkAbort(options.signal);
  return exportPracticeVideoMp4(rendered, input, options);
}

export function practiceAudioFileName(title: string, format: "mp3" | "mp4"): string {
  const cleaned = title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "").trim().replace(/[. ]+$/, "");
  return `${cleaned || "나의 연습 가락"}.${format}`;
}

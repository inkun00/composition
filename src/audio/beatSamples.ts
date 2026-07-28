import {
  normalizeBeatInstrumentIds,
  type BeatInstrumentId
} from "../music/beatInstruments";

const BEAT_SAMPLE_URLS: Readonly<Record<BeatInstrumentId, string>> = {
  kick: "/beat-samples/kick.mp3",
  "soft-kick": "/beat-samples/soft-kick.mp3",
  snare: "/beat-samples/snare.mp3",
  clap: "/sound-effects/curated/opengameart/Hand_Clap_01.wav",
  woodblock: "/beat-samples/woodblock.mp3",
  shaker: "/beat-samples/shaker.mp3",
  tambourine: "/beat-samples/tambourine.mp3",
  hihat: "/beat-samples/hihat.mp3",
  "floor-tom": "/beat-samples/floor-tom.mp3",
  djembe: "/beat-samples/djembe.mp3",
  conga: "/beat-samples/conga.mp3",
  cowbell: "/beat-samples/cowbell.mp3",
  triangle: "/beat-samples/triangle.mp3",
  timpani: "/beat-samples/timpani.mp3",
  cajon: "/beat-samples/cajon.mp3",
  bongo: "/beat-samples/bongo.mp3",
  claves: "/beat-samples/claves.mp3",
  ride: "/beat-samples/ride.mp3",
  guiro: "/beat-samples/guiro.mp3"
};

const sampleBuffers = new WeakMap<BaseAudioContext, Map<BeatInstrumentId, AudioBuffer>>();
const pendingLoads = new WeakMap<BaseAudioContext, Map<BeatInstrumentId, Promise<AudioBuffer | null>>>();

function contextBuffers(context: BaseAudioContext): Map<BeatInstrumentId, AudioBuffer> {
  const existing = sampleBuffers.get(context);
  if (existing) return existing;
  const created = new Map<BeatInstrumentId, AudioBuffer>();
  sampleBuffers.set(context, created);
  return created;
}

function contextLoads(context: BaseAudioContext): Map<BeatInstrumentId, Promise<AudioBuffer | null>> {
  const existing = pendingLoads.get(context);
  if (existing) return existing;
  const created = new Map<BeatInstrumentId, Promise<AudioBuffer | null>>();
  pendingLoads.set(context, created);
  return created;
}

async function loadBeatSample(
  context: BaseAudioContext,
  instrumentId: BeatInstrumentId
): Promise<AudioBuffer | null> {
  const buffers = contextBuffers(context);
  const cached = buffers.get(instrumentId);
  if (cached) return cached;
  const loads = contextLoads(context);
  const pending = loads.get(instrumentId);
  if (pending) return pending;

  const request = (async () => {
    try {
      const response = await fetch(BEAT_SAMPLE_URLS[instrumentId]);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = await context.decodeAudioData(await response.arrayBuffer());
      buffers.set(instrumentId, buffer);
      return buffer;
    } catch (error) {
      console.warn(`${instrumentId} 실제 비트 샘플을 불러오지 못해 합성음을 사용합니다.`, error);
      return null;
    } finally {
      loads.delete(instrumentId);
    }
  })();
  loads.set(instrumentId, request);
  return request;
}

export async function preloadBeatSamples(
  context: BaseAudioContext,
  instrumentIds: readonly BeatInstrumentId[]
): Promise<void> {
  await Promise.all(normalizeBeatInstrumentIds(instrumentIds)
    .map((instrumentId) => loadBeatSample(context, instrumentId)));
}

const sampleGain: Readonly<Record<BeatInstrumentId, number>> = {
  kick: 1,
  "soft-kick": 1.08,
  snare: .86,
  clap: .9,
  woodblock: .76,
  shaker: .82,
  tambourine: .72,
  hihat: .82,
  "floor-tom": .92,
  djembe: .9,
  conga: .84,
  cowbell: .66,
  triangle: .58,
  timpani: .56,
  cajon: .86,
  bongo: .88,
  claves: .7,
  ride: .58,
  guiro: .82
};

const sampleTailSeconds: Partial<Record<BeatInstrumentId, number>> = {
  timpani: 1.45,
  ride: 1.1
};

export function scheduleLoadedBeatSample(
  context: BaseAudioContext,
  destination: AudioNode,
  time: number,
  volume: number,
  instrumentId: BeatInstrumentId,
  variationSeed: number
): boolean {
  const buffer = sampleBuffers.get(context)?.get(instrumentId);
  if (!buffer) return false;
  const source = context.createBufferSource();
  const gain = context.createGain();
  source.buffer = buffer;
  source.playbackRate.value = 1 + ((variationSeed % 5) - 2) * .006;
  gain.gain.setValueAtTime(Math.max(.0001, volume * sampleGain[instrumentId]), time);
  const tailSeconds = sampleTailSeconds[instrumentId];
  if (tailSeconds) gain.gain.exponentialRampToValueAtTime(.0001, time + tailSeconds);
  source.connect(gain).connect(destination);
  source.start(time);
  if (tailSeconds) source.stop(time + tailSeconds + .01);
  return true;
}

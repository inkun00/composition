import {
  isBeatInstrumentId,
  type BeatInstrumentId
} from "../music/beatInstruments";
import { publicAssetUrl } from "../platform/portable";
import { BEAT_SAMPLE_RATES, preparedBeatLeadSeconds, preparedBeatSampleBytes, prepareBeatSampleVariants } from "./beatSamplePreparation";

export const BEAT_SAMPLE_URLS: Readonly<Record<BeatInstrumentId, string>> = {
  kick: "/beat-samples/kick.wav",
  "soft-kick": "/beat-samples/soft-kick.wav",
  snare: "/beat-samples/snare.wav",
  clap: "/sound-effects/curated/opengameart/Hand_Clap_01.wav",
  woodblock: "/beat-samples/woodblock.mp3",
  shaker: "/beat-samples/shaker.mp3",
  tambourine: "/beat-samples/tambourine.mp3",
  hihat: "/beat-samples/hihat.wav",
  "floor-tom": "/beat-samples/floor-tom.mp3",
  "rack-tom": "/beat-samples/rack-tom.wav",
  djembe: "/beat-samples/djembe.mp3",
  conga: "/beat-samples/conga.mp3",
  cowbell: "/beat-samples/cowbell.mp3",
  triangle: "/beat-samples/triangle.mp3",
  timpani: "/beat-samples/timpani.mp3",
  cajon: "/beat-samples/cajon.mp3",
  bongo: "/beat-samples/bongo.mp3",
  claves: "/beat-samples/claves.mp3",
  ride: "/beat-samples/ride.mp3",
  "open-hihat": "/beat-samples/open-hihat.wav",
  crash: "/beat-samples/crash.wav",
  guiro: "/beat-samples/guiro.mp3"
};

const sampleBuffers = new WeakMap<BaseAudioContext, Map<BeatInstrumentId, AudioBuffer>>();
const pendingLoads = new WeakMap<BaseAudioContext, Map<BeatInstrumentId, Promise<AudioBuffer | null>>>();
const MAX_PREPARED_BYTES = 24 * 1024 * 1024;
type PreparedSamples = {
  bytes: number;
  variants: Map<BeatInstrumentId, readonly AudioBuffer[]>;
  pending: Map<BeatInstrumentId, Promise<void>>;
};
const preparedSamples = new WeakMap<BaseAudioContext, PreparedSamples>();

async function prepareLoadedBeat(context: BaseAudioContext, instrumentId: BeatInstrumentId,
  buffer: AudioBuffer): Promise<void> {
  if (typeof OfflineAudioContext === "undefined" || context.state === "closed") return;
  let prepared = preparedSamples.get(context);
  if (!prepared) {
    prepared = { bytes: 0, variants: new Map(), pending: new Map() };
    preparedSamples.set(context, prepared);
  }
  if (prepared.variants.has(instrumentId)) return;
  const current = prepared.pending.get(instrumentId);
  if (current) return current;
  const bytes = preparedBeatSampleBytes(buffer, context.sampleRate);
  if (!Number.isFinite(bytes) || bytes <= 0 || prepared.bytes + bytes > MAX_PREPARED_BYTES) return;
  prepared.bytes += bytes;
  const cache = prepared;
  const pending = prepareBeatSampleVariants(buffer, BEAT_SAMPLE_MIX_PROFILES[instrumentId], context.sampleRate)
    .then((variants) => {
      if (context.state === "closed") cache.bytes -= bytes;
      else cache.variants.set(instrumentId, variants);
    }).catch((error: unknown) => {
      cache.bytes -= bytes;
      console.warn(`${instrumentId} 비트 사전 보정에 실패해 실시간 보정을 사용합니다.`, error);
    }).finally(() => cache.pending.delete(instrumentId));
  cache.pending.set(instrumentId, pending);
  return pending;
}

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
      const response = await fetch(publicAssetUrl(BEAT_SAMPLE_URLS[instrumentId]));
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
  await Promise.all([...new Set(instrumentIds.filter(isBeatInstrumentId))]
    .map(async (instrumentId) => {
      const buffer = await loadBeatSample(context, instrumentId);
      if (buffer) await prepareLoadedBeat(context, instrumentId, buffer);
    }));
}

export type BeatSampleMixProfile = Readonly<{
  outputGain: number;
  filterType: BiquadFilterType;
  frequency: number;
  filterGain: number;
  q?: number;
}>;

export const BEAT_SAMPLE_MIX_PROFILES: Readonly<Record<BeatInstrumentId, BeatSampleMixProfile>> = {
  kick: {
    outputGain: .92, filterType: "lowshelf", frequency: 105, filterGain: 4.5
  },
  "soft-kick": {
    outputGain: 1.05, filterType: "lowshelf", frequency: 115, filterGain: 3.5
  },
  snare: {
    outputGain: .82, filterType: "highshelf", frequency: 2600, filterGain: 3.5
  },
  clap: {
    outputGain: 1.05, filterType: "peaking", frequency: 1800, filterGain: 2.5, q: .8
  },
  woodblock: {
    outputGain: 1.25, filterType: "peaking", frequency: 1400, filterGain: 3, q: 1.3
  },
  shaker: {
    outputGain: 3.2, filterType: "highshelf", frequency: 5000, filterGain: 2
  },
  tambourine: {
    outputGain: 2.3, filterType: "highshelf", frequency: 5000, filterGain: 2
  },
  hihat: {
    outputGain: 1.25, filterType: "highshelf", frequency: 6000, filterGain: 2.5
  },
  "floor-tom": {
    outputGain: 3.2, filterType: "lowshelf", frequency: 160, filterGain: 4
  },
  "rack-tom": {
    outputGain: 1, filterType: "peaking", frequency: 220, filterGain: 3, q: 1
  },
  djembe: {
    outputGain: 1.3, filterType: "peaking", frequency: 240, filterGain: 3, q: 1
  },
  conga: {
    outputGain: 1.2, filterType: "peaking", frequency: 400, filterGain: 2.5, q: 1.1
  },
  cowbell: {
    outputGain: .72, filterType: "peaking", frequency: 850, filterGain: 2, q: 1.8
  },
  triangle: {
    outputGain: .65, filterType: "highshelf", frequency: 5000, filterGain: 2
  },
  timpani: {
    outputGain: 3, filterType: "lowshelf", frequency: 140, filterGain: 4
  },
  cajon: {
    outputGain: 1.7, filterType: "peaking", frequency: 1100, filterGain: 2.5, q: .8
  },
  bongo: {
    outputGain: 1.25, filterType: "peaking", frequency: 600, filterGain: 2.5, q: 1.1
  },
  claves: {
    outputGain: .72, filterType: "peaking", frequency: 2000, filterGain: 2, q: 1.4
  },
  ride: {
    outputGain: 2.8, filterType: "highshelf", frequency: 4500, filterGain: 3
  },
  "open-hihat": {
    outputGain: .92, filterType: "highshelf", frequency: 5200, filterGain: 2.5
  },
  crash: {
    outputGain: 1.15, filterType: "highshelf", frequency: 4200, filterGain: 3
  },
  guiro: {
    outputGain: 1.4, filterType: "peaking", frequency: 2800, filterGain: 3, q: 1.2
  }
};

const sampleTailSeconds: Partial<Record<BeatInstrumentId, number>> = {
  timpani: 1.45,
  ride: 1.1,
  "open-hihat": 1.25,
  crash: 1.45
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
  const profile = BEAT_SAMPLE_MIX_PROFILES[instrumentId];
  const variantIndex = ((variationSeed % BEAT_SAMPLE_RATES.length) + BEAT_SAMPLE_RATES.length) % BEAT_SAMPLE_RATES.length;
  // A newly created processor needs its normal coefficient startup for immediate
  // hits. Prepared variants model a future hit whose processor already settled.
  const prepared = time - context.currentTime >= preparedBeatLeadSeconds(context.sampleRate)
    ? preparedSamples.get(context)?.variants.get(instrumentId)?.[variantIndex] : undefined;
  source.buffer = prepared ?? buffer;
  source.playbackRate.value = prepared ? 1 : BEAT_SAMPLE_RATES[variantIndex];
  gain.gain.setValueAtTime(Math.max(.0001, volume * profile.outputGain), time);
  const tailSeconds = sampleTailSeconds[instrumentId];
  if (tailSeconds) gain.gain.exponentialRampToValueAtTime(.0001, time + tailSeconds);
  if (prepared) {
    source.connect(gain).connect(destination);
  } else {
    const tone = context.createBiquadFilter();
    const compressor = context.createDynamicsCompressor();
    tone.type = profile.filterType;
    tone.frequency.value = profile.frequency;
    tone.gain.value = profile.filterGain;
    if (profile.q !== undefined) tone.Q.value = profile.q;
    compressor.threshold.value = -12;
    compressor.knee.value = 8;
    compressor.ratio.value = 2;
    compressor.attack.value = .006;
    compressor.release.value = .09;
    source.connect(tone).connect(compressor).connect(gain).connect(destination);
  }
  source.start(time);
  if (tailSeconds) source.stop(time + tailSeconds + .01);
  return true;
}

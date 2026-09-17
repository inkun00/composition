import {
  BEAT_PATTERN_MEASURES,
  beatPatternInstrumentIds,
  beatPatternMeasureBeats,
  type BeatPatternEvent
} from "../music/beatPattern";
import type { BeatInstrumentId } from "../music/beatInstruments";
import type { Meter } from "../music/meter";
import { preloadBeatSamples, scheduleLoadedBeatSample } from "./beatSamples";

export type DrumHit = Readonly<{
  instrumentId: BeatInstrumentId;
  offsetBeats: number;
  velocity: number;
}>;

const instrumentVelocity: Readonly<Record<BeatInstrumentId, number>> = {
  kick: 1,
  "soft-kick": .84,
  snare: .88,
  clap: .82,
  woodblock: .72,
  shaker: .64,
  tambourine: .76,
  hihat: .62,
  "floor-tom": .94,
  "rack-tom": .9,
  djembe: .86,
  conga: .82,
  cowbell: .78,
  triangle: .7,
  timpani: .96,
  cajon: .84,
  bongo: .82,
  claves: .74,
  ride: .7,
  "open-hihat": .68,
  crash: .84,
  guiro: .72
};

export function createBeatPatternHits(
  events: readonly BeatPatternEvent[],
  patternMeasureIndex: number,
  measureBeats: number
): readonly DrumHit[] {
  const normalizedIndex = ((patternMeasureIndex % BEAT_PATTERN_MEASURES) + BEAT_PATTERN_MEASURES) %
    BEAT_PATTERN_MEASURES;
  return events
    .filter((event) => event.measureIndex === normalizedIndex &&
      event.offsetBeats >= 0 && event.offsetBeats < measureBeats)
    .map((event) => ({
      instrumentId: event.instrumentId,
      offsetBeats: event.offsetBeats,
      velocity: instrumentVelocity[event.instrumentId] * (event.offsetBeats === 0 ? 1 : .86)
    }));
}

const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();

function noiseBuffer(context: BaseAudioContext): AudioBuffer {
  const existing = noiseBuffers.get(context);
  if (existing) return existing;
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * .32), context.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 918273;
  for (let index = 0; index < data.length; index += 1) {
    seed = (seed * 16807) % 2147483647;
    data[index] = seed / 1073741823.5 - 1;
  }
  noiseBuffers.set(context, buffer);
  return buffer;
}

function scheduleKick(
  context: BaseAudioContext,
  destination: AudioNode,
  time: number,
  volume: number,
  soft: boolean
) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = soft ? "sine" : "triangle";
  oscillator.frequency.setValueAtTime(soft ? 92 : 126, time);
  oscillator.frequency.exponentialRampToValueAtTime(soft ? 42 : 48, time + (soft ? .17 : .11));
  gain.gain.setValueAtTime(Math.max(.0001, volume), time);
  gain.gain.exponentialRampToValueAtTime(.0001, time + (soft ? .25 : .17));
  oscillator.connect(gain).connect(destination);
  oscillator.start(time);
  oscillator.stop(time + (soft ? .27 : .19));
}

function scheduleNoise(
  context: BaseAudioContext,
  destination: AudioNode,
  time: number,
  volume: number,
  filterType: BiquadFilterType,
  frequency: number,
  duration: number,
  q = .8
) {
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  source.buffer = noiseBuffer(context);
  filter.type = filterType;
  filter.frequency.value = frequency;
  filter.Q.value = q;
  gain.gain.setValueAtTime(Math.max(.0001, volume), time);
  gain.gain.exponentialRampToValueAtTime(.0001, time + duration);
  source.connect(filter).connect(gain).connect(destination);
  source.start(time);
  source.stop(time + duration + .01);
}

function scheduleTonalHit(
  context: BaseAudioContext,
  destination: AudioNode,
  time: number,
  volume: number,
  frequencies: readonly number[],
  duration: number
) {
  frequencies.forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = index === 0 ? "triangle" : "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(Math.max(.0001, volume / (index + 1)), time);
    gain.gain.exponentialRampToValueAtTime(.0001, time + duration);
    oscillator.connect(gain).connect(destination);
    oscillator.start(time);
    oscillator.stop(time + duration + .01);
  });
}

function scheduleClap(
  context: BaseAudioContext,
  destination: AudioNode,
  time: number,
  volume: number
) {
  [0, .018, .038].forEach((delay, index) => {
    scheduleNoise(context, destination, time + delay, volume * (1 - index * .18),
      "bandpass", 1450, .07, .65);
  });
}

function scheduleBeatInstrument(
  context: BaseAudioContext,
  destination: AudioNode,
  time: number,
  volume: number,
  instrumentId: BeatInstrumentId
) {
  if (instrumentId === "kick" || instrumentId === "soft-kick" || instrumentId === "floor-tom") {
    scheduleKick(context, destination, time, volume, instrumentId === "soft-kick");
  } else if (instrumentId === "rack-tom") {
    scheduleTonalHit(context, destination, time, volume, [190, 285], .24);
  } else if (instrumentId === "timpani") {
    scheduleTonalHit(context, destination, time, volume, [82, 123], .52);
  } else if (instrumentId === "djembe") {
    scheduleTonalHit(context, destination, time, volume, [145, 260], .16);
  } else if (instrumentId === "snare") {
    scheduleNoise(context, destination, time, volume, "bandpass", 1850, .14, .9);
  } else if (instrumentId === "clap") {
    scheduleClap(context, destination, time, volume);
  } else if (instrumentId === "woodblock" || instrumentId === "claves") {
    scheduleTonalHit(context, destination, time, volume,
      instrumentId === "woodblock" ? [880, 1320] : [1450, 2180], .06);
  } else if (instrumentId === "cajon") {
    scheduleKick(context, destination, time, volume * .7, true);
    scheduleNoise(context, destination, time, volume * .45, "bandpass", 1250, .1);
  } else if (instrumentId === "bongo") {
    scheduleTonalHit(context, destination, time, volume, [300, 470], .12);
  } else if (instrumentId === "conga") {
    scheduleTonalHit(context, destination, time, volume, [220, 410], .13);
  } else if (instrumentId === "cowbell") {
    scheduleTonalHit(context, destination, time, volume, [560, 845], .18);
  } else if (instrumentId === "triangle") {
    scheduleTonalHit(context, destination, time, volume, [1760, 2640], .38);
  } else if (instrumentId === "ride") {
    scheduleNoise(context, destination, time, volume, "highpass", 5200, .42, .5);
  } else if (instrumentId === "open-hihat") {
    scheduleNoise(context, destination, time, volume, "highpass", 5800, .24, .55);
  } else if (instrumentId === "crash") {
    scheduleNoise(context, destination, time, volume, "highpass", 4200, .62, .5);
  } else if (instrumentId === "guiro") {
    [0, .025, .05].forEach((delay, index) => {
      scheduleNoise(context, destination, time + delay, volume * (1 - index * .18),
        "bandpass", 2800, .045, .7);
    });
  } else if (instrumentId === "shaker") {
    scheduleNoise(context, destination, time, volume, "bandpass", 5200, .075, .55);
  } else if (instrumentId === "tambourine") {
    scheduleNoise(context, destination, time, volume, "highpass", 4600, .13, .7);
  } else {
    scheduleNoise(context, destination, time, volume, "highpass", 6800, .045, .7);
  }
}

const instrumentVolume: Readonly<Record<BeatInstrumentId, number>> = {
  kick: .1,
  "soft-kick": .092,
  snare: .072,
  clap: .068,
  woodblock: .06,
  shaker: .044,
  tambourine: .048,
  hihat: .042,
  "floor-tom": .094,
  "rack-tom": .082,
  djembe: .078,
  conga: .068,
  cowbell: .052,
  triangle: .044,
  timpani: .086,
  cajon: .07,
  bongo: .066,
  claves: .052,
  ride: .044,
  "open-hihat": .048,
  crash: .052,
  guiro: .048
};

export function scheduleBeatPattern(
  context: BaseAudioContext,
  destination: AudioNode,
  start: number,
  secondsPerBeat: number,
  measureBeats: number,
  patternMeasureIndex: number,
  events: readonly BeatPatternEvent[],
  volumePercent: number,
  energy: number
) {
  const volumeScale = Math.max(0, Math.min(2.6, volumePercent / 100));
  if (volumeScale === 0 || events.length === 0) return;
  createBeatPatternHits(events, patternMeasureIndex, measureBeats).forEach((hit, index) => {
    const time = start + hit.offsetBeats * secondsPerBeat;
    const volume = hit.velocity * energy * volumeScale * instrumentVolume[hit.instrumentId];
    const variationSeed = Math.round(hit.offsetBeats * 16) + hit.instrumentId.length + index;
    if (!scheduleLoadedBeatSample(context, destination, time, volume, hit.instrumentId, variationSeed)) {
      scheduleBeatInstrument(context, destination, time, volume, hit.instrumentId);
    }
  });
}

let previewContext: AudioContext | null = null;
let previewTimer: number | null = null;

export async function stopBeatPreview(): Promise<void> {
  if (previewTimer !== null) window.clearTimeout(previewTimer);
  previewTimer = null;
  const context = previewContext;
  previewContext = null;
  if (context && context.state !== "closed") await context.close();
}

export async function previewBeatPattern(
  meter: Meter,
  events: readonly BeatPatternEvent[],
  bpm: number,
  volumePercent: number
): Promise<number> {
  await stopBeatPreview();
  if (events.length === 0) return 0;
  const context = new AudioContext();
  previewContext = context;
  if (context.state === "suspended") await context.resume();
  await preloadBeatSamples(context, beatPatternInstrumentIds(events));
  if (previewContext !== context || context.state === "closed") return 0;
  const master = context.createGain();
  master.gain.value = .82;
  master.connect(context.destination);
  const secondsPerBeat = 60 / bpm;
  const measureBeats = beatPatternMeasureBeats(meter);
  const startsAfter = .05;
  for (let measureIndex = 0; measureIndex < BEAT_PATTERN_MEASURES; measureIndex += 1) {
    scheduleBeatPattern(context, master,
      context.currentTime + startsAfter + measureIndex * measureBeats * secondsPerBeat,
      secondsPerBeat, measureBeats, measureIndex, events, volumePercent, 1);
  }
  const duration = startsAfter + measureBeats * secondsPerBeat * BEAT_PATTERN_MEASURES + .35;
  previewTimer = window.setTimeout(() => {
    if (previewContext === context) previewContext = null;
    previewTimer = null;
    void context.close();
  }, duration * 1000);
  return duration;
}

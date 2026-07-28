import type { AccompanimentStyleId } from "../music/accompaniment";
import {
  findBeatInstrument,
  normalizeBeatInstrumentIds,
  type BeatInstrumentId
} from "../music/beatInstruments";
import type { Meter } from "../music/meter";
import { preloadBeatSamples, scheduleLoadedBeatSample } from "./beatSamples";

export type DrumHit = Readonly<{
  instrumentId: BeatInstrumentId;
  offsetBeats: number;
  velocity: number;
}>;

function fitOffsets(offsets: readonly number[], beats: number): number[] {
  return offsets.filter((offset) => offset >= 0 && offset < beats);
}

function wholeBeatOffsets(beats: number): number[] {
  return Array.from({ length: Math.ceil(beats) }, (_, index) => index)
    .filter((offset) => offset < beats);
}

function lowOffsets(
  styleId: AccompanimentStyleId,
  beats: number,
  compound: boolean,
  instrumentId: BeatInstrumentId
): number[] {
  if (instrumentId === "timpani") {
    return fitOffsets(compound ? [0, 1.25, 2.5] : [0, 1.25, 3.25], beats);
  }
  if (instrumentId === "floor-tom") {
    return fitOffsets(compound ? [0, 1, 2.5] : [0, 1, 2.5, 3], beats);
  }
  if (instrumentId === "djembe") {
    return fitOffsets(compound ? [0, .5, 1.25, 2, 2.5] : [0, .75, 2, 2.75, 3.5], beats);
  }
  if (instrumentId === "soft-kick") {
    if (compound) return fitOffsets([0], beats);
    if (styleId === "bossa") return fitOffsets([0, 2.75], beats);
    if (styleId === "kpop") return fitOffsets([0, 2.5], beats);
    if (styleId === "shuffle") return fitOffsets([0, 2 + 2 / 3], beats);
    return fitOffsets(beats >= 4 ? [0, 3] : [0], beats);
  }
  if (compound) return fitOffsets([0, 1.5], beats);
  if (styleId === "kpop") return fitOffsets([0, 1.5, 2, 3.5], beats);
  if (styleId === "bossa") return fitOffsets([0, 2, 3.5], beats);
  if (styleId === "shuffle" || styleId === "musical") {
    return fitOffsets([0, 1 + 2 / 3, 2, 3 + 2 / 3], beats);
  }
  return fitOffsets(beats >= 3 ? [0, 2] : [0], beats);
}

function middleOffsets(
  styleId: AccompanimentStyleId,
  beats: number,
  meter: Meter | undefined,
  instrumentId: BeatInstrumentId
): number[] {
  const compound = meter?.beats === 6 && meter.beatUnit === 8;
  if (instrumentId === "cajon") {
    return fitOffsets(compound ? [0, .5, 1.5, 2.5] : [0, .5, 2, 3], beats);
  }
  if (instrumentId === "bongo") {
    return fitOffsets(compound ? [.5, 1.25, 2, 2.5] : [.5, 1.25, 2, 2.75, 3.5], beats);
  }
  if (instrumentId === "claves") {
    return fitOffsets(compound ? [.25, 1.25, 2.25] : [.25, 1.75, 3.25], beats);
  }
  if (instrumentId === "conga") {
    return fitOffsets(compound ? [.25, 1, 1.75, 2.5] : [.25, 1.25, 2.25, 3.25], beats);
  }
  if (instrumentId === "cowbell") {
    return fitOffsets(compound ? [.5, 1.5, 2.5] : [0, 1.5, 2.5, 3.5], beats);
  }
  if (instrumentId === "clap") {
    if (compound) return fitOffsets([.75, 2.25], beats);
    if (styleId === "shuffle") {
      return fitOffsets(wholeBeatOffsets(beats).map((beat) => beat + 2 / 3), beats);
    }
    const offsets: number[] = [];
    for (let beat = .5; beat < beats; beat += 1) offsets.push(beat);
    return offsets;
  }
  if (instrumentId === "woodblock") {
    if (compound) return fitOffsets([0, .75, 1.5, 2.25], beats);
    if (styleId === "bossa") return fitOffsets([0, .75, 1.5, 2.75, 3.5], beats);
    return wholeBeatOffsets(beats);
  }
  if (compound) return fitOffsets([1.5], beats);
  if (styleId === "bossa") {
    const offsets: number[] = [];
    for (let start = 0; start < beats; start += 2) offsets.push(start + .75, start + 1.5);
    return fitOffsets(offsets, beats);
  }
  if (styleId === "shuffle") {
    return fitOffsets([1 + 2 / 3, 3 + 2 / 3], beats);
  }
  if (styleId === "musical") return wholeBeatOffsets(beats).slice(1);
  if (meter?.beats === 3) return fitOffsets([1, 2], beats);
  return fitOffsets([1, 3], beats);
}

function highOffsets(
  styleId: AccompanimentStyleId,
  beats: number,
  meter: Meter | undefined,
  instrumentId: BeatInstrumentId
): number[] {
  const offsets: number[] = [];
  const compound = meter?.beats === 6 && meter.beatUnit === 8;
  if (instrumentId === "ride") {
    return fitOffsets(compound ? [0, .75, 1.5, 2.25] : [0, .75, 1.5, 2.25, 3], beats);
  } else if (instrumentId === "guiro") {
    return fitOffsets(compound ? [.5, 1, 2, 2.5] : [.5, 1, 2.5, 3], beats);
  } else if (instrumentId === "triangle") {
    return fitOffsets(compound ? [.25, 1.75] : [.25, 2.25], beats);
  } else if (instrumentId === "shaker") {
    const step = compound ? .5 : styleId === "shuffle" ? 2 / 3 : .5;
    for (let beat = 0; beat < beats; beat += step) offsets.push(beat);
  } else if (instrumentId === "tambourine") {
    if (compound) return fitOffsets([.5, 2], beats);
    if (styleId === "bossa") return fitOffsets([.75, 2.75], beats);
    if (styleId === "shuffle") return fitOffsets([2 / 3, 2 + 2 / 3], beats);
    for (let beat = .5; beat < beats; beat += 2) offsets.push(beat);
  } else if (compound) {
    offsets.push(0, .5, 1.5, 2, 2.5);
  } else if (styleId === "shuffle") {
    wholeBeatOffsets(beats).forEach((beat) => offsets.push(beat, beat + 2 / 3));
  } else if (styleId === "kpop") {
    offsets.push(0, .5, 1, 1.5, 2, 2.75, 3, 3.5);
  } else if (styleId === "bossa") {
    offsets.push(0, .75, 1.5, 2, 2.75, 3.5);
  } else {
    for (let beat = 0; beat < beats; beat += 1) {
      offsets.push(beat);
      if (beat % 2 === 1) offsets.push(beat + .5);
    }
  }
  return fitOffsets(offsets, beats);
}

function hitVelocity(instrumentId: BeatInstrumentId, offset: number, index: number): number {
  const wholeBeat = Math.abs(offset - Math.round(offset)) < .05;
  if (instrumentId === "kick") return index === 0 ? 1 : wholeBeat ? .86 : .72;
  if (instrumentId === "soft-kick") return index === 0 ? .82 : .64;
  if (instrumentId === "timpani") return index === 0 ? .94 : .68;
  if (instrumentId === "floor-tom") return index === 0 ? .94 : index % 2 === 0 ? .72 : .82;
  if (instrumentId === "djembe") return index % 3 === 0 ? .9 : .66;
  if (instrumentId === "snare") return index % 2 === 0 ? .88 : .76;
  if (instrumentId === "clap") return index % 2 === 0 ? .72 : .88;
  if (instrumentId === "woodblock") return index % 2 === 0 ? .76 : .56;
  if (instrumentId === "cajon") return index % 2 === 0 ? .86 : .64;
  if (instrumentId === "bongo") return index % 3 === 0 ? .86 : .62;
  if (instrumentId === "claves") return index === 0 ? .84 : .66;
  if (instrumentId === "conga") return index % 2 === 0 ? .84 : .65;
  if (instrumentId === "cowbell") return index === 0 ? .9 : .7;
  if (instrumentId === "shaker") return wholeBeat ? .7 : .46;
  if (instrumentId === "tambourine") return index === 0 ? .86 : .72;
  if (instrumentId === "triangle") return index === 0 ? .82 : .58;
  if (instrumentId === "ride") return index === 0 ? .82 : .6;
  if (instrumentId === "guiro") return index % 2 === 0 ? .76 : .56;
  return wholeBeat ? .68 : .5;
}

export function createDrumGroove(
  styleId: AccompanimentStyleId,
  beats: number,
  meter: Meter | undefined,
  beatInstrumentIds: readonly BeatInstrumentId[],
  transitionFill = false
): readonly DrumHit[] {
  if (beats <= 0) return [];
  const selected = normalizeBeatInstrumentIds(beatInstrumentIds);
  if (selected.length === 0) return [];
  const compound = meter?.beats === 6 && meter.beatUnit === 8;
  const hits: DrumHit[] = [];

  selected.forEach((instrumentId) => {
    const role = findBeatInstrument(instrumentId).role;
    const offsets = role === "low"
      ? lowOffsets(styleId, beats, compound, instrumentId)
      : role === "middle"
        ? middleOffsets(styleId, beats, meter, instrumentId)
        : highOffsets(styleId, beats, meter, instrumentId);
    offsets.forEach((offset, index) => {
      hits.push({ instrumentId, offsetBeats: offset, velocity: hitVelocity(instrumentId, offset, index) });
    });
  });

  if (transitionFill && beats >= 1) {
    const fillInstrument = selected.find((id) => findBeatInstrument(id).role === "middle") ??
      selected.find((id) => findBeatInstrument(id).role === "high");
    if (fillInstrument) {
      const start = beats - (compound ? 1.5 : 1);
      const sparseFill = fillInstrument === "clap" || fillInstrument === "tambourine" ||
        fillInstrument === "cowbell" || fillInstrument === "triangle" ||
        fillInstrument === "ride" || fillInstrument === "guiro";
      const hitCount = sparseFill ? 2 : 4;
      const step = (compound ? 1.125 : .75) / Math.max(1, hitCount - 1);
      for (let index = 0; index < hitCount; index += 1) {
        hits.push({
          instrumentId: fillInstrument,
          offsetBeats: start + index * step,
          velocity: .46 + index * (.42 / hitCount)
        });
      }
    }
  }

  return hits.filter((hit) => hit.offsetBeats >= 0 && hit.offsetBeats < beats);
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

function scheduleWoodblock(
  context: BaseAudioContext,
  destination: AudioNode,
  time: number,
  volume: number
) {
  [880, 1320].forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(Math.max(.0001, volume * (index === 0 ? 1 : .45)), time);
    gain.gain.exponentialRampToValueAtTime(.0001, time + .055);
    oscillator.connect(gain).connect(destination);
    oscillator.start(time);
    oscillator.stop(time + .065);
  });
}

function scheduleClap(
  context: BaseAudioContext,
  destination: AudioNode,
  time: number,
  volume: number
) {
  [0, .018, .038].forEach((delay, index) => {
    scheduleNoise(context, destination, time + delay, volume * (1 - index * .18), "bandpass", 1450, .07, .65);
  });
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

function scheduleBeatInstrument(
  context: BaseAudioContext,
  destination: AudioNode,
  time: number,
  volume: number,
  instrumentId: BeatInstrumentId
) {
  if (instrumentId === "kick" || instrumentId === "soft-kick" || instrumentId === "floor-tom") {
    scheduleKick(context, destination, time, volume, instrumentId === "soft-kick");
  } else if (instrumentId === "timpani") {
    scheduleTonalHit(context, destination, time, volume, [82, 123], .52);
  } else if (instrumentId === "djembe") {
    scheduleTonalHit(context, destination, time, volume, [145, 260], .16);
  } else if (instrumentId === "snare") {
    scheduleNoise(context, destination, time, volume, "bandpass", 1850, .14, .9);
  } else if (instrumentId === "clap") {
    scheduleClap(context, destination, time, volume);
  } else if (instrumentId === "woodblock") {
    scheduleWoodblock(context, destination, time, volume);
  } else if (instrumentId === "cajon") {
    scheduleKick(context, destination, time, volume * .7, true);
    scheduleNoise(context, destination, time, volume * .45, "bandpass", 1250, .1);
  } else if (instrumentId === "bongo") {
    scheduleTonalHit(context, destination, time, volume, [300, 470], .12);
  } else if (instrumentId === "claves") {
    scheduleTonalHit(context, destination, time, volume, [1450, 2180], .06);
  } else if (instrumentId === "conga") {
    scheduleTonalHit(context, destination, time, volume, [220, 410], .13);
  } else if (instrumentId === "cowbell") {
    scheduleTonalHit(context, destination, time, volume, [560, 845], .18);
  } else if (instrumentId === "triangle") {
    scheduleTonalHit(context, destination, time, volume, [1760, 2640], .38);
  } else if (instrumentId === "ride") {
    scheduleNoise(context, destination, time, volume, "highpass", 5200, .42, .5);
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
  "floor-tom": .094,
  djembe: .078,
  timpani: .086,
  cajon: .07,
  bongo: .066,
  claves: .052,
  ride: .044,
  guiro: .048,
  conga: .068,
  cowbell: .052,
  triangle: .044,
  shaker: .044,
  tambourine: .048,
  hihat: .042
};

export function scheduleDrumGroove(
  context: BaseAudioContext,
  destination: AudioNode,
  start: number,
  secondsPerBeat: number,
  styleId: AccompanimentStyleId,
  beats: number,
  meter: Meter | undefined,
  beatInstrumentIds: readonly BeatInstrumentId[],
  volumePercent: number,
  energy: number,
  transitionFill: boolean
) {
  const layerCount = normalizeBeatInstrumentIds(beatInstrumentIds).length;
  const layerScale = layerCount <= 1 ? 1 : layerCount === 2 ? .92 : .84;
  const volumeScale = Math.max(0, Math.min(1.6, volumePercent / 100));
  if (volumeScale === 0) return;
  createDrumGroove(styleId, beats, meter, beatInstrumentIds, transitionFill).forEach((hit) => {
    const time = start + hit.offsetBeats * secondsPerBeat;
    const volume = hit.velocity * energy * layerScale * volumeScale * instrumentVolume[hit.instrumentId];
    const variationSeed = Math.round(hit.offsetBeats * 16) + hit.instrumentId.length;
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

export async function previewBeatGroove(
  styleId: AccompanimentStyleId,
  meter: Meter,
  beatInstrumentIds: readonly BeatInstrumentId[],
  bpm: number,
  volumePercent: number
): Promise<number> {
  await stopBeatPreview();
  const selected = normalizeBeatInstrumentIds(beatInstrumentIds);
  if (selected.length === 0) return 0;
  const context = new AudioContext();
  previewContext = context;
  if (context.state === "suspended") await context.resume();
  await preloadBeatSamples(context, selected);
  if (previewContext !== context || context.state === "closed") return 0;
  const master = context.createGain();
  master.gain.value = .82;
  master.connect(context.destination);
  const secondsPerBeat = 60 / bpm;
  const beats = meter.beats * (4 / meter.beatUnit);
  const startsAfter = .05;
  scheduleDrumGroove(context, master, context.currentTime + startsAfter, secondsPerBeat,
    styleId, beats, meter, selected, volumePercent, 1, false);
  scheduleDrumGroove(context, master, context.currentTime + startsAfter + beats * secondsPerBeat,
    secondsPerBeat, styleId, beats, meter, selected, volumePercent, 1, true);
  const duration = startsAfter + beats * secondsPerBeat * 2 + .35;
  previewTimer = window.setTimeout(() => {
    if (previewContext === context) previewContext = null;
    previewTimer = null;
    void context.close();
  }, duration * 1000);
  return duration;
}

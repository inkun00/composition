import type { AccompanimentStyleId } from "../music/accompaniment";
import type { Meter } from "../music/meter";

export type DrumHit = Readonly<{
  kind: "kick" | "snare" | "hat";
  offsetBeats: number;
  velocity: number;
}>;

const QUIET_STYLES = new Set<AccompanimentStyleId>(["comping", "arpeggio", "animation_ost", "opera"]);

export function createDrumGroove(
  styleId: AccompanimentStyleId,
  beats: number,
  meter?: Meter,
  transitionFill = false
): readonly DrumHit[] {
  if (QUIET_STYLES.has(styleId) || beats <= 0) return [];
  const compound = meter?.beats === 6 && meter.beatUnit === 8;
  const strongBeats = compound ? [0, 1.5] : Array.from({ length: Math.ceil(beats) }, (_, index) => index);
  const hits: DrumHit[] = [];
  strongBeats.filter((beat) => beat < beats).forEach((beat, index) => {
    hits.push({ kind: index % 2 === 0 ? "kick" : "snare", offsetBeats: beat, velocity: index === 0 ? 1 : .86 });
  });
  const hatStep = styleId === "bossa" || styleId === "shuffle" ? .5 : compound ? .5 : 1;
  for (let beat = 0; beat < beats; beat += hatStep) {
    hits.push({ kind: "hat", offsetBeats: beat, velocity: beat % 1 === 0 ? .55 : .4 });
  }
  if (transitionFill && beats >= 1) {
    const start = beats - (compound ? 1.5 : 1);
    const step = compound ? .375 : .25;
    for (let index = 0; index < 4; index += 1) {
      hits.push({ kind: "snare", offsetBeats: start + index * step, velocity: .45 + index * .12 });
    }
  }
  return hits.filter((hit) => hit.offsetBeats >= 0 && hit.offsetBeats < beats);
}

const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();

function noiseBuffer(context: BaseAudioContext): AudioBuffer {
  const existing = noiseBuffers.get(context);
  if (existing) return existing;
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * .24), context.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 918273;
  for (let index = 0; index < data.length; index += 1) {
    seed = (seed * 16807) % 2147483647;
    data[index] = seed / 1073741823.5 - 1;
  }
  noiseBuffers.set(context, buffer);
  return buffer;
}

function scheduleKick(context: BaseAudioContext, destination: AudioNode, time: number, volume: number) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.setValueAtTime(118, time);
  oscillator.frequency.exponentialRampToValueAtTime(48, time + .11);
  gain.gain.setValueAtTime(Math.max(.0001, volume), time);
  gain.gain.exponentialRampToValueAtTime(.0001, time + .16);
  oscillator.connect(gain).connect(destination);
  oscillator.start(time);
  oscillator.stop(time + .18);
}

function scheduleNoiseHit(
  context: BaseAudioContext,
  destination: AudioNode,
  time: number,
  volume: number,
  kind: "snare" | "hat"
) {
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  source.buffer = noiseBuffer(context);
  filter.type = kind === "hat" ? "highpass" : "bandpass";
  filter.frequency.value = kind === "hat" ? 6200 : 1800;
  filter.Q.value = kind === "hat" ? .7 : .9;
  const duration = kind === "hat" ? .045 : .13;
  gain.gain.setValueAtTime(Math.max(.0001, volume), time);
  gain.gain.exponentialRampToValueAtTime(.0001, time + duration);
  source.connect(filter).connect(gain).connect(destination);
  source.start(time);
  source.stop(time + duration + .01);
}

export function scheduleDrumGroove(
  context: BaseAudioContext,
  destination: AudioNode,
  start: number,
  secondsPerBeat: number,
  styleId: AccompanimentStyleId,
  beats: number,
  meter: Meter | undefined,
  energy: number,
  transitionFill: boolean
) {
  createDrumGroove(styleId, beats, meter, transitionFill).forEach((hit) => {
    const time = start + hit.offsetBeats * secondsPerBeat;
    const volume = hit.velocity * energy * (hit.kind === "kick" ? .055 : hit.kind === "snare" ? .032 : .014);
    if (hit.kind === "kick") scheduleKick(context, destination, time, volume);
    else scheduleNoiseHit(context, destination, time, volume, hit.kind);
  });
}

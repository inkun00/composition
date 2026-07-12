import { findSoundEffect, SOUND_EFFECTS, type SoundEffectId, type SoundEffectCategory } from "../music/soundEffects";

const sampleBufferCache = new Map<string, Promise<AudioBuffer>>();

function noiseBuffer(context: BaseAudioContext, seconds: number): AudioBuffer {
  const buffer = context.createBuffer(1, Math.max(1, Math.floor(context.sampleRate * seconds)), context.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let index = 0; index < channel.length; index += 1) channel[index] = Math.random() * 2 - 1;
  return buffer;
}

function tone(context: BaseAudioContext, destination: AudioNode, start: number,
  frequency: number, duration: number, volume: number, type: OscillatorType = "sine"): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function noise(context: BaseAudioContext, destination: AudioNode, start: number,
  duration: number, volume: number, highpass = 0): void {
  const source = context.createBufferSource();
  const gain = context.createGain();
  source.buffer = noiseBuffer(context, duration);
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  if (highpass > 0) {
    const filter = context.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = highpass;
    source.connect(filter).connect(gain).connect(destination);
  } else {
    source.connect(gain).connect(destination);
  }
  source.start(start);
  source.stop(start + duration + 0.02);
}

function chirp(context: BaseAudioContext, destination: AudioNode, start: number,
  from: number, to: number, duration: number, volume: number, type: OscillatorType = "sine"): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(from, start);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function indexForEffect(effectId: SoundEffectId): number {
  return Math.max(0, SOUND_EFFECTS.findIndex((effect) => effect.id === effectId));
}

function queueSyntheticEffect(context: BaseAudioContext, destination: AudioNode,
  category: SoundEffectCategory, seed: number, start: number): void {
  const high = 700 + (seed % 9) * 120;
  const low = 70 + (seed % 7) * 18;
  const delay = (step: number) => start + step * (0.045 + (seed % 3) * 0.012);
  switch (category) {
    case "nature":
      noise(context, destination, start, 0.18 + (seed % 4) * 0.04, 0.055, 1200);
      chirp(context, destination, start + 0.04, high, high * 1.4, 0.09, 0.025);
      break;
    case "animal":
      [0, 1, 2].forEach((step) => chirp(context, destination, delay(step), high + step * 140, high * 1.7, 0.08, 0.055));
      break;
    case "home":
      tone(context, destination, start, 420 + (seed % 6) * 80, 0.08, 0.08, seed % 2 ? "square" : "triangle");
      noise(context, destination, start + 0.035, 0.08, 0.035, 800);
      break;
    case "school":
      tone(context, destination, start, 880 + (seed % 5) * 90, 0.35, 0.08);
      tone(context, destination, start + 0.08, 1320 + (seed % 4) * 110, 0.23, 0.04);
      break;
    case "city":
      chirp(context, destination, start, 460 + seed * 7, 900 + seed * 5, 0.18, 0.06, "sawtooth");
      noise(context, destination, start + 0.02, 0.16, 0.035, 1000);
      break;
    case "body":
      noise(context, destination, start, 0.08 + (seed % 3) * 0.03, 0.12, 600);
      if (seed % 2 === 0) noise(context, destination, start + 0.08, 0.07, 0.07, 900);
      break;
    case "weather":
      noise(context, destination, start, 0.35 + (seed % 5) * 0.04, 0.07, seed % 2 ? 500 : 1800);
      if (seed % 4 === 0) tone(context, destination, start + 0.02, low, 0.28, 0.08, "sine");
      break;
    case "magic":
      [0, 1, 2, 3].forEach((step) => chirp(context, destination, delay(step), 980 + step * 180, 1600 + step * 220, 0.16, 0.035));
      break;
    case "vehicle":
      tone(context, destination, start, low, 0.26, 0.09, "sawtooth");
      chirp(context, destination, start + 0.07, low * 2.5, low * 3.4, 0.18, 0.045, "square");
      break;
    case "percussion":
      tone(context, destination, start, low * 1.4, 0.12, 0.11, "sine");
      noise(context, destination, start, 0.12, 0.08, 700 + (seed % 6) * 180);
      break;
  }
}

function loadSampleBuffer(context: BaseAudioContext, source: string): Promise<AudioBuffer> {
  const cached = sampleBufferCache.get(source);
  if (cached) return cached;
  const request = fetch(source)
    .then((response) => {
      if (!response.ok) throw new Error(`Cannot load sound effect sample: ${source}`);
      return response.arrayBuffer();
    })
    .then((buffer) => context.decodeAudioData(buffer.slice(0)));
  sampleBufferCache.set(source, request);
  return request;
}

function queueSampleEffect(context: BaseAudioContext, destination: AudioNode,
  source: string, start: number): void {
  void loadSampleBuffer(context, source).then((buffer) => {
    const playableStart = Math.max(start, context.currentTime + 0.01);
    const audio = context.createBufferSource();
    const gain = context.createGain();
    audio.buffer = buffer;
    gain.gain.setValueAtTime(0.0001, playableStart);
    gain.gain.exponentialRampToValueAtTime(0.75, playableStart + 0.01);
    gain.gain.setValueAtTime(0.75, playableStart + Math.min(buffer.duration, 1.8));
    gain.gain.exponentialRampToValueAtTime(0.0001, playableStart + Math.min(buffer.duration, 2.2));
    audio.connect(gain).connect(destination);
    audio.start(playableStart);
    audio.stop(playableStart + Math.min(buffer.duration, 2.3));
  }).catch(() => {
    const effect = SOUND_EFFECTS.find((item) => item.source === source) ?? SOUND_EFFECTS[0];
    queueSyntheticEffect(context, destination, effect.category, indexForEffect(effect.id), Math.max(start, context.currentTime + 0.01));
  });
}

export function queueSoundEffect(context: BaseAudioContext, destination: AudioNode,
  effectId: SoundEffectId, start: number): void {
  const effect = findSoundEffect(effectId);
  if (effect.source) {
    queueSampleEffect(context, destination, effect.source, start);
    return;
  }
  switch (effectId) {
    case "bird":
      [0, 0.13, 0.27].forEach((delay, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(1500 + index * 120, start + delay);
        oscillator.frequency.exponentialRampToValueAtTime(2450 + index * 100, start + delay + 0.07);
        gain.gain.setValueAtTime(0.0001, start + delay);
        gain.gain.exponentialRampToValueAtTime(0.09, start + delay + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + delay + 0.1);
        oscillator.connect(gain).connect(destination);
        oscillator.start(start + delay);
        oscillator.stop(start + delay + 0.11);
      });
      break;
    case "bell":
      tone(context, destination, start, 880, 0.8, 0.11);
      tone(context, destination, start, 1760, 0.55, 0.05);
      tone(context, destination, start, 2640, 0.35, 0.025);
      break;
    case "clap":
      noise(context, destination, start, 0.18, 0.15, 700);
      noise(context, destination, start + 0.045, 0.13, 0.09, 900);
      break;
    case "clock":
      tone(context, destination, start, 1250, 0.09, 0.1, "square");
      break;
    case "footstep":
      tone(context, destination, start, 95, 0.22, 0.15, "sine");
      noise(context, destination, start, 0.16, 0.045);
      break;
    case "rain":
      noise(context, destination, start, 0.55, 0.075, 1800);
      break;
    default: {
      queueSyntheticEffect(context, destination, effect.category, indexForEffect(effectId), start);
      break;
    }
  }
}

export async function previewSoundEffect(effectId: SoundEffectId): Promise<void> {
  const context = new AudioContext();
  const gain = context.createGain();
  gain.gain.value = 0.8;
  gain.connect(context.destination);
  queueSoundEffect(context, gain, effectId, context.currentTime + 0.03);
  window.setTimeout(() => void context.close(), 3000);
}

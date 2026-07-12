import { toNumber } from "../music/rational";
import { chordMidiPitches } from "../music/chord";
import { accompanimentInstrumentPart, accompanimentLayerRole, createAccompanimentPattern, createInstrumentAccompanimentPattern, type AccompanimentStyleId } from "../music/accompaniment";
import { findInstrument, type Instrument, type InstrumentId } from "../music/instruments";
import { loadSampleInstrument, queueSampleNote, resetSampleInstrumentCache } from "./samplePlayer";
import { queueSoundEffect } from "./soundEffects";
import { isSoundEffectId } from "../music/soundEffects";
import type { HarmonyStory, NoteEvent, SoundEffectEvent } from "../music/types";
import { Mp3Encoder } from "@breezystack/lamejs";

export type PlaybackMeasure = Readonly<{
  notes: readonly NoteEvent[];
  harmony: HarmonyStory;
  chords?: readonly string[];
  effects?: readonly SoundEffectEvent[];
  measureIndex?: number;
}>;

export type AccompanimentOptions = Readonly<{
  styleId: AccompanimentStyleId;
  instrumentIds: readonly InstrumentId[];
}>;

export type KaraokeRecordingResult = Readonly<{
  blob: Blob;
  audioBuffer: AudioBuffer;
  vocalAudioBuffer: AudioBuffer;
  backingAudioBuffer: AudioBuffer;
  durationSeconds: number;
  introSeconds: number;
}>;

export type KaraokePostProcessPreset = "natural" | "clear" | "soft" | "loud" | "singer";

export type KaraokeRecordingCallbacks = Readonly<{
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

const chordPitches: Record<HarmonyStory, number[]> = {
  home: [48, 52, 55],
  journey: [53, 57, 60],
  wonder: [55, 59, 62],
  bounce: [50, 57, 62],
  tender: [48, 55, 60],
  brave: [50, 57, 62],
  shadow: [45, 51, 57],
  sparkle: [60, 64, 67],
  swing: [50, 56, 60],
  floating: [57, 60, 64],
  march: [43, 50, 55],
  folk: [48, 55, 62]
};

type ToneEnvelope = Readonly<{ attack: number; release: number }>;
let activePlaybackContext: AudioContext | null = null;
let sharedAudioContext: AudioContext | null = null;
let activeOfflineExport = false;

async function loadSampleWithTimeout(context: BaseAudioContext, destination: AudioNode,
  instrumentId: InstrumentId, timeoutMs = 2500) {
  let timeout: number | undefined;
  try {
    return await Promise.race([
      loadSampleInstrument(context, destination, instrumentId),
      new Promise<never>((_, reject) => {
        timeout = window.setTimeout(() => reject(new Error("악기 샘플 준비 시간 초과")), timeoutMs);
      })
    ]);
  } finally {
    if (timeout !== undefined) window.clearTimeout(timeout);
  }
}

async function claimPlayback(): Promise<AudioContext | null> {
  if (activePlaybackContext) return null;
  sharedAudioContext ??= new AudioContext();
  if (sharedAudioContext.state === "suspended") {
    await sharedAudioContext.resume();
  }
  activePlaybackContext = sharedAudioContext;
  return activePlaybackContext;
}

function releasePlayback(context: AudioContext, afterSeconds: number): void {
  window.setTimeout(() => {
    if (activePlaybackContext === context) activePlaybackContext = null;
  }, afterSeconds * 1000);
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
  const context = sharedAudioContext;
  activePlaybackContext = null;
  sharedAudioContext = null;
  resetSampleInstrumentCache();
  if (context && context.state !== "closed") await context.close();
}

function frequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

function addTone(
  context: BaseAudioContext,
  destination: AudioNode,
  midi: number,
  start: number,
  duration: number,
  volume: number,
  wave: OscillatorType,
  envelope: ToneEnvelope = { attack: 0.02, release: 0.06 }
): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = wave;
  oscillator.frequency.value = frequency(midi);
  gain.gain.setValueAtTime(0.0001, start);
  const attack = Math.min(envelope.attack, duration * 0.35);
  const release = Math.min(envelope.release, duration * 0.45);
  gain.gain.exponentialRampToValueAtTime(volume, start + attack);
  gain.gain.setValueAtTime(volume, Math.max(start + attack + 0.01, start + duration - release));
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function createProtectedMaster(context: BaseAudioContext, destination: AudioNode, volume: number): GainNode {
  const master = context.createGain();
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -20;
  compressor.knee.value = 16;
  compressor.ratio.value = 3;
  compressor.attack.value = .008;
  compressor.release.value = .2;

  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -2;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = .001;
  limiter.release.value = .08;

  master.gain.value = volume;
  master.connect(compressor).connect(limiter).connect(destination);
  return master;
}

function addInstrumentTone(
  context: BaseAudioContext,
  destination: AudioNode,
  midi: number,
  start: number,
  duration: number,
  instrument: Instrument
): void {
  const baseFrequency = frequency(midi);
  const attack = Math.min(instrument.attack, duration * 0.35);
  const release = Math.min(instrument.release, duration * 0.45);
  const sustainTime = Math.max(start + attack + 0.01, start + duration - release);
  const decayRatio = instrument.attack < 0.02 ? 0.07 : 0.7;

  instrument.partials.forEach(([ratio, partialGain]) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = instrument.wave;
    oscillator.frequency.value = baseFrequency * ratio;
    const peak = instrument.volume * partialGain;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + attack);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * decayRatio), sustainTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    if (instrument.vibrato) {
      const lfo = context.createOscillator();
      const lfoGain = context.createGain();
      lfo.frequency.value = instrument.vibrato.rate;
      lfoGain.gain.value = instrument.vibrato.depth * ratio;
      lfo.connect(lfoGain).connect(oscillator.frequency);
      lfo.start(start);
      lfo.stop(start + duration + 0.02);
    }

    oscillator.connect(gain).connect(destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  });
}

function melodyPlaybackEvents(notes: readonly NoteEvent[], secondsPerBeat: number) {
  const events: Array<{ pitch: number; start: number; duration: number }> = [];
  let cursor = 0;
  notes.forEach((note, index) => {
    const duration = toNumber(note.duration) * secondsPerBeat;
    const previous = notes[index - 1];
    if (note.pitch !== null && previous?.linkToNext && previous.pitch === note.pitch && events.length > 0) {
      events[events.length - 1].duration += duration;
    } else if (note.pitch !== null) {
      events.push({ pitch: note.pitch, start: cursor, duration });
    }
    cursor += duration;
  });
  return events;
}

function measureSeconds(measure: PlaybackMeasure, secondsPerBeat: number): number {
  return measure.notes.reduce((total, note) => total + toNumber(note.duration), 0) * secondsPerBeat;
}

function compositionSeconds(measures: readonly PlaybackMeasure[], secondsPerBeat: number): number {
  return measures.reduce((total, measure) => total + measureSeconds(measure, secondsPerBeat), 0);
}

// A small, deterministic performance variation keeps repeated generated
// patterns from sounding like they were stamped on a grid. It is deliberately
// capped below 12 ms, so it never changes the learner's written rhythm.
function performanceNudge(seed: number, secondsPerBeat: number): number {
  const contour = [-.62, .18, -.16, .46, -.32, .08, .3, -.08];
  return contour[Math.abs(seed) % contour.length] * Math.min(.012, secondsPerBeat * .018);
}

function accompanimentArticulation(partId: ReturnType<typeof accompanimentInstrumentPart>["id"],
  voice: "root" | "chord" | "step"): number {
  if (partId === "strings") return .985;
  if (partId === "winds") return .91;
  if (partId === "bass") return .86;
  if (partId === "guitar" || partId === "percussion") return .76;
  if (partId === "keys") return voice === "chord" ? .83 : .9;
  return .88;
}

function beatAccent(offsetBeats: number): number {
  const beat = Math.round(offsetBeats);
  if (Math.abs(offsetBeats - beat) > .08) return .94;
  return beat % 2 === 0 ? 1.08 : .96;
}

type ArrangementVoiceState = {
  centers: Map<string, number>;
};

function createArrangementVoiceState(): ArrangementVoiceState {
  return { centers: new Map() };
}

function partRange(partId: ReturnType<typeof accompanimentInstrumentPart>["id"]): readonly [number, number, number] {
  if (partId === "bass") return [32, 55, 43];
  if (partId === "keys") return [48, 76, 61];
  if (partId === "guitar") return [52, 79, 64];
  if (partId === "strings") return [52, 84, 67];
  if (partId === "winds") return [58, 88, 72];
  if (partId === "percussion") return [45, 78, 60];
  return [48, 80, 63];
}

function pitchInClosestOctave(pitch: number, target: number, min: number, max: number): number {
  const choices = [-24, -12, 0, 12, 24]
    .map((shift) => pitch + shift)
    .filter((candidate) => candidate >= min && candidate <= max);
  if (choices.length === 0) return Math.max(min, Math.min(max, pitch));
  return choices.reduce((closest, candidate) =>
    Math.abs(candidate - target) < Math.abs(closest - target) ? candidate : closest);
}

function voiceLedPitches(
  pitches: readonly number[],
  part: ReturnType<typeof accompanimentInstrumentPart>,
  layerId: InstrumentId,
  state?: ArrangementVoiceState
): readonly number[] {
  if (pitches.length === 0) return pitches;
  const [min, max, restingCenter] = partRange(part.id);
  const key = `${layerId}:${part.id}`;
  const previousCenter = state?.centers.get(key) ?? restingCenter;

  if (pitches.length === 1) {
    const chosen = pitchInClosestOctave(pitches[0], previousCenter, min, max);
    state?.centers.set(key, chosen);
    return [chosen];
  }

  const candidates: number[][] = [];
  for (let inversion = 0; inversion < pitches.length; inversion += 1) {
    const inverted = pitches.map((pitch, index) => pitch + (index < inversion ? 12 : 0));
    for (const shift of [-24, -12, 0, 12, 24]) {
      const candidate = inverted.map((pitch) => pitch + shift);
      if (candidate.every((pitch) => pitch >= min && pitch <= max)) candidates.push(candidate);
    }
  }
  const selected = candidates.reduce((best, candidate) => {
    const bestCenter = best.reduce((sum, pitch) => sum + pitch, 0) / best.length;
    const candidateCenter = candidate.reduce((sum, pitch) => sum + pitch, 0) / candidate.length;
    return Math.abs(candidateCenter - previousCenter) < Math.abs(bestCenter - previousCenter) ? candidate : best;
  }, candidates[0] ?? pitches.map((pitch) => Math.max(min, Math.min(max, pitch))));
  const center = selected.reduce((sum, pitch) => sum + pitch, 0) / selected.length;
  state?.centers.set(key, center);
  return selected;
}

type ArrangementPlan = Readonly<{ layerCount: number; energy: number }>;

function songArrangementPlan(measureIndex: number, measureCount: number, availableLayers: number): ArrangementPlan {
  if (availableLayers <= 2 || measureCount <= 3) return { layerCount: availableLayers, energy: 1 };
  const progress = (measureIndex + 1) / measureCount;
  if (progress <= .25) return { layerCount: Math.min(2, availableLayers), energy: .8 };
  if (progress <= .62) return { layerCount: Math.min(Math.max(3, Math.ceil(availableLayers * .62)), availableLayers), energy: .93 };
  return { layerCount: availableLayers, energy: 1.06 };
}

const CHROMATIC_ROOTS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const NATURAL_ROOTS: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function cadenceChords(target: string): readonly [string, string, string] | null {
  const compact = target.replaceAll(" ", "").split("/")[0];
  if (/^I(?:$|[^V])/.test(compact)) return ["IV", "V7", "I"];
  const match = compact.match(/^([A-G])([#b]?)(.*)$/);
  if (!match) return null;
  const root = (NATURAL_ROOTS[match[1]] + (match[2] === "#" ? 1 : match[2] === "b" ? -1 : 0) + 12) % 12;
  const isMinor = /^m(?!aj)/i.test(match[3]);
  const subdominant = `${CHROMATIC_ROOTS[(root + 5) % 12]}${isMinor ? "m" : ""}`;
  const dominant = `${CHROMATIC_ROOTS[(root + 7) % 12]}7`;
  const tonic = `${CHROMATIC_ROOTS[root]}${isMinor ? "m" : ""}`;
  return [subdominant, dominant, tonic];
}

function accompanimentMeasure(template: PlaybackMeasure, chord: string): PlaybackMeasure {
  return { ...template, chords: [chord], effects: [] };
}

function buildIntroMeasures(measures: readonly PlaybackMeasure[]): PlaybackMeasure[] {
  if (measures.length === 0) return [];
  const target = measures[0].chords?.[0] ?? "";
  const cadence = cadenceChords(target);
  if (!cadence) return Array.from({ length: 4 }, (_, index) => measures[index % measures.length]);
  const [subdominant, dominant, tonic] = cadence;
  // The final dominant points into the first measure of the learner's song.
  return [tonic, subdominant, dominant, dominant].map((chord) => accompanimentMeasure(measures[0], chord));
}

function buildOutroMeasures(measures: readonly PlaybackMeasure[]): PlaybackMeasure[] {
  if (measures.length === 0) return [];
  const template = measures[measures.length - 1];
  const target = template.chords?.at(-1) ?? template.chords?.[0] ?? "";
  const cadence = cadenceChords(target);
  if (!cadence) {
    const source = measures.slice(Math.max(0, measures.length - 4));
    return Array.from({ length: 4 }, (_, index) => source[index % source.length]);
  }
  const [subdominant, dominant, tonic] = cadence;
  // A clear IV–V–I ending, then one more sustained tonic measure.
  return [subdominant, dominant, tonic, tonic].map((chord) => accompanimentMeasure(template, chord));
}

async function loadAccompanimentLayers(context: BaseAudioContext, destination: AudioNode,
  accompaniment?: AccompanimentOptions) {
  return Promise.all((accompaniment?.instrumentIds ?? []).map(async (id) => {
    try {
      return { id, sample: await loadSampleWithTimeout(context, destination, id) };
    } catch (error) {
      console.warn(`${id} 諛섏＜ ?섑뵆??遺덈윭?ㅼ? 紐삵빐 ?⑹꽦 ?뚯깋???ъ슜?⑸땲??`, error);
      return { id, sample: null };
    }
  }));
}

function scheduleMeasure(
  context: BaseAudioContext,
  destination: AudioNode,
  measure: PlaybackMeasure,
  absoluteStart: number,
  secondsPerBeat: number,
  options: Readonly<{
    instrument: Instrument;
    sampledInstrument: Awaited<ReturnType<typeof loadSampleInstrument>> | null;
    accompaniment?: AccompanimentOptions;
    accompanimentLayers: Awaited<ReturnType<typeof loadAccompanimentLayers>>;
    includeMelody: boolean;
    includeEffects: boolean;
    backingVolumeMultiplier?: number;
    melodyVolumeMultiplier?: number;
    arrangementSection?: "intro" | "song" | "outro";
    voiceState?: ArrangementVoiceState;
    arrangementLayerCount?: number;
    arrangementEnergy?: number;
  }>
): number {
  const backingVolumeMultiplier = options.backingVolumeMultiplier ?? 1;
  const melodyVolumeMultiplier = options.melodyVolumeMultiplier ?? 1;
  const arrangementSection = options.arrangementSection ?? "song";
  const arrangementLayerCount = Math.max(0, Math.min(options.accompanimentLayers.length,
    options.arrangementLayerCount ?? options.accompanimentLayers.length));
  const arrangementEnergy = options.arrangementEnergy ?? 1;
  const measureBeats = measure.notes.reduce((total, note) => total + toNumber(note.duration), 0);
  const chordSymbols = measure.chords && measure.chords.length > 0 ? measure.chords : [""];
  const chordBeats = measureBeats / chordSymbols.length;

  chordSymbols.forEach((chord, chordIndex) => {
    const pitches = chord ? chordMidiPitches(chord) : chordPitches[measure.harmony];
    if (options.accompanimentLayers.length === 0 || !options.accompaniment) {
      pitches.forEach((pitch) => {
        addTone(context, destination, pitch, absoluteStart + chordIndex * chordBeats * secondsPerBeat,
          chordBeats * secondsPerBeat, 0.028 * backingVolumeMultiplier, "sine");
      });
      return;
    }
    options.accompanimentLayers.slice(0, arrangementLayerCount).forEach((layer, layerIndex) => {
      const part = accompanimentInstrumentPart(layer.id, layerIndex);
      const pattern = createInstrumentAccompanimentPattern(options.accompaniment?.styleId ?? "arpeggio", chordBeats, layer.id, layerIndex);
      pattern.forEach((event) => {
        const role = accompanimentLayerRole(layerIndex);
        let eventPitches: readonly number[];
        if (options.accompanimentLayers.length === 1) {
          eventPitches = event.voice === "root" ? [pitches[0] - 12]
            : event.voice === "step" ? [pitches[(event.step ?? 0) % pitches.length]] : pitches.slice(0, 3);
        } else if (part.id === "bass") {
          eventPitches = [pitches[0] - (arrangementSection === "song" ? 24 : 18)];
        } else if (part.id === "keys") {
          eventPitches = event.voice === "root" ? [pitches[0] - 12] : pitches.slice(0, 3);
        } else if (part.id === "guitar") {
          eventPitches = event.voice === "root" ? [pitches[0] - 12]
            : [pitches[(event.step ?? layerIndex) % pitches.length]];
        } else if (part.id === "strings") {
          eventPitches = pitches.slice(0, 3);
        } else if (part.id === "winds") {
          eventPitches = [pitches[(event.step ?? layerIndex) % pitches.length] + (arrangementSection === "song" ? 12 : 7)];
        } else if (part.id === "percussion") {
          eventPitches = [pitches[(layerIndex + 1) % pitches.length] - 5];
        } else if (role.id === "high") {
          eventPitches = [pitches[(event.step ?? layerIndex) % pitches.length] + (arrangementSection === "song" ? 12 : 7)];
        } else if (role.id === "pulse") {
          eventPitches = [pitches[(layerIndex + 1) % pitches.length] - 5];
        } else if (role.id === "middle") {
          eventPitches = [pitches[(event.step ?? 1) % pitches.length]];
        } else {
          eventPitches = [pitches[pitches.length - 1] + (arrangementSection === "song" ? 19 : 7)];
        }
        eventPitches = voiceLedPitches(eventPitches, part, layer.id, options.voiceState);
        const roleDelay = part.id === "bass" || part.id === "strings" ? 0 : arrangementSection === "song"
          ? Math.min(event.durationBeats * secondsPerBeat * .16, secondsPerBeat * .09) * (layerIndex % 3)
          : Math.min(event.durationBeats * secondsPerBeat * .07, secondsPerBeat * .035) * (layerIndex % 2);
        const roleVolume = part.id === "bass" ? 1.15 : part.id === "keys" ? .82
          : part.id === "guitar" ? .78 : part.id === "strings" ? .66
          : part.id === "winds" ? .9 : part.id === "percussion" ? .74
          : role.id === "bass" ? 1.15 : role.id === "chords" ? .82
          : role.id === "high" || role.id === "sparkle" ? .9 : .72;
        // The song section can build up gradually, but the intro and outro
        // have no melody on top. Keep those backing-only sections clearly
        // audible instead of making them sound like a distant fade-in/out.
        const sectionVolume = arrangementSection === "intro" ? .97 : arrangementSection === "outro" ? .95 : 1;
        eventPitches.forEach((pitch) => {
          const baseStart = absoluteStart + (chordIndex * chordBeats + event.offsetBeats) * secondsPerBeat;
          const noteDuration = event.durationBeats * secondsPerBeat;
          const expressionSeed = chordIndex * 17 + layerIndex * 7 + Math.round(event.offsetBeats * 8);
          const noteStart = Math.max(absoluteStart,
            baseStart + Math.min(roleDelay, noteDuration * .24) + performanceNudge(expressionSeed, secondsPerBeat));
          const performedDuration = Math.max(.035, noteDuration * accompanimentArticulation(part.id, event.voice));
          const layerInstrument = findInstrument(layer.id);
          const performedVolume = layerInstrument.volume * .62 * roleVolume * sectionVolume *
            backingVolumeMultiplier * arrangementEnergy * beatAccent(event.offsetBeats);
          const shiftedPitch = Math.max(36, Math.min(96, pitch));
          if (layer.sample) {
            queueSampleNote(layer.sample, context, destination, shiftedPitch, noteStart, performedDuration, performedVolume);
          } else {
            addInstrumentTone(context, destination, shiftedPitch, noteStart, performedDuration,
              { ...layerInstrument, volume: performedVolume });
          }
        });
      });
    });
  });

  if (options.includeMelody) {
    melodyPlaybackEvents(measure.notes, secondsPerBeat).forEach((event, index) => {
      const noteStart = absoluteStart + event.start + performanceNudge(index + 3, secondsPerBeat);
      // Keep sung, connected melodies nearly legato; a tiny gap remains only
      // between separately written notes so the rhythm stays easy to hear.
      const noteDuration = Math.max(.04, event.duration * .97);
      const melodyVolume = options.instrument.volume * melodyVolumeMultiplier * (index % 4 === 0 ? 1.06 : .98);
      if (options.sampledInstrument) {
        queueSampleNote(options.sampledInstrument, context, destination, event.pitch,
          noteStart, noteDuration, melodyVolume);
      } else {
        addInstrumentTone(context, destination, event.pitch, noteStart, noteDuration,
          { ...options.instrument, volume: melodyVolume });
      }
    });
  }

  if (options.includeEffects) {
    (measure.effects ?? []).forEach((effect) => {
      if (isSoundEffectId(effect.effectId)) {
        queueSoundEffect(context, destination, effect.effectId,
          absoluteStart + effect.offsetBeats * secondsPerBeat);
      }
    });
  }

  return measureBeats * secondsPerBeat;
}

function floatTo16BitPcm(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length);
  for (let index = 0; index < input.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, input[index]));
    output[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return output;
}

function encodeAudioBufferToMp3(buffer: AudioBuffer): Blob {
  const channels = Math.min(2, buffer.numberOfChannels);
  const encoder = new Mp3Encoder(channels, buffer.sampleRate, 160);
  const chunks: BlobPart[] = [];
  const blockSize = 1152;
  const left = buffer.getChannelData(0);
  const right = channels > 1 ? buffer.getChannelData(1) : null;

  for (let offset = 0; offset < left.length; offset += blockSize) {
    const leftChunk = floatTo16BitPcm(left.subarray(offset, offset + blockSize));
    const encoded = right
      ? encoder.encodeBuffer(leftChunk, floatTo16BitPcm(right.subarray(offset, offset + blockSize)))
      : encoder.encodeBuffer(leftChunk);
    if (encoded.length > 0) chunks.push(new Uint8Array(encoded));
  }
  const finalChunk = encoder.flush();
  if (finalChunk.length > 0) chunks.push(new Uint8Array(finalChunk));
  return new Blob(chunks, { type: "audio/mpeg" });
}

function renderedAudioPeak(buffer: AudioBuffer): number {
  let peak = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const samples = buffer.getChannelData(channel);
    for (let index = 0; index < samples.length; index += 1) {
      peak = Math.max(peak, Math.abs(samples[index]));
    }
  }
  return peak;
}

function createRoomImpulse(context: BaseAudioContext, seconds = 0.65, decay = 2.4): AudioBuffer {
  const sampleRate = context.sampleRate;
  const length = Math.max(1, Math.floor(sampleRate * seconds));
  const impulse = context.createBuffer(2, length, sampleRate);
  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const data = impulse.getChannelData(channel);
    for (let index = 0; index < length; index += 1) {
      const fade = (1 - index / length) ** decay;
      data[index] = (Math.random() * 2 - 1) * fade * 0.22;
    }
  }
  return impulse;
}

function createGentleNoiseGate(context: AudioContext): Readonly<{
  input: GainNode;
  output: GainNode;
  stop: () => void;
}> {
  const input = context.createGain();
  const output = context.createGain();
  output.gain.value = 0.9;
  input.connect(output);
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.82;
  input.connect(analyser);
  const data = new Float32Array(analyser.fftSize);
  let frame = 0;
  let closed = false;

  const tick = () => {
    if (closed || context.state === "closed") return;
    analyser.getFloatTimeDomainData(data);
    let sum = 0;
    for (let index = 0; index < data.length; index += 1) sum += data[index] * data[index];
    const rms = Math.sqrt(sum / data.length);
    const now = context.currentTime;
    // Keep quiet syllables and breathy endings intact. This is only a light
    // room-noise reduction, not a hard gate.
    const target = rms < 0.006 ? 0.65 : rms < 0.012 ? 0.86 : 1;
    output.gain.cancelScheduledValues(now);
    output.gain.setTargetAtTime(target, now, target < output.gain.value ? 0.18 : 0.055);
    frame = window.setTimeout(tick, 45);
  };
  tick();

  return {
    input,
    output,
    stop: () => {
      closed = true;
      window.clearTimeout(frame);
    }
  };
}

function createVocalMonitor(
  context: AudioContext,
  source: AudioNode,
  backingMaster: GainNode,
  onInputLevel?: (level: number) => void
): () => void {
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = .78;
  source.connect(analyser);
  const data = new Float32Array(analyser.fftSize);
  let timer = 0;
  let stopped = false;

  const tick = () => {
    if (stopped || context.state === "closed") return;
    analyser.getFloatTimeDomainData(data);
    let sum = 0;
    for (const sample of data) sum += sample * sample;
    const rms = Math.sqrt(sum / data.length);
    // The meter is deliberately gentle: it helps the learner find a usable
    // distance from the mic without asking them to sing loudly.
    onInputLevel?.(Math.min(1, rms / .11));
    const targetBacking = rms > .025 ? .78 : .86;
    backingMaster.gain.setTargetAtTime(targetBacking, context.currentTime, rms > .025 ? .09 : .22);
    timer = window.setTimeout(tick, 70);
  };
  tick();
  return () => {
    stopped = true;
    window.clearTimeout(timer);
    onInputLevel?.(0);
  };
}

export async function renderProcessedKaraokeMp3(
  buffer: AudioBuffer,
  preset: KaraokePostProcessPreset
): Promise<Blob> {
  const context = new OfflineAudioContext(
    Math.min(2, buffer.numberOfChannels),
    buffer.length,
    buffer.sampleRate
  );
  const source = context.createBufferSource();
  source.buffer = buffer;
  const inputGain = context.createGain();
  const tone = context.createBiquadFilter();
  const compressor = context.createDynamicsCompressor();
  const outputGain = context.createGain();

  tone.type = "peaking";
  tone.frequency.value = 2600;
  tone.Q.value = 0.9;
  tone.gain.value = 0;
  inputGain.gain.value = 1;
  outputGain.gain.value = 1;
  compressor.threshold.value = -12;
  compressor.knee.value = 12;
  compressor.ratio.value = 2.2;
  compressor.attack.value = 0.006;
  compressor.release.value = 0.18;

  if (preset === "clear") {
    tone.gain.value = 2.2;
    outputGain.gain.value = 1.03;
  } else if (preset === "soft") {
    tone.frequency.value = 4200;
    tone.gain.value = -1.8;
    outputGain.gain.value = 0.96;
  } else if (preset === "loud") {
    compressor.threshold.value = -20;
    compressor.ratio.value = 4.2;
    outputGain.gain.value = 1.18;
  } else if (preset === "singer") {
    tone.frequency.value = 3000;
    tone.gain.value = 1.2;
    compressor.threshold.value = -16;
    compressor.ratio.value = 2.8;
    outputGain.gain.value = 0.96;
  }

  source.connect(inputGain).connect(tone).connect(compressor).connect(outputGain).connect(context.destination);
  if (preset === "singer") {
    const spaceSend = context.createGain();
    spaceSend.gain.value = 0.18;
    const reverb = context.createConvolver();
    reverb.buffer = createRoomImpulse(context, 1.15, 2.1);
    const reverbReturn = context.createGain();
    reverbReturn.gain.value = 0.5;
    const delay = context.createDelay(0.35);
    delay.delayTime.value = 0.11;
    const delayGain = context.createGain();
    delayGain.gain.value = 0.08;
    const feedback = context.createGain();
    feedback.gain.value = 0.18;
    outputGain.connect(spaceSend).connect(reverb).connect(reverbReturn).connect(context.destination);
    outputGain.connect(delay).connect(delayGain).connect(context.destination);
    delayGain.connect(feedback).connect(delay);
  }
  source.start();
  const rendered = await context.startRendering();
  return encodeAudioBufferToMp3(rendered);
}

export async function renderKaraokePreviewMix(
  vocalBuffer: AudioBuffer,
  backingBuffer: AudioBuffer,
  backingVolume: number
): Promise<Readonly<{ blob: Blob; audioBuffer: AudioBuffer }>> {
  const channels = Math.min(2, Math.max(vocalBuffer.numberOfChannels, backingBuffer.numberOfChannels));
  const sampleRate = Math.max(vocalBuffer.sampleRate, backingBuffer.sampleRate);
  const length = Math.max(vocalBuffer.length, backingBuffer.length);
  const context = new OfflineAudioContext(channels, length, sampleRate);
  const vocal = context.createBufferSource();
  const backing = context.createBufferSource();
  vocal.buffer = vocalBuffer;
  backing.buffer = backingBuffer;
  const vocalGain = context.createGain();
  const backingGain = context.createGain();
  const compressor = context.createDynamicsCompressor();
  vocalGain.gain.value = 1;
  backingGain.gain.value = Math.max(.25, Math.min(1.6, backingVolume));
  compressor.threshold.value = -14;
  compressor.knee.value = 12;
  compressor.ratio.value = 2.4;
  compressor.attack.value = .004;
  compressor.release.value = .18;
  vocal.connect(vocalGain).connect(compressor);
  backing.connect(backingGain).connect(compressor);
  compressor.connect(context.destination);
  vocal.start();
  backing.start();
  const audioBuffer = await context.startRendering();
  return { audioBuffer, blob: encodeAudioBufferToMp3(audioBuffer) };
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
  const master = createProtectedMaster(context, context.destination, 0.72);
  const secondsPerBeat = 60 / bpm;
  const instrument = findInstrument(instrumentId);
  let sampledInstrument: Awaited<ReturnType<typeof loadSampleInstrument>> | null = null;
  try {
    sampledInstrument = await loadSampleWithTimeout(context, master, instrumentId);
  } catch (error) {
    console.warn("악기 샘플을 불러오지 못해 합성 음색을 사용합니다.", error);
  }
  const start = context.currentTime + 0.06;

  const totalBeats = notes.reduce((total, note) => total + toNumber(note.duration), 0);
  if (playAccompaniment) {
    const accompaniment = chords.length > 0 ? chords : [""];
    const chordBeats = totalBeats / accompaniment.length;
    accompaniment.forEach((chord, chordIndex) => {
      const pitches = chord ? chordMidiPitches(chord) : chordPitches[harmony];
      pitches.forEach((pitch) => {
        addTone(context, master, pitch, start + chordIndex * chordBeats * secondsPerBeat,
          chordBeats * secondsPerBeat, 0.035, "sine");
      });
    });
  }

  melodyPlaybackEvents(notes, secondsPerBeat).forEach((event) => {
    if (sampledInstrument) {
      queueSampleNote(sampledInstrument, context, master, event.pitch,
        start + event.start, event.duration * .92, instrument.volume);
    } else {
      addInstrumentTone(context, master, event.pitch, start + event.start, event.duration * 0.92, instrument);
    }
  });
  const cursor = totalBeats * secondsPerBeat;

  effects.forEach((effect) => {
    if (isSoundEffectId(effect.effectId)) {
      queueSoundEffect(context, master, effect.effectId, start + effect.offsetBeats * secondsPerBeat);
    }
  });

  releasePlayback(context, cursor + 0.5);
  return cursor + 0.5;
}

export async function playComposition(
  measures: readonly PlaybackMeasure[],
  instrumentId: InstrumentId = "piano",
  bpm = 96,
  accompaniment?: AccompanimentOptions
): Promise<number | null> {
  const context = await claimPlayback();
  if (!context) return null;
  const master = createProtectedMaster(context, context.destination, 0.72);
  const secondsPerBeat = 60 / bpm;
  const instrument = findInstrument(instrumentId);
  let sampledInstrument: Awaited<ReturnType<typeof loadSampleInstrument>> | null = null;
  try {
    sampledInstrument = await loadSampleWithTimeout(context, master, instrumentId);
  } catch (error) {
    console.warn("악기 샘플을 불러오지 못해 합성 음색을 사용합니다.", error);
  }
  const accompanimentLayers = await Promise.all((accompaniment?.instrumentIds ?? []).map(async (id) => {
    try {
      return { id, sample: await loadSampleWithTimeout(context, master, id) };
    } catch (error) {
      console.warn(`${id} 반주 샘플을 불러오지 못해 합성 음색을 사용합니다.`, error);
      return { id, sample: null };
    }
  }));
  const voiceState = createArrangementVoiceState();
  const start = context.currentTime + 0.08;
  let songCursor = 0;

  measures.forEach((measure, measureIndex) => {
    // Keep the live player on the same arrangement path as recording and MP3
    // export. Previously this had an older generic accompaniment loop, which
    // made every selected instrument play almost the same part.
    const plan = songArrangementPlan(measureIndex, measures.length, accompanimentLayers.length);
    songCursor += scheduleMeasure(context, master, measure, start + songCursor, secondsPerBeat, {
      instrument,
      sampledInstrument,
      accompaniment,
      accompanimentLayers,
      includeMelody: true,
      includeEffects: true,
      arrangementSection: "song",
      voiceState,
      arrangementLayerCount: plan.layerCount,
      arrangementEnergy: plan.energy
    });
  });

  releasePlayback(context, songCursor + 0.5);
  return songCursor + 0.5;
}

export async function recordKaraokeComposition(
  measures: readonly PlaybackMeasure[],
  instrumentId: InstrumentId = "piano",
  bpm = 96,
  accompaniment?: AccompanimentOptions,
  callbacks: KaraokeRecordingCallbacks = {},
  countIn: Readonly<{ beats: number; unitBeats: number }> = { beats: 4, unitBeats: 1 }
): Promise<KaraokeRecordingResult | null> {
  if (activePlaybackContext) return null;
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("이 브라우저에서는 마이크 녹음을 사용할 수 없어요.");
  }
  if (typeof MediaRecorder === "undefined") {
    throw new Error("이 브라우저에서는 녹음 저장을 사용할 수 없어요.");
  }

  const AudioContextClass = window.AudioContext ||
    (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) {
    throw new Error("이 브라우저에서는 오디오 녹음을 사용할 수 없어요.");
  }
  const context = new AudioContextClass();
  activePlaybackContext = context;
  let microphoneStream: MediaStream | null = null;
  let stopNoiseGate: (() => void) | null = null;
  let stopVocalMonitor: (() => void) | null = null;

  try {
    callbacks.onStatus?.("마이크 권한을 허용해 주세요.");
    microphoneStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        // Browser auto gain can pump between sung syllables. A light,
        // predictable compressor below is safer for a child's natural voice.
        autoGainControl: false
      }
    });
    if (context.state === "suspended") await context.resume();

    callbacks.onStatus?.("4마디 반주 뒤에 노래가 녹음돼요.");
    const secondsPerBeat = 60 / bpm;
    const introMeasures = buildIntroMeasures(measures);
    const outroMeasures = buildOutroMeasures(measures);
    const introSeconds = compositionSeconds(introMeasures, secondsPerBeat);
    const songSeconds = compositionSeconds(measures, secondsPerBeat);
    const outroSeconds = compositionSeconds(outroMeasures, secondsPerBeat);
    const tailSeconds = 0.8;

    const master = context.createGain();
    master.gain.value = 0.86;
    const vocalBus = context.createGain();
    vocalBus.gain.value = 1.08;
    const mixBus = context.createGain();
    mixBus.gain.value = 0.96;
    const mixCompressor = context.createDynamicsCompressor();
    mixCompressor.threshold.value = -18;
    mixCompressor.knee.value = 12;
    mixCompressor.ratio.value = 3;
    mixCompressor.attack.value = 0.004;
    mixCompressor.release.value = 0.24;
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -2.5;
    limiter.knee.value = 0;
    limiter.ratio.value = 18;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.08;

    master.connect(mixBus);
    master.connect(context.destination);
    vocalBus.connect(mixBus);
    mixBus.connect(mixCompressor).connect(limiter);
    const recordingDestination = context.createMediaStreamDestination();
    const vocalRecordingDestination = context.createMediaStreamDestination();
    const backingRecordingDestination = context.createMediaStreamDestination();
    limiter.connect(recordingDestination);
    vocalBus.connect(vocalRecordingDestination);
    master.connect(backingRecordingDestination);

    const microphone = context.createMediaStreamSource(microphoneStream);
    const vocalHighPass = context.createBiquadFilter();
    vocalHighPass.type = "highpass";
    vocalHighPass.frequency.value = 90;
    vocalHighPass.Q.value = 0.7;
    const vocalLowPass = context.createBiquadFilter();
    vocalLowPass.type = "lowpass";
    vocalLowPass.frequency.value = 12000;
    vocalLowPass.Q.value = 0.5;
    const vocalMudCut = context.createBiquadFilter();
    vocalMudCut.type = "peaking";
    vocalMudCut.frequency.value = 260;
    vocalMudCut.Q.value = 1.1;
    vocalMudCut.gain.value = -1.4;
    const vocalPresence = context.createBiquadFilter();
    vocalPresence.type = "peaking";
    vocalPresence.frequency.value = 3200;
    vocalPresence.Q.value = 0.9;
    vocalPresence.gain.value = 1.2;
    const vocalDeEsser = context.createBiquadFilter();
    vocalDeEsser.type = "peaking";
    vocalDeEsser.frequency.value = 6500;
    vocalDeEsser.Q.value = 1.4;
    vocalDeEsser.gain.value = -1.2;
    const noiseGate = createGentleNoiseGate(context);
    stopNoiseGate = noiseGate.stop;
    const vocalCompressor = context.createDynamicsCompressor();
    vocalCompressor.threshold.value = -20;
    vocalCompressor.knee.value = 24;
    vocalCompressor.ratio.value = 2.2;
    vocalCompressor.attack.value = 0.012;
    vocalCompressor.release.value = 0.24;
    const vocalDry = context.createGain();
    vocalDry.gain.value = 0.96;
    const reverbSend = context.createGain();
    reverbSend.gain.value = 0.09;
    const reverb = context.createConvolver();
    reverb.buffer = createRoomImpulse(context);
    const reverbReturn = context.createGain();
    reverbReturn.gain.value = 0.32;
    microphone.connect(vocalHighPass).connect(vocalLowPass).connect(vocalMudCut)
      .connect(vocalPresence).connect(vocalDeEsser).connect(noiseGate.input);
    noiseGate.output.connect(vocalCompressor);
    stopVocalMonitor = createVocalMonitor(context, noiseGate.output, master, callbacks.onInputLevel);
    vocalCompressor.connect(vocalDry).connect(vocalBus);
    vocalCompressor.connect(reverbSend).connect(reverb).connect(reverbReturn).connect(vocalBus);

    const instrument = findInstrument(instrumentId);
    let sampledInstrument: Awaited<ReturnType<typeof loadSampleInstrument>> | null = null;
    try {
      sampledInstrument = await loadSampleWithTimeout(context, master, instrumentId);
    } catch (error) {
      console.warn("?낃린 ?섑뵆??遺덈윭?ㅼ? 紐삵빐 ?⑹꽦 ?뚯깋???ъ슜?⑸땲??", error);
    }
    const accompanimentLayers = await loadAccompanimentLayers(context, master, accompaniment);
    const voiceState = createArrangementVoiceState();

    const recorderOptions = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? { mimeType: "audio/webm;codecs=opus" }
      : undefined;
    const createRecorder = (destination: MediaStreamAudioDestinationNode) => {
      const recorder = new MediaRecorder(destination.stream, recorderOptions);
      const chunks: BlobPart[] = [];
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      });
      const stopped = new Promise<Blob>((resolve) => {
        recorder.addEventListener("stop", () => {
          resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
        }, { once: true });
      });
      return { recorder, stopped };
    };
    const mixRecorder = createRecorder(recordingDestination);
    const vocalRecorder = createRecorder(vocalRecordingDestination);
    const backingRecorder = createRecorder(backingRecordingDestination);

    const start = context.currentTime + 0.6;
    let cursor = 0;
    mixRecorder.recorder.start(250);
    vocalRecorder.recorder.start(250);
    backingRecorder.recorder.start(250);
    const callbackTimers: number[] = [];
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
        createAccompanimentPattern(accompaniment?.styleId ?? "arpeggio", chordBeats).forEach((event) => {
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
        backingVolumeMultiplier: 1.28,
        arrangementSection: "intro",
        arrangementLayerCount: Math.min(3, accompanimentLayers.length),
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
      const plan = songArrangementPlan(measureIndex, measures.length, accompanimentLayers.length);
      cursor += scheduleMeasure(context, master, measure, start + cursor, secondsPerBeat, {
        instrument,
        sampledInstrument,
        accompaniment,
        accompanimentLayers,
        voiceState,
        includeMelody: true,
        includeEffects: true,
        // The guide melody stays audible for timing, but leaves room for the
        // learner's live voice in the recording.
        melodyVolumeMultiplier: .5,
        arrangementLayerCount: plan.layerCount,
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
        createAccompanimentPattern(accompaniment?.styleId ?? "arpeggio", chordBeats).forEach((event) => {
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
        backingVolumeMultiplier: 1.22,
        arrangementSection: "outro",
        arrangementLayerCount: Math.min(3, accompanimentLayers.length),
        arrangementEnergy: .96
      });
    });

    window.setTimeout(() => {
      [mixRecorder.recorder, vocalRecorder.recorder, backingRecorder.recorder].forEach((recorder) => {
        if (recorder.state !== "inactive") recorder.stop();
      });
    }, Math.max(0, (start - context.currentTime + cursor + tailSeconds) * 1000));

    const [recordedBlob, vocalBlob, backingBlob] = await Promise.all([
      mixRecorder.stopped, vocalRecorder.stopped, backingRecorder.stopped
    ]);
    callbackTimers.forEach((timer) => window.clearTimeout(timer));
    callbacks.onHighlight?.({ section: "outro", measureIndex: null, noteId: null });
    callbacks.onPhase?.("encoding");
    callbacks.onStatus?.("MP3 파일로 바꾸는 중이에요.");
    const recordedBuffer = await recordedBlob.arrayBuffer();
    const decoded = await context.decodeAudioData(recordedBuffer);
    const vocalAudioBuffer = await context.decodeAudioData(await vocalBlob.arrayBuffer());
    const backingAudioBuffer = await context.decodeAudioData(await backingBlob.arrayBuffer());
    const mp3Blob = encodeAudioBufferToMp3(decoded);
    callbacks.onStatus?.("MP3 저장 준비가 끝났어요.");
    callbacks.onPhase?.("done");
    return {
      blob: mp3Blob,
      audioBuffer: decoded,
      vocalAudioBuffer,
      backingAudioBuffer,
      durationSeconds: introSeconds + songSeconds + outroSeconds + tailSeconds,
      introSeconds
    };
  } finally {
    stopNoiseGate?.();
    stopVocalMonitor?.();
    microphoneStream?.getTracks().forEach((track) => track.stop());
    if (activePlaybackContext === context) activePlaybackContext = null;
    if (context.state !== "closed") await context.close();
  }
}

export async function exportBackingCompositionMp3(
  measures: readonly PlaybackMeasure[],
  instrumentId: InstrumentId = "piano",
  bpm = 96,
  accompaniment?: AccompanimentOptions
): Promise<Blob | null> {
  if (activePlaybackContext || activeOfflineExport) return null;
  activeOfflineExport = true;
  if (typeof MediaRecorder === "undefined") {
    throw new Error("이 브라우저에서는 MP3 저장을 사용할 수 없어요.");
  }

  const AudioContextClass = window.AudioContext ||
    (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) {
    throw new Error("이 브라우저에서는 오디오 저장을 사용할 수 없어요.");
  }

  const context = new AudioContextClass();
  activePlaybackContext = context;
  try {
    if (context.state === "suspended") await context.resume();
    const secondsPerBeat = 60 / bpm;
    const introMeasures = buildIntroMeasures(measures);
    const outroMeasures = buildOutroMeasures(measures);
    const tailSeconds = 0.8;

    const recordingDestination = context.createMediaStreamDestination();
    const master = createProtectedMaster(context, recordingDestination, 0.76);

    const instrument = findInstrument(instrumentId);
    let sampledInstrument: Awaited<ReturnType<typeof loadSampleInstrument>> | null = null;
    try {
      sampledInstrument = await loadSampleWithTimeout(context, master, instrumentId);
    } catch (error) {
      console.warn("?낃린 ?섑뵆??遺덈윭?ㅼ? 紐삵빐 ?⑹꽦 ?뚯깋???ъ슜?⑸땲??", error);
    }
    const accompanimentLayers = await loadAccompanimentLayers(context, master, accompaniment);
    const voiceState = createArrangementVoiceState();

    const recorderOptions = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? { mimeType: "audio/webm;codecs=opus" }
      : undefined;
    const recorder = new MediaRecorder(recordingDestination.stream, recorderOptions);
    const chunks: BlobPart[] = [];
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    });
    const stopped = new Promise<Blob>((resolve) => {
      recorder.addEventListener("stop", () => {
        resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
      }, { once: true });
    });

    const start = context.currentTime + 0.25;
    let cursor = 0;
    recorder.start(250);
    introMeasures.forEach((measure) => {
      cursor += scheduleMeasure(context, master, measure, start + cursor, secondsPerBeat, {
        instrument,
        sampledInstrument: null,
        accompaniment,
        accompanimentLayers,
        voiceState,
        includeMelody: false,
        includeEffects: false,
        backingVolumeMultiplier: 1.28,
        arrangementSection: "intro",
        arrangementLayerCount: Math.min(3, accompanimentLayers.length),
        arrangementEnergy: .98
      });
    });
    measures.forEach((measure, measureIndex) => {
      const plan = songArrangementPlan(measureIndex, measures.length, accompanimentLayers.length);
      cursor += scheduleMeasure(context, master, measure, start + cursor, secondsPerBeat, {
        instrument,
        sampledInstrument,
        accompaniment,
        accompanimentLayers,
        voiceState,
        // The saved instrumental version includes the student's composed
        // melody during the song section, while intro/outro stay backing-only.
        includeMelody: true,
        includeEffects: true,
        arrangementLayerCount: plan.layerCount,
        arrangementEnergy: plan.energy
      });
    });
    outroMeasures.forEach((measure) => {
      cursor += scheduleMeasure(context, master, measure, start + cursor, secondsPerBeat, {
        instrument,
        sampledInstrument: null,
        accompaniment,
        accompanimentLayers,
        voiceState,
        includeMelody: false,
        includeEffects: false,
        backingVolumeMultiplier: 1.22,
        arrangementSection: "outro",
        arrangementLayerCount: Math.min(3, accompanimentLayers.length),
        arrangementEnergy: .96
      });
    });

    window.setTimeout(() => {
      if (recorder.state !== "inactive") recorder.stop();
    }, Math.max(0, (start - context.currentTime + cursor + tailSeconds) * 1000));

    const recordedBlob = await stopped;
    const recordedBuffer = await recordedBlob.arrayBuffer();
    const decoded = await context.decodeAudioData(recordedBuffer);
    return encodeAudioBufferToMp3(decoded);
  } finally {
    activeOfflineExport = false;
    if (activePlaybackContext === context) activePlaybackContext = null;
    if (context.state !== "closed") await context.close();
  }
}

export async function exportBackingCompositionMp3Offline(
  measures: readonly PlaybackMeasure[],
  instrumentId: InstrumentId = "piano",
  bpm = 96,
  accompaniment?: AccompanimentOptions
): Promise<Blob | null> {
  if (activePlaybackContext || activeOfflineExport) return null;
  activeOfflineExport = true;
  try {
    const secondsPerBeat = 60 / bpm;
    const introMeasures = buildIntroMeasures(measures);
    const outroMeasures = buildOutroMeasures(measures);
    const start = 0.08;
    const tailSeconds = 0.8;
    const totalSeconds = start + compositionSeconds(introMeasures, secondsPerBeat) +
      compositionSeconds(measures, secondsPerBeat) + compositionSeconds(outroMeasures, secondsPerBeat) + tailSeconds;
    const context = new OfflineAudioContext(2, Math.ceil(totalSeconds * 44100), 44100);
    const master = createProtectedMaster(context, context.destination, 0.76);

    const instrument = findInstrument(instrumentId);
    let sampledInstrument: Awaited<ReturnType<typeof loadSampleInstrument>> | null = null;
    try {
      sampledInstrument = await loadSampleWithTimeout(context, master, instrumentId);
    } catch (error) {
      console.warn("?낃린 ?섑뵆??遺덈윭?ㅼ? 紐삵빐 ?⑹꽦 ?뚯깋???ъ슜?⑸땲??", error);
    }
    // SoundFont players can succeed in a live AudioContext yet write no audio
    // into an OfflineAudioContext. Use the reliable synthesized voice for the
    // downloadable backing track so its MP3 is never silent.
    const accompanimentLayers = (accompaniment?.instrumentIds ?? []).map((id) => ({ id, sample: null }));
    const voiceState = createArrangementVoiceState();
    let cursor = 0;

    introMeasures.forEach((measure) => {
      cursor += scheduleMeasure(context, master, measure, start + cursor, secondsPerBeat, {
        instrument,
        sampledInstrument: null,
        accompaniment,
        accompanimentLayers,
        voiceState,
        includeMelody: false,
        includeEffects: false,
        backingVolumeMultiplier: 1.28,
        arrangementSection: "intro",
        arrangementLayerCount: Math.min(3, accompanimentLayers.length),
        arrangementEnergy: .98
      });
    });
    measures.forEach((measure, measureIndex) => {
      const plan = songArrangementPlan(measureIndex, measures.length, accompanimentLayers.length);
      cursor += scheduleMeasure(context, master, measure, start + cursor, secondsPerBeat, {
        instrument,
        sampledInstrument: null,
        accompaniment,
        accompanimentLayers,
        voiceState,
        includeMelody: false,
        includeEffects: true,
        arrangementLayerCount: plan.layerCount,
        arrangementEnergy: plan.energy
      });
    });
    outroMeasures.forEach((measure) => {
      cursor += scheduleMeasure(context, master, measure, start + cursor, secondsPerBeat, {
        instrument,
        sampledInstrument: null,
        accompaniment,
        accompanimentLayers,
        voiceState,
        includeMelody: false,
        includeEffects: false,
        backingVolumeMultiplier: 1.22,
        arrangementSection: "outro",
        arrangementLayerCount: Math.min(3, accompanimentLayers.length),
        arrangementEnergy: .96
      });
    });

    const rendered = await context.startRendering();
    if (renderedAudioPeak(rendered) < 0.0001) {
      throw new Error("반주 소리를 만들지 못했어요. 다시 시도해 주세요.");
    }
    return encodeAudioBufferToMp3(rendered);
  } finally {
    activeOfflineExport = false;
  }
}

import { toNumber } from "../music/rational";
import { chordMidiPitches } from "../music/chord";
import { accompanimentInstrumentPart, accompanimentInstrumentProfile, accompanimentLayerRole, createAccompanimentPattern, createInstrumentAccompanimentPattern, createInstrumentTransitionFill, transposeOctaves, type AccompanimentInstrumentProfile, type AccompanimentStyleId } from "../music/accompaniment";
import { findInstrument, type Instrument, type InstrumentId } from "../music/instruments";
import type { Meter } from "../music/meter";
import { loadSampleInstrument, queueSampleNote, resetSampleInstrumentCache } from "./samplePlayer";
import { queueSoundEffect } from "./soundEffects";
import { isSoundEffectId } from "../music/soundEffects";
import type { HarmonyStory, NoteEvent, SoundEffectEvent } from "../music/types";
import { Mp3Encoder } from "@breezystack/lamejs";
import { scheduleDrumGroove } from "./drumGroove";
import { karaokeGuideSettings, type KaraokeGuideMode } from "./karaokeGuide";
import { createGentleNoiseGate, createVocalMonitor, karaokeBackingGainForRms, vocalCaptureProfile, type RecordingCaptureMode } from "./vocalCapture";
export { karaokeBackingGainForRms } from "./vocalCapture";
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
  meter?: Meter;
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

function beatAccent(offsetBeats: number, meter?: Meter): number {
  if (meter?.beats === 6 && meter.beatUnit === 8) {
    const compoundBeat = Math.round(offsetBeats / 1.5) * 1.5;
    if (Math.abs(offsetBeats - compoundBeat) > .08) return .92;
    return Math.abs(compoundBeat) < .08 ? 1.1 : 1.02;
  }
  const beat = Math.round(offsetBeats);
  if (Math.abs(offsetBeats - beat) > .08) return .93;
  if (beat === 0) return 1.1;
  if (meter?.beats === 4 && beat === 2) return 1.02;
  return .96;
}

type ArrangementVoiceState = {
  centers: Map<string, number>;
};

function createArrangementVoiceState(): ArrangementVoiceState {
  return { centers: new Map() };
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
  profile: AccompanimentInstrumentProfile,
  layerId: InstrumentId,
  state?: ArrangementVoiceState
): readonly number[] {
  if (pitches.length === 0) return pitches;
  const [min, max, restingCenter] = profile.range;
  const key = `${layerId}:${profile.part.id}`;
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

function melodyActivityAtBeat(
  notes: readonly NoteEvent[],
  targetBeat: number
): Readonly<{ pitch: number; onset: number; duration: number }> | null {
  let cursor = 0;
  for (const note of notes) {
    const duration = toNumber(note.duration);
    const end = cursor + duration;
    if (targetBeat >= cursor - .001 && targetBeat < end - .001) {
      return note.pitch === null ? null : { pitch: note.pitch, onset: cursor, duration };
    }
    cursor = end;
  }
  return null;
}

function movePitchesAwayFromMelody(
  pitches: readonly number[],
  melodyPitch: number | null,
  profile: AccompanimentInstrumentProfile
): readonly number[] {
  if (melodyPitch === null || profile.part.id === "bass") return pitches;
  const [min, max] = profile.range;
  const preferAbove = profile.part.id === "winds" || profile.part.id === "percussion";
  return [...new Set(pitches.map((pitch) => {
    const candidates = [-24, -12, 0, 12, 24]
      .map((shift) => ({ pitch: pitch + shift, shift }))
      .filter((candidate) => candidate.pitch >= min && candidate.pitch <= max);
    if (candidates.length === 0) return pitch;
    return candidates.reduce((best, candidate) => {
      const score = (Math.abs(candidate.pitch - melodyPitch) < 7 ? 100 : 0) +
        Math.abs(candidate.shift) * .12 +
        (preferAbove ? candidate.pitch < melodyPitch ? 3 : 0 : candidate.pitch > melodyPitch ? 3 : 0);
      const bestScore = (Math.abs(best.pitch - melodyPitch) < 7 ? 100 : 0) +
        Math.abs(best.shift) * .12 +
        (preferAbove ? best.pitch < melodyPitch ? 3 : 0 : best.pitch > melodyPitch ? 3 : 0);
      return score < bestScore ? candidate : best;
    }).pitch;
  }))];
}

type ArrangementPlan = Readonly<{ layerCount: number; energy: number }>;

function songArrangementPlan(measureIndex: number, measureCount: number, availableLayers: number): ArrangementPlan {
  if (availableLayers <= 2 || measureCount <= 3) return { layerCount: availableLayers, energy: 1 };
  const phraseIndex = Math.floor(measureIndex / 4);
  const phrasePosition = measureIndex % 4;
  const lastMeasure = measureIndex === measureCount - 1;
  const baseLayers = phraseIndex === 0 ? Math.min(2, availableLayers)
    : Math.min(3 + Math.max(0, phraseIndex - 1), availableLayers);
  if (lastMeasure) return { layerCount: availableLayers, energy: 1.04 };
  if (phrasePosition === 0) return { layerCount: Math.max(1, baseLayers - 1), energy: .82 + phraseIndex * .06 };
  if (phrasePosition === 3) return { layerCount: Math.min(baseLayers + 1, availableLayers), energy: .98 + phraseIndex * .04 };
  return { layerCount: baseLayers, energy: .9 + phraseIndex * .06 };
}

export function recordingArrangementPlan(
  measureIndex: number,
  measureCount: number,
  availableLayers: number
): ArrangementPlan {
  const plan = songArrangementPlan(measureIndex, measureCount, availableLayers);
  return {
    layerCount: Math.min(availableLayers, Math.max(Math.min(2, availableLayers), plan.layerCount + 1)),
    energy: Math.max(.98, plan.energy * 1.08)
  };
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
  return [subdominant, dominant, tonic, tonic].map((chord) => accompanimentMeasure(template, chord));
}

async function loadAccompanimentLayers(context: BaseAudioContext, destination: AudioNode,
  accompaniment?: AccompanimentOptions) {
  return Promise.all((accompaniment?.instrumentIds ?? []).map(async (id) => {
    try {
      return { id, sample: await loadSampleWithTimeout(context, destination, id) };
    } catch (error) {
      console.warn(`${id} 반주 악기 샘플을 불러오지 못해 합성 음색을 사용합니다.`, error);
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
    melodyDestination?: AudioNode;
    melodyMode?: "all" | "first-note";
    transitionFill?: boolean;
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
  const layerDensityScale = arrangementLayerCount > 6 ? Math.sqrt(6 / arrangementLayerCount) : 1;
  const measureBeats = measure.notes.reduce((total, note) => total + toNumber(note.duration), 0);
  const chordSymbols = measure.chords && measure.chords.length > 0 ? measure.chords : [""];
  const chordBeats = measureBeats / chordSymbols.length;
  if (options.accompaniment) {
    scheduleDrumGroove(context, destination, absoluteStart, secondsPerBeat, options.accompaniment.styleId,
      measureBeats, options.accompaniment.meter, arrangementEnergy, options.transitionFill === true);
  }

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
      const profile = accompanimentInstrumentProfile(layer.id, layerIndex);
      const part = profile.part;
      const regularPattern = createInstrumentAccompanimentPattern(
        options.accompaniment?.styleId ?? "arpeggio",
        chordBeats,
        layer.id,
        layerIndex,
        options.accompaniment?.meter
      );
      const pattern = options.transitionFill && chordIndex === chordSymbols.length - 1
        ? [...regularPattern, ...createInstrumentTransitionFill(
          chordBeats, layer.id, layerIndex, options.accompaniment?.meter
        )] : regularPattern;
      pattern.forEach((event) => {
        const role = accompanimentLayerRole(layerIndex);
        const measureBeat = chordIndex * chordBeats + event.offsetBeats;
        const melodyActivity = arrangementSection === "song"
          ? melodyActivityAtBeat(measure.notes, measureBeat)
          : null;
        const melodyPitch = melodyActivity?.pitch ?? null;
        const compingHasSpace = melodyActivity === null ||
          (melodyActivity.duration >= 1 && measureBeat - melodyActivity.onset >= .5);
        if (options.accompaniment?.styleId === "comping" && !compingHasSpace) return;
        if (part.id === "winds" && options.accompanimentLayers.length > 1 && !compingHasSpace) return;
        let eventPitches: readonly number[];
        if (part.id === "bass") {
          eventPitches = [transposeOctaves(pitches[0], -2)];
        } else if (part.id === "keys") {
          eventPitches = event.voice === "root" ? [transposeOctaves(pitches[0], -1)] : pitches.slice(0, 3);
        } else if (part.id === "guitar") {
          eventPitches = event.voice === "root" ? [transposeOctaves(pitches[0], -1)]
            : [pitches[(event.step ?? layerIndex) % pitches.length]];
        } else if (part.id === "strings") {
          eventPitches = profile.polyphonic
            ? pitches.slice(0, 3)
            : [pitches[(event.step ?? layerIndex) % pitches.length]];
        } else if (part.id === "winds") {
          eventPitches = [transposeOctaves(pitches[(event.step ?? layerIndex) % pitches.length], 1)];
        } else if (part.id === "percussion") {
          eventPitches = layer.id.includes("timpani")
            ? [transposeOctaves(pitches[0], -1)]
            : layer.id.includes("orchestra_hit")
              ? pitches.slice(0, 3)
              : [pitches[(event.step ?? layerIndex) % pitches.length]];
        } else if (role.id === "high") {
          eventPitches = [transposeOctaves(pitches[(event.step ?? layerIndex) % pitches.length], 1)];
        } else if (role.id === "pulse") {
          eventPitches = [pitches[(layerIndex + 1) % pitches.length]];
        } else if (role.id === "middle") {
          eventPitches = [pitches[(event.step ?? 1) % pitches.length]];
        } else {
          eventPitches = [transposeOctaves(pitches[pitches.length - 1], 1)];
        }
        eventPitches = voiceLedPitches(eventPitches, profile, layer.id, options.voiceState);
        eventPitches = movePitchesAwayFromMelody(eventPitches, melodyPitch, profile);
        const roleDelay = part.id === "bass" || part.id === "strings" ? 0 : arrangementSection === "song"
          ? Math.min(event.durationBeats * secondsPerBeat * .16, secondsPerBeat * .09) * (layerIndex % 3)
          : Math.min(event.durationBeats * secondsPerBeat * .07, secondsPerBeat * .035) * (layerIndex % 2);
        const roleVolume = part.id === "bass" ? 1.15 : part.id === "keys" ? .82
          : part.id === "guitar" ? .78 : part.id === "strings" ? .66
          : part.id === "winds" ? .9 : part.id === "percussion" ? .74
          : role.id === "bass" ? 1.15 : role.id === "chords" ? .82
          : role.id === "high" || role.id === "sparkle" ? .9 : .72;
        const sectionVolume = arrangementSection === "intro" ? .97 : arrangementSection === "outro" ? .95 : 1;
        eventPitches.forEach((pitch) => {
          const baseStart = absoluteStart + (chordIndex * chordBeats + event.offsetBeats) * secondsPerBeat;
          const noteDuration = event.durationBeats * secondsPerBeat;
          const expressionSeed = chordIndex * 17 + layerIndex * 7 + Math.round(event.offsetBeats * 8);
          const noteStart = Math.max(absoluteStart,
            baseStart + Math.min(roleDelay, noteDuration * .24) + performanceNudge(expressionSeed, secondsPerBeat));
          const performedDuration = Math.max(.035, noteDuration * accompanimentArticulation(part.id, event.voice));
          const layerInstrument = findInstrument(layer.id);
          const performedVolume = layerInstrument.volume * .62 * roleVolume * profile.gain * sectionVolume *
            backingVolumeMultiplier * arrangementEnergy * layerDensityScale *
            beatAccent(measureBeat, options.accompaniment?.meter);
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
    melodyPlaybackEvents(measure.notes, secondsPerBeat)
      .filter((_, index) => options.melodyMode !== "first-note" || index === 0)
      .forEach((event, index) => {
      const noteStart = absoluteStart + event.start + performanceNudge(index + 3, secondsPerBeat);
      const noteDuration = Math.max(.04, event.duration * .97);
      const melodyVolume = options.instrument.volume * melodyVolumeMultiplier * (index % 4 === 0 ? 1.06 : .98);
      if (options.sampledInstrument) {
        queueSampleNote(options.sampledInstrument, context, options.melodyDestination ?? destination, event.pitch,
          noteStart, noteDuration, melodyVolume);
      } else {
        addInstrumentTone(context, options.melodyDestination ?? destination, event.pitch, noteStart, noteDuration,
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
      transitionFill: (measureIndex + 1) % 4 === 0 || measureIndex === measures.length - 1,
      arrangementEnergy: plan.energy
    });
  });

  releasePlayback(context, songCursor + 0.5);
  return songCursor + 0.5;
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
  if (activePlaybackContext) return null;
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
        backingVolumeMultiplier: 1.22,
        arrangementSection: "intro",
        arrangementLayerCount: Math.min(3, accompanimentLayers.length),
        arrangementEnergy: 1
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
      cursor += scheduleMeasure(context, master, measure, start + cursor, secondsPerBeat, {
        instrument,
        sampledInstrument,
        accompaniment,
        accompanimentLayers,
        voiceState,
        includeMelody: true,
        includeEffects: true,
        melodyVolumeMultiplier: .82,
        backingVolumeMultiplier: 1.12,
        arrangementLayerCount: plan.layerCount,
        transitionFill: (measureIndex + 1) % 4 === 0 || measureIndex === measures.length - 1,
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
        backingVolumeMultiplier: 1.18,
        arrangementSection: "outro",
        arrangementLayerCount: Math.min(3, accompanimentLayers.length),
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
  let callbackTimers: number[] = [];
  let activeRecorders: MediaRecorder[] = [];
  const stopActiveRecorders = () => {
    activeRecorders.forEach((recorder) => {
      try {
        if (recorder.state !== "inactive") recorder.stop();
      } catch (error) {
        console.warn("녹음기를 종료하지 못했어요.", error);
      }
    });
  };
  const abortRecording = () => {
    callbackTimers.forEach((timer) => window.clearTimeout(timer));
    callbackTimers = [];
    stopActiveRecorders();
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
    callbacks.onStatus?.("마이크 권한을 허용해 주세요.");
    microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: capture.constraints });
    throwIfAborted();
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
    const mixBus = context.createGain();
    mixBus.gain.value = capture.mixBusGain;
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
    guideBus.connect(context.destination);
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
    vocalHighPass.frequency.value = capture.highPassHz;
    vocalHighPass.Q.value = 0.7;
    const vocalLowPass = context.createBiquadFilter();
    vocalLowPass.type = "lowpass";
    vocalLowPass.frequency.value = capture.lowPassHz;
    vocalLowPass.Q.value = 0.5;
    const vocalMudCut = context.createBiquadFilter();
    vocalMudCut.type = "peaking";
    vocalMudCut.frequency.value = 260;
    vocalMudCut.Q.value = 1.1;
    vocalMudCut.gain.value = capture.mudCutDb;
    const vocalPresence = context.createBiquadFilter();
    vocalPresence.type = "peaking";
    vocalPresence.frequency.value = 3200;
    vocalPresence.Q.value = 0.9;
    vocalPresence.gain.value = capture.presenceDb;
    const vocalDeEsser = context.createBiquadFilter();
    vocalDeEsser.type = "peaking";
    vocalDeEsser.frequency.value = 6500;
    vocalDeEsser.Q.value = 1.4;
    vocalDeEsser.gain.value = capture.deEsserDb;
    const noiseGate = capture.useNoiseGate ? createGentleNoiseGate(context) : null;
    stopNoiseGate = noiseGate?.stop ?? null;
    const vocalCompressor = context.createDynamicsCompressor();
    vocalCompressor.threshold.value = capture.compressorThreshold;
    vocalCompressor.knee.value = 24;
    vocalCompressor.ratio.value = capture.compressorRatio;
    vocalCompressor.attack.value = 0.012;
    vocalCompressor.release.value = 0.24;
    const vocalDry = context.createGain();
    vocalDry.gain.value = capture.dryGain;
    const reverbSend = context.createGain();
    reverbSend.gain.value = capture.reverbSend;
    const reverb = context.createConvolver();
    reverb.buffer = createRoomImpulse(context);
    const reverbReturn = context.createGain();
    reverbReturn.gain.value = capture.reverbReturn;
    microphone.connect(vocalHighPass).connect(vocalLowPass).connect(vocalMudCut)
      .connect(vocalPresence).connect(vocalDeEsser);
    const vocalSource: AudioNode = noiseGate ? noiseGate.output : vocalDeEsser;
    if (noiseGate) vocalDeEsser.connect(noiseGate.input);
    vocalSource.connect(vocalCompressor);
    stopVocalMonitor = createVocalMonitor(context, vocalSource, master, callbacks.onInputLevel, recordingMode);
    vocalCompressor.connect(vocalDry).connect(vocalBus);
    vocalCompressor.connect(reverbSend).connect(reverb).connect(reverbReturn).connect(vocalBus);

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
    activeRecorders = [mixRecorder.recorder, vocalRecorder.recorder, backingRecorder.recorder];

    const start = context.currentTime + 0.6;
    let cursor = 0;
    mixRecorder.recorder.start(250);
    vocalRecorder.recorder.start(250);
    backingRecorder.recorder.start(250);
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
      const plan = recordingArrangementPlan(measureIndex, measures.length, accompanimentLayers.length);
      cursor += scheduleMeasure(context, master, measure, start + cursor, secondsPerBeat, {
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
        backingVolumeMultiplier: 1.18,
        arrangementLayerCount: plan.layerCount,
        transitionFill: (measureIndex + 1) % 4 === 0 || measureIndex === measures.length - 1,
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
        backingVolumeMultiplier: 1.22,
        arrangementSection: "outro",
        arrangementLayerCount: Math.min(3, accompanimentLayers.length),
        arrangementEnergy: .96
      });
    });

    queueCallback(cursor + tailSeconds, stopActiveRecorders);

    const [recordedBlob, vocalBlob, backingBlob] = await Promise.all([
      mixRecorder.stopped, vocalRecorder.stopped, backingRecorder.stopped
    ]);
    callbackTimers.forEach((timer) => window.clearTimeout(timer));
    callbackTimers = [];
    throwIfAborted();
    callbacks.onHighlight?.({ section: "outro", measureIndex: null, noteId: null });
    callbacks.onPhase?.("encoding");
    callbacks.onStatus?.("MP3 파일로 바꾸는 중이에요.");
    const recordedBuffer = await recordedBlob.arrayBuffer();
    const decoded = await context.decodeAudioData(recordedBuffer);
    throwIfAborted();
    const vocalAudioBuffer = await context.decodeAudioData(await vocalBlob.arrayBuffer());
    throwIfAborted();
    const backingAudioBuffer = await context.decodeAudioData(await backingBlob.arrayBuffer());
    throwIfAborted();
    const mp3Blob = encodeAudioBufferToMp3(decoded);
    throwIfAborted();
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
    signal?.removeEventListener("abort", abortRecording);
    callbackTimers.forEach((timer) => window.clearTimeout(timer));
    stopNoiseGate?.();
    stopVocalMonitor?.();
    microphoneStream?.getTracks().forEach((track) => track.stop());
    if (activePlaybackContext === context) activePlaybackContext = null;
    if (context.state !== "closed") await context.close().catch(() => undefined);
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
      console.warn("악기 샘플을 불러오지 못해 합성 음색을 사용합니다.", error);
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
        sampledInstrument: null,
        accompaniment,
        accompanimentLayers,
        voiceState,
        includeMelody: false,
        includeEffects: true,
        arrangementLayerCount: plan.layerCount,
        transitionFill: (measureIndex + 1) % 4 === 0 || measureIndex === measures.length - 1,
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
      console.warn("악기 샘플을 불러오지 못해 합성 음색을 사용합니다.", error);
    }
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
        transitionFill: (measureIndex + 1) % 4 === 0 || measureIndex === measures.length - 1,
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

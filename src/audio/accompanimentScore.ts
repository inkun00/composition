import { toNumber } from "../music/rational";
import { chordMidiPitches } from "../music/chord";
import { cadenceChords } from "../music/cadence";
import { type AccompanimentStyleId } from "../music/accompaniment";
import { findInstrument, type Instrument, type InstrumentId } from "../music/instruments";
import type { Meter } from "../music/meter";
import { loadSampleInstrument, queueSampleNote } from "./samplePlayer";
import { queueSoundEffect } from "./soundEffects";
import { isSoundEffectId } from "../music/soundEffects";
import type { HarmonyStory, NoteEvent, SoundEffectEvent } from "../music/types";
import { scheduleBeatPattern } from "./drumGroove";
import { type BeatPatternEvent } from "../music/beatPattern";
import { type ArrangementVoiceState } from "./accompanimentPerformance";
import { planAccompanimentEnsemble } from "./ensemblePerformance";
import { type AccompanimentLayer, type AccompanimentTrackState } from "./accompanimentRuntime";
import type { AccompanimentTrackMixMap } from "../music/accompanimentMix";
import { analyzeAccompanimentEnsemble, ensembleContextForMeasure,
  type AccompanimentEnsembleScore, type EnsembleSection } from "../music/accompanimentEnsemble";

export type PlaybackMeasure = Readonly<{
  notes: readonly NoteEvent[];
  harmony: HarmonyStory;
  chords?: readonly string[];
  effects?: readonly SoundEffectEvent[];
  measureIndex?: number;
  isSongEnding?: boolean;
}>;

export type AccompanimentOptions = Readonly<{
  styleId: AccompanimentStyleId;
  instrumentIds: readonly InstrumentId[];
  beatPattern?: readonly BeatPatternEvent[];
  beatVolume?: number;
  meter?: Meter;
  trackMix?: AccompanimentTrackMixMap;
  soloInstrumentId?: string;
  onTrackState?: (state: AccompanimentTrackState) => void;
  /** Prepared once per playback/export so every part reads the same student phrase. */
  ensembleScore?: Readonly<Record<EnsembleSection, AccompanimentEnsembleScore>>;
}>;

export const chordPitches: Record<HarmonyStory, number[]> = {
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
export function frequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function addTone(
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

export function createProtectedMaster(context: BaseAudioContext, destination: AudioNode, volume: number): GainNode {
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

export function addInstrumentTone(
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

export function melodyPlaybackEvents(notes: readonly NoteEvent[], secondsPerBeat: number) {
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

export function measureSeconds(measure: PlaybackMeasure, secondsPerBeat: number): number {
  return measure.notes.reduce((total, note) => total + toNumber(note.duration), 0) * secondsPerBeat;
}

export function compositionSeconds(measures: readonly PlaybackMeasure[], secondsPerBeat: number): number {
  return measures.reduce((total, measure) => total + measureSeconds(measure, secondsPerBeat), 0);
}

function performanceNudge(seed: number, secondsPerBeat: number): number {
  const contour = [-.62, .18, -.16, .46, -.32, .08, .3, -.08];
  return contour[Math.abs(seed) % contour.length] * Math.min(.012, secondsPerBeat * .018);
}

type ArrangementPlan = Readonly<{ layerCount: number; energy: number }>;

export function songArrangementPlan(measureIndex: number, measureCount: number, availableLayers: number): ArrangementPlan {
  if (availableLayers <= 2 || measureCount <= 3) return { layerCount: availableLayers, energy: 1 };
  const phraseIndex = Math.floor(measureIndex / 4);
  const phrasePosition = measureIndex % 4;
  const lastMeasure = measureIndex === measureCount - 1;
  const phraseCount = Math.ceil(measureCount / 4);
  const finalPhrase = phraseIndex === phraseCount - 1;
  const breathingPhrase = phraseCount >= 4 && phraseIndex % 4 === 2 && !finalPhrase;
  const baseEnergy = breathingPhrase ? .84 : finalPhrase ? 1.04 : phraseIndex === 0 ? .92 : .98;
  const energy = lastMeasure ? 1.04 : phrasePosition === 0 ? baseEnergy - .04 :
    phrasePosition === 3 ? baseEnergy + .04 : baseEnergy;
  return { layerCount: availableLayers, energy };
}

export function recordingArrangementPlan(
  measureIndex: number,
  measureCount: number,
  availableLayers: number
): ArrangementPlan {
  return songArrangementPlan(measureIndex, measureCount, availableLayers);
}

function accompanimentMeasure(template: PlaybackMeasure, chord: string, measureIndex?: number): PlaybackMeasure {
  return { ...template, chords: [chord], effects: [], measureIndex };
}

export function buildIntroMeasures(measures: readonly PlaybackMeasure[]): PlaybackMeasure[] {
  if (measures.length === 0) return [];
  const target = measures[0].chords?.[0] ?? "";
  const cadence = cadenceChords(target);
  if (!cadence) return Array.from({ length: 4 }, (_, index) => accompanimentMeasure(measures[index % measures.length], measures[index % measures.length].chords?.[0] ?? "", index));
  const [subdominant, dominant, tonic] = cadence;
  return [tonic, subdominant, dominant, dominant].map((chord, measureIndex) => accompanimentMeasure(measures[0], chord, measureIndex));
}

export function compositionIntroDuration(measures: readonly PlaybackMeasure[], bpm: number): number {
  return buildIntroMeasures(measures).reduce((total, measure) =>
    total + measure.notes.reduce((beats, note) => beats + toNumber(note.duration), 0), 0) * 60 / bpm;
}

export function buildOutroMeasures(measures: readonly PlaybackMeasure[]): PlaybackMeasure[] {
  if (measures.length === 0) return [];
  const template = measures[measures.length - 1];
  const target = template.chords?.at(-1) ?? template.chords?.[0] ?? "";
  const cadence = cadenceChords(target);
  if (!cadence) {
    const source = measures.slice(Math.max(0, measures.length - 4));
    return Array.from({ length: 4 }, (_, index) => accompanimentMeasure(source[index % source.length], source[index % source.length].chords?.[0] ?? "", index));
  }
  const [subdominant, dominant, tonic] = cadence;
  return [subdominant, dominant, tonic, tonic].map((chord, measureIndex) => accompanimentMeasure(template, chord, measureIndex));
}

export function prepareAccompaniment(
  accompaniment: AccompanimentOptions | undefined,
  measures: readonly PlaybackMeasure[]
): AccompanimentOptions | undefined {
  if (!accompaniment) return undefined;
  const ids = accompaniment.instrumentIds;
  return { ...accompaniment, ensembleScore: {
    song: analyzeAccompanimentEnsemble(measures, ids),
    intro: analyzeAccompanimentEnsemble(buildIntroMeasures(measures), ids, "intro"),
    outro: analyzeAccompanimentEnsemble(buildOutroMeasures(measures), ids, "outro")
  } };
}

export function scheduleMeasure(
  context: BaseAudioContext,
  destination: AudioNode,
  measure: PlaybackMeasure,
  absoluteStart: number,
  secondsPerBeat: number,
  options: Readonly<{
    instrument: Instrument;
    sampledInstrument: Awaited<ReturnType<typeof loadSampleInstrument>> | null;
    accompaniment?: AccompanimentOptions;
    accompanimentLayers: readonly AccompanimentLayer[];
    includeMelody: boolean;
    includeEffects: boolean;
    /** false면 반주·기본 화음 패드·비트 없이 가락만 재생한다. */
    includeBacking?: boolean;
    backingVolumeMultiplier?: number;
    melodyVolumeMultiplier?: number;
    melodyDestination?: AudioNode;
    melodyMode?: "all" | "first-note";
    transitionFill?: boolean;
    ending?: boolean;
    arrangementSection?: "intro" | "song" | "outro";
    voiceState?: ArrangementVoiceState;
    arrangementLayerCount?: number;
    arrangementEnergy?: number;
  }>
): number {
  const backingVolumeMultiplier = options.backingVolumeMultiplier ?? 1;
  const melodyVolumeMultiplier = options.melodyVolumeMultiplier ?? 1;
  const arrangementSection = options.arrangementSection ?? "song";
  // A selected instrument keeps its musical role throughout the score. Phrase
  // dynamics must never discard tracks based on their selection order.
  const arrangementLayerCount = options.accompanimentLayers.length;
  const solo = options.accompaniment?.soloInstrumentId;
  const arrangementEnergy = options.arrangementEnergy ?? 1;
  const layerDensityScale = arrangementLayerCount > 6 ? Math.sqrt(6 / arrangementLayerCount) : 1;
  const measureBeats = measure.notes.reduce((total, note) => total + toNumber(note.duration), 0);
  const chordSymbols = measure.chords && measure.chords.length > 0 ? measure.chords : [""];
  const chordBeats = measureBeats / chordSymbols.length;
  const includeBacking = options.includeBacking ?? true;
  if (includeBacking && !solo && options.accompaniment?.beatPattern && options.accompaniment.beatPattern.length > 0) {
    scheduleBeatPattern(context, destination, absoluteStart, secondsPerBeat, measureBeats,
      measure.measureIndex ?? 0, options.accompaniment.beatPattern,
      options.accompaniment.beatVolume ?? 100, arrangementEnergy);
  }

  if (!includeBacking) {
    // 가락만 듣는 모드: 배경 화음을 깔지 않는다.
  } else if (!options.accompaniment) {
    chordSymbols.forEach((chord, chordIndex) => {
      const pitches = chord ? chordMidiPitches(chord) : chordPitches[measure.harmony];
      pitches.forEach((pitch) => {
        addTone(context, destination, pitch, absoluteStart + chordIndex * chordBeats * secondsPerBeat,
          chordBeats * secondsPerBeat, 0.028 * backingVolumeMultiplier, "sine");
      });
    });
  } else {
    const accompaniment = options.accompaniment;
    const ensemble = ensembleContextForMeasure(accompaniment.ensembleScore?.[arrangementSection], measure.measureIndex ?? 0);
    const performances = planAccompanimentEnsemble({
      notes: measure.notes,
      chords: measure.chords,
      fallbackPitches: chordPitches[measure.harmony],
      styleId: accompaniment.styleId,
      secondsPerBeat,
      measureIndex: measure.measureIndex,
      meter: accompaniment.meter,
      section: arrangementSection,
      transitionFill: options.transitionFill,
      ending: options.ending,
      state: options.voiceState,
      ensemble
    }, options.accompanimentLayers.map((layer) => layer.id));
    options.accompanimentLayers.forEach((layer) => {
      const layerInstrument = findInstrument(layer.id);
      const performance = performances.get(layer.id) ?? [];
      performance.forEach((note) => {
        const volume = layerInstrument.volume * note.velocity * backingVolumeMultiplier *
          arrangementEnergy * layerDensityScale;
        const noteStart = absoluteStart + note.offsetSeconds;
        if (layer.sample) {
          queueSampleNote(layer.sample, context, layer.destination, note.pitch, noteStart, note.durationSeconds, volume);
        }
      });
    });
  }
  if (options.includeMelody && !solo) {
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

  if (options.includeEffects && !solo) {
    (measure.effects ?? []).forEach((effect) => {
      if (isSoundEffectId(effect.effectId)) {
        queueSoundEffect(context, destination, effect.effectId,
          absoluteStart + effect.offsetBeats * secondsPerBeat);
      }
    });
  }

  return measureBeats * secondsPerBeat;
}

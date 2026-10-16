import {
  accompanimentInstrumentProfile,
  accompanimentLayerRole,
  type AccompanimentEvent,
  type AccompanimentInstrumentProfile,
  type AccompanimentStyleId
} from "../music/accompaniment";
import { createArrangedAccompanimentPattern } from "../music/accompanimentArrangement";
import { ensembleRoleForInstrument, type AccompanimentEnsembleContext } from "../music/accompanimentEnsemble";
import { createAccompanimentPhrase, type PhrasePeerNote } from "../music/accompanimentPhrase";
import { accompanimentVoicingCandidates, chordVoicingClasses } from "../music/accompanimentVoicing";
import { coordinateAccompanimentTexture } from "../music/accompanimentTexture";
import { chordPitchClasses } from "../music/chord";
import type { InstrumentId } from "../music/instruments";
import type { Meter } from "../music/meter";
import { toNumber } from "../music/rational";
import type { NoteEvent } from "../music/types";

export type ArrangementVoiceState = {
  voicings: Map<string, readonly number[]>;
};

export function createArrangementVoiceState(): ArrangementVoiceState {
  return { voicings: new Map() };
}

export type AccompanimentPerformanceNote = Readonly<{
  pitch: number;
  offsetSeconds: number;
  durationSeconds: number;
  velocity: number;
}>;

type MelodySpan = Readonly<{ pitch: number; onset: number; end: number }>;
type ChordMaterial = Readonly<{ bass: number; tones: readonly number[] }>;
export type PerformanceOptions = Readonly<{
  notes: readonly NoteEvent[];
  chords?: readonly string[];
  fallbackPitches: readonly number[];
  styleId: AccompanimentStyleId;
  instrumentId: InstrumentId;
  layerIndex: number;
  layerCount: number;
  secondsPerBeat: number;
  measureIndex?: number;
  meter?: Meter;
  section?: "intro" | "song" | "outro";
  transitionFill?: boolean;
  ending?: boolean;
  state?: ArrangementVoiceState;
  ensemble?: AccompanimentEnsembleContext;
  peerNotes?: readonly PhrasePeerNote[];
}>;

function pc(pitch: number): number {
  return ((pitch % 12) + 12) % 12;
}

function octaveChoices(pitchClass: number, min: number, max: number): number[] {
  const result: number[] = [];
  for (let pitch = min; pitch <= max; pitch += 1) {
    if (pc(pitch) === pc(pitchClass)) result.push(pitch);
  }
  return result;
}

function nearestOctave(pitchClass: number, target: number, min: number, max: number): number | undefined {
  return octaveChoices(pitchClass, min, max).sort((left, right) =>
    Math.abs(left - target) - Math.abs(right - target) || left - right)[0];
}

function melodySpans(notes: readonly NoteEvent[]): readonly MelodySpan[] {
  const result: Array<{ pitch: number; onset: number; end: number }> = [];
  let cursor = 0;
  notes.forEach((note, index) => {
    const duration = toNumber(note.duration);
    const previous = result[result.length - 1];
    if (note.pitch !== null) {
      if (notes[index - 1]?.linkToNext && previous?.pitch === note.pitch) previous.end += duration;
      else result.push({ pitch: note.pitch, onset: cursor, end: cursor + duration });
    }
    cursor += duration;
  });
  return result;
}

function materialForChord(symbol: string | undefined, fallback: readonly number[]): ChordMaterial {
  if (!symbol) return { bass: pc(fallback[0] ?? 48), tones: [...new Set(fallback.map(pc))] };
  // The slash note belongs to the bass part; upper voices retain the named
  // chord's third, seventh and extensions instead of losing them to a slice.
  return { bass: chordPitchClasses(symbol)[0], tones: chordPitchClasses(symbol.split("/")[0]) };
}

function movementCost(candidate: readonly number[], previous: readonly number[], restingCenter: number): number {
  const center = candidate.reduce((sum, pitch) => sum + pitch, 0) / candidate.length;
  if (previous.length === 0) return Math.abs(center - restingCenter);
  const travel = candidate.reduce((sum, pitch, index) =>
    sum + Math.abs(pitch - previous[Math.min(index, previous.length - 1)]), 0) / candidate.length;
  return travel + Math.abs(center - restingCenter) * .12;
}

function voicedChord(
  tones: readonly number[], profile: AccompanimentInstrumentProfile, previous: readonly number[]
): readonly number[] {
  const [min, max, center] = profile.range;
  const classes = chordVoicingClasses(tones);
  const candidates = [...accompanimentVoicingCandidates(tones, profile.range)];
  candidates.sort((left, right) => movementCost(left, previous, center) - movementCost(right, previous, center));
  if (candidates[0]) return candidates[0];
  // A narrow instrument range may not fit every extension. Omit unavailable
  // voices rather than clamp MIDI values and silently change the harmony.
  return [...new Set(classes.flatMap((tone) => {
    const pitch = nearestOctave(tone, center, min, max);
    return pitch === undefined ? [] : [pitch];
  }))].sort((left, right) => left - right);
}

function degreePitch(
  material: ChordMaterial, step: number, profile: AccompanimentInstrumentProfile
): number | undefined {
  const [min, max, center] = profile.range;
  const degree = ((step % material.tones.length) + material.tones.length) % material.tones.length;
  const root = nearestOctave(material.tones[0], center - 5, min, max) ?? min;
  let orderedPitch = root;
  for (let index = 1; index <= degree; index += 1) {
    orderedPitch += (pc(material.tones[index]) - pc(orderedPitch) + 12) % 12 || 12;
  }
  orderedPitch += Math.floor(step / material.tones.length) * 12;
  return nearestOctave(material.tones[degree], orderedPitch, min, max);
}

function eventPitches(
  event: AccompanimentEvent,
  material: ChordMaterial,
  profile: AccompanimentInstrumentProfile,
  options: PerformanceOptions,
  previous: readonly number[]
): readonly number[] {
  const [min, max, center] = profile.range;
  const part = profile.part.id;
  const assignment = ensembleRoleForInstrument(options.ensemble, options.instrumentId);
  if (part === "bass" || assignment?.role === "bass" || options.instrumentId.includes("timpani")) {
    const tone = event.voice === "step"
      ? material.tones[((event.step ?? 0) % material.tones.length + material.tones.length) % material.tones.length]
      : material.bass;
    const pitch = nearestOctave(tone, part === "bass" ? center : center - 8, min, max);
    return pitch === undefined ? [] : [pitch];
  }
  if (event.voice === "step") {
    const pitch = degreePitch(material, event.step ?? 0, profile);
    return pitch === undefined ? [] : [pitch];
  }
  if (event.voice === "root") {
    const pitch = nearestOctave(material.bass, center - 8, min, max);
    return pitch === undefined ? [] : [pitch];
  }
  if (profile.polyphonic || part === "guitar") {
    const voicing = voicedChord(material.tones, profile, previous);
    // A second chordal instrument supplies rhythmic colour in a higher, thinner
    // voicing instead of duplicating the primary harmony player's full chord.
    return assignment?.role === "pulse" && voicing.length > 2 ? voicing.slice(-2) : voicing;
  }
  const role = accompanimentLayerRole(options.layerIndex);
  const degree = part === "winds" ? 1 : role.id === "middle" ? 1 : 2;
  const pitch = nearestOctave(material.tones[Math.min(degree, material.tones.length - 1)],
    previous[0] ?? center, min, max);
  return pitch === undefined ? [] : [pitch];
}

function melodyPenalty(pitch: number, melody: readonly MelodySpan[], onset: number, end: number): number {
  return melody.reduce((sum, note) => {
    const overlap = Math.max(0, Math.min(end, note.end) - Math.max(onset, note.onset));
    if (overlap <= .03) return sum;
    const distance = Math.abs(pitch - note.pitch);
    const close = distance < 7 ? (distance === 1 ? 20 : distance === 2 ? 11 : 4) : 0;
    const rough = distance === 11 || distance === 13 ? 12 : 0;
    return sum + (close + rough) * Math.min(1, overlap / .35);
  }, 0);
}

function melodyAwareVoicing(
  pitches: readonly number[], melody: readonly MelodySpan[], onset: number, end: number,
  profile: AccompanimentInstrumentProfile, keepContour: boolean, chordTones: readonly number[]
): readonly number[] {
  if (profile.part.id === "bass" || melody.length === 0 || keepContour) return pitches;
  const [min, max, center] = profile.range;
  const selected: number[] = [];
  for (const original of pitches) {
    const score = (pitch: number) => melodyPenalty(pitch, melody, onset, end) +
      Math.abs(pitch - original) * .13 + Math.abs(pitch - center) * .025;
    const sameTone = octaveChoices(pc(original), min, max)
      .filter((pitch) => !selected.includes(pitch)).sort((left, right) => score(left) - score(right));
    let choice = sameTone[0];
    if (choice === undefined || melodyPenalty(choice, melody, onset, end) >= 11) {
      // Move individual voices before omitting them. In particular, a sustained
      // E against sung F may have no clear E octave, while C or G still fits.
      // Substitutions always come from this chord, including its extensions.
      const alternatives = chordTones.flatMap((tone) => octaveChoices(tone, min, max))
        .filter((pitch) => !selected.includes(pitch)).sort((left, right) => score(left) - score(right));
      const alternative = alternatives[0];
      if (alternative !== undefined && (choice === undefined || score(alternative) + 2 < score(choice))) {
        choice = alternative;
      }
    }
    if (choice !== undefined && melodyPenalty(choice, melody, onset, end) < 11) selected.push(choice);
  }
  if (selected.length > 0) return selected.sort((left, right) => left - right);
  // An unusually wide or chromatic melody can cover every available register.
  // Keep one least exposed harmonic voice instead of silently deleting a part.
  const fallback = chordTones.flatMap((tone) => octaveChoices(tone, min, max)).sort((left, right) =>
    melodyPenalty(left, melody, onset, end) - melodyPenalty(right, melody, onset, end) ||
    Math.abs(left - center) - Math.abs(right - center))[0];
  return fallback === undefined ? pitches.slice(0, 1) : [fallback];
}

function lineOctaveShift(
  pattern: readonly AccompanimentEvent[], symbols: readonly string[], chordBeats: number,
  profile: AccompanimentInstrumentProfile, options: PerformanceOptions, melody: readonly MelodySpan[]
): number {
  if (profile.part.id === "bass" || melody.length === 0) return 0;
  const steps = pattern.filter((event) => event.voice === "step")
    .flatMap((event) => eventFragments(event, chordBeats, symbols.length,
      !!event.sustain || profile.part.id === "strings")).flatMap((event) => {
    const index = Math.min(symbols.length - 1, Math.floor((event.offsetBeats + .0001) / chordBeats));
    const material = materialForChord(symbols[index], options.fallbackPitches);
    return eventPitches(event, material, profile, options, []).map((pitch) => ({ pitch, event }));
  });
  if (steps.length === 0) return 0;
  const [min, max] = profile.range;
  const candidates = [-24, -12, 0, 12, 24].filter((shift) =>
    steps.every(({ pitch }) => pitch + shift >= min && pitch + shift <= max));
  // One octave decision for the complete figure preserves its written contour.
  // Choosing an octave independently at each sung note can turn a three-note
  // arpeggio into disjoint jumps of nearly two octaves.
  const score = (shift: number) => steps.reduce((sum, { pitch, event }) => sum +
    melodyPenalty(pitch + shift, melody, event.offsetBeats, event.offsetBeats + event.durationBeats), 0) +
    Math.abs(shift) * .18 * steps.length;
  return candidates.sort((left, right) => score(left) - score(right))[0] ?? 0;
}

function hasSpaceAt(onset: number, melody: readonly MelodySpan[]): boolean {
  const active = melody.find((note) => onset >= note.onset - .001 && onset < note.end - .001);
  return !active || (active.end - active.onset >= 1 && onset - active.onset >= .5);
}

function spaceEndAt(onset: number, melody: readonly MelodySpan[], end: number): number {
  const active = melody.find((note) => onset >= note.onset - .001 && onset < note.end - .001);
  return Math.min(end, active?.end ?? melody.find((note) => note.onset > onset)?.onset ?? end);
}

function responsivePattern(
  pattern: readonly AccompanimentEvent[], melody: readonly MelodySpan[], beats: number, chordBeats: number,
  profile: AccompanimentInstrumentProfile, options: PerformanceOptions
): readonly AccompanimentEvent[] {
  const comping = options.styleId === "comping" &&
    ["keys", "guitar", "support"].includes(profile.part.id);
  if (!comping || melody.length === 0 || options.ending) return pattern;
  // The complementary part already has sparse weak-beat entrances. Replacing
  // it with the primary player's fallback would collapse both onto one attack.
  if (ensembleRoleForInstrument(options.ensemble, options.instrumentId)?.role === "pulse") return pattern;
  const result: AccompanimentEvent[] = [];
  for (let start = 0; start < beats - .001; start += chordBeats) {
    const end = Math.min(beats, start + chordBeats);
    const sources = pattern.filter((event) => event.offsetBeats >= start && event.offsetBeats < end);
    const available = sources.filter((event) => hasSpaceAt(event.offsetBeats, melody));
    if (available.length > 0) {
      result.push(...available.map((event) => ({ ...event,
        durationBeats: Math.min(event.durationBeats, spaceEndAt(event.offsetBeats, melody, end) - event.offsetBeats)
      })));
      continue;
    }
    const gaps = [start, ...melody.flatMap((note) => [note.end, note.onset + .5])]
      .filter((onset) => onset >= start && onset < end - .12 && hasSpaceAt(onset, melody));
    if (gaps.length > 0 && sources.length > 0) {
      const source = sources[sources.length - 1];
      const onset = gaps.sort((left, right) => Math.abs(left - source.offsetBeats) -
        Math.abs(right - source.offsetBeats))[0];
      result.push({ ...source, offsetBeats: onset,
        durationBeats: Math.min(source.durationBeats, spaceEndAt(onset, melody, end) - onset)
      });
      continue;
    }
    const duration = Math.min(.65, (end - start) * .55);
    const onset = start + Math.min(.5, (end - start) * .25);
    result.push({ offsetBeats: onset, durationBeats: Math.min(duration, end - onset),
      voice: "chord", velocity: .78 });
  }
  return result.sort((left, right) => left.offsetBeats - right.offsetBeats);
}

function articulation(profile: AccompanimentInstrumentProfile, event: AccompanimentEvent): number {
  if (event.sustain || profile.part.id === "strings") return .985;
  if (profile.part.id === "winds") return .91;
  if (profile.part.id === "bass") return .86;
  if (profile.part.id === "guitar" || profile.part.id === "percussion") return .76;
  return event.voice === "chord" ? .83 : .9;
}

function beatAccent(beat: number, meter?: Meter): number {
  if (meter?.beats === 6 && meter.beatUnit === 8) {
    const pulse = Math.round(beat / 1.5) * 1.5;
    if (Math.abs(beat - pulse) > .08) return .92;
    return pulse === 0 ? 1.1 : 1.02;
  }
  if (Math.abs(beat - Math.round(beat)) > .08) return .93;
  return beat === 0 ? 1.1 : meter?.beats === 4 && beat === 2 ? 1.02 : .96;
}

function roleVelocity(profile: AccompanimentInstrumentProfile): number {
  const part = profile.part.id;
  return part === "bass" ? .72 : part === "keys" ? .68 : part === "guitar" ? .7
    : part === "strings" ? .65 : part === "winds" ? .66 : .64;
}

function eventFragments(
  event: AccompanimentEvent, chordBeats: number, chordCount: number, sustained: boolean
): readonly AccompanimentEvent[] {
  const result: AccompanimentEvent[] = [];
  let onset = event.offsetBeats;
  const end = Math.min(chordCount * chordBeats, onset + event.durationBeats);
  while (onset < end - .001) {
    const nextBoundary = (Math.floor((onset + .0001) / chordBeats) + 1) * chordBeats;
    const fragmentEnd = Math.min(end, nextBoundary);
    result.push({ ...event, offsetBeats: onset, durationBeats: fragmentEnd - onset });
    if (!sustained) break;
    onset = fragmentEnd;
  }
  return result;
}

/** Shared deterministic score for live playback, recording and offline export. */
export function planAccompanimentLayer(options: PerformanceOptions): readonly AccompanimentPerformanceNote[] {
  const beats = options.notes.reduce((sum, note) => sum + toNumber(note.duration), 0);
  if (beats <= 0 || options.secondsPerBeat <= 0) return [];
  const assignment = ensembleRoleForInstrument(options.ensemble, options.instrumentId);
  const baseProfile = accompanimentInstrumentProfile(options.instrumentId, options.layerIndex);
  const profile: AccompanimentInstrumentProfile = assignment ? { ...baseProfile,
    range: [baseProfile.range[0], baseProfile.range[1], assignment.registerCenter] } : baseProfile;
  const symbols = options.chords?.length ? options.chords : [""];
  const chordBeats = beats / symbols.length;
  const melody = (options.section ?? "song") === "song" ? melodySpans(options.notes) : [];
  const sourcePattern = createArrangedAccompanimentPattern(options.styleId, beats, options.instrumentId,
    options.layerIndex, options.meter, {
      measureIndex: options.measureIndex,
      transitionFill: options.transitionFill,
      ending: options.ending
    });
  const stateKey = `${options.instrumentId}:chord`;
  let previous = options.state?.voicings.get(stateKey) ?? [];
  const melodic = profile.part.id === "winds" || (profile.part.id === "strings" && !profile.polyphonic &&
    assignment?.role !== "bass");
  type PerformanceEvent = AccompanimentEvent & { explicitPitch?: number };
  const phrase = melodic ? createAccompanimentPhrase({
    instrumentId: options.instrumentId, profile, styleId: options.styleId, notes: options.notes,
    chords: symbols, fallbackPitches: options.fallbackPitches, context: options.ensemble,
    measureIndex: options.measureIndex ?? 0, section: options.section ?? "song", ending: !!options.ending,
    previousPitch: previous[0], peerNotes: options.peerNotes, secondsPerBeat: options.secondsPerBeat
  }) : undefined;
  const pattern: readonly PerformanceEvent[] = phrase
    ? phrase.map((note) => ({ ...note, voice: "step", explicitPitch: note.pitch, sustain: true }))
    : responsivePattern(coordinateAccompanimentTexture(sourcePattern, options.ensemble,
      options.instrumentId, profile, beats, options.meter, options.ending), melody, beats, chordBeats, profile, options);
  const lineShift = melodic ? 0 : lineOctaveShift(pattern, symbols, chordBeats, profile, options, melody);
  const result: AccompanimentPerformanceNote[] = [];
  pattern.forEach((sourceEvent, eventIndex) => {
    const fragments = eventFragments(sourceEvent, chordBeats, symbols.length,
      !!sourceEvent.sustain || profile.part.id === "strings");
    fragments.forEach((event) => {
      const onset = event.offsetBeats;
      const chordIndex = Math.min(symbols.length - 1, Math.floor((onset + .0001) / chordBeats));
      const material = materialForChord(symbols[chordIndex], options.fallbackPitches);
      const end = onset + event.durationBeats;
      const explicitPitch = sourceEvent.explicitPitch;
      const rawPitches = explicitPitch !== undefined ? [explicitPitch] : eventPitches(event, material, profile, options, previous)
        .map((pitch) => pitch + (event.voice === "step" ? lineShift : 0));
      const pitches = explicitPitch !== undefined ? rawPitches : melodyAwareVoicing(rawPitches,
        melody, onset, end, profile, event.voice === "step", material.tones);
      if (pitches.length === 0) return;
      if (event.voice === "chord" || explicitPitch !== undefined) {
        previous = pitches;
        options.state?.voicings.set(stateKey, pitches);
      }
      const strum = profile.part.id === "guitar" && event.voice === "chord";
      const ordered = event.strum === "up" ? [...pitches].reverse() : pitches;
      const durationSeconds = event.durationBeats * options.secondsPerBeat;
      const seed = (options.measureIndex ?? 0) * 11 + options.layerIndex * 7 + eventIndex * 3;
      const nudge = profile.part.id === "bass" ? 0 :
        [-.5, .2, -.15, .45, -.3, .1, .3, -.1][seed % 8] * Math.min(.01, options.secondsPerBeat * .016);
      const chordEndSeconds = Math.min(beats, (chordIndex + 1) * chordBeats) * options.secondsPerBeat;
      const melodyOverlap = melody.some((note) => note.onset < end && note.end > onset);
      const duck = melodyOverlap && profile.part.id !== "bass" ? .94 : 1;
      const sectionGain = options.section === "intro" ? .97 : options.section === "outro" ? .95 : 1;
      const density = pitches.length > 1 ? 1 - Math.min(3, pitches.length - 1) * .03 : 1;
      ordered.forEach((pitch, voiceIndex) => {
        const stagger = strum ? voiceIndex * Math.min(.014, durationSeconds / (pitches.length * 5)) : 0;
        const offsetSeconds = Math.max(onset * options.secondsPerBeat, onset * options.secondsPerBeat + nudge + stagger);
        const performedDuration = Math.min(durationSeconds * articulation(profile, event) - stagger,
          chordEndSeconds - offsetSeconds);
        if (performedDuration < .015) return;
        result.push({
          pitch,
          offsetSeconds,
          durationSeconds: performedDuration,
          // MIDI velocity expresses touch. Instrument calibration and user
          // volume belong on the channel gain, not in repeated velocity cuts.
          velocity: roleVelocity(profile) * sectionGain * density * duck *
            beatAccent(onset, options.meter) * (event.velocity ?? 1) * (strum ? 1 - voiceIndex * .035 : 1)
        });
      });
    });
  });
  return result.sort((left, right) => left.offsetSeconds - right.offsetSeconds);
}

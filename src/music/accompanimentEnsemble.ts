import { accompanimentInstrumentProfile, type AccompanimentInstrumentPart } from "./accompaniment";
import type { InstrumentId } from "./instruments";
import { toNumber } from "./rational";
import type { NoteEvent } from "./types";

export type EnsembleRole = "bass" | "harmony" | "pulse" | "pad" | "counterline" | "answer" | "ornament";
export type EnsembleSection = "intro" | "song" | "outro";

export type EnsembleMeasure = Readonly<{
  notes: readonly NoteEvent[];
  chords?: readonly string[];
  measureIndex?: number;
  isSongEnding?: boolean;
}>;

export type EnsembleInstrumentAssignment = Readonly<{
  instrumentId: InstrumentId;
  role: EnsembleRole;
  family: AccompanimentInstrumentPart["id"];
  familyIndex: number;
  familyCount: number;
  registerCenter: number;
  rhythmicOffsetBeats: number;
  responsePhase: number;
}>;

export type EnsembleMotifNote = Readonly<{
  offsetBeats: number;
  durationBeats: number;
  pitch: number;
  interval: number;
}>;

export type EnsembleMelodyAnalysis = Readonly<{
  beats: number;
  activeFraction: number;
  onsetDensity: number;
  medianPitch: number;
  minPitch: number;
  maxPitch: number;
  onsets: readonly number[];
  gaps: readonly Readonly<{ onset: number; end: number }>[];
  contour: readonly number[];
}>;

export type AccompanimentEnsembleContext = Readonly<{
  instrumentIds: readonly InstrumentId[];
  roles: readonly EnsembleInstrumentAssignment[];
  measureIndex: number;
  scorePosition: number;
  section: EnsembleSection;
  current: EnsembleMeasure;
  previous?: EnsembleMeasure;
  next?: EnsembleMeasure;
  phraseIndex: number;
  phrasePosition: number;
  phraseLength: number;
  phraseEnding: boolean;
  melody: EnsembleMelodyAnalysis;
  motif: readonly EnsembleMotifNote[];
}>;

export type AccompanimentEnsembleScore = Readonly<{
  instrumentIds: readonly InstrumentId[];
  roles: readonly EnsembleInstrumentAssignment[];
  measures: readonly AccompanimentEnsembleContext[];
}>;

function soundingNotes(notes: readonly NoteEvent[]): EnsembleMotifNote[] {
  const result: EnsembleMotifNote[] = [];
  let cursor = 0;
  notes.forEach((note, index) => {
    const duration = Math.max(0, toNumber(note.duration));
    if (note.pitch !== null && duration > 0) {
      const previous = result.at(-1);
      if (previous && notes[index - 1]?.linkToNext && previous.pitch === note.pitch) {
        result[result.length - 1] = { ...previous, durationBeats: previous.durationBeats + duration };
      } else {
        result.push({ offsetBeats: cursor, durationBeats: duration, pitch: note.pitch,
          interval: previous ? note.pitch - previous.pitch : 0 });
      }
    }
    cursor += duration;
  });
  return result;
}

export function analyzeEnsembleMelody(notes: readonly NoteEvent[]): EnsembleMelodyAnalysis {
  const beats = notes.reduce((total, note) => total + Math.max(0, toNumber(note.duration)), 0);
  const sounding = soundingNotes(notes);
  const pitches = sounding.map((note) => note.pitch).sort((left, right) => left - right);
  const gaps: Array<{ onset: number; end: number }> = [];
  let cursor = 0;
  for (const note of sounding) {
    if (note.offsetBeats > cursor) gaps.push({ onset: cursor, end: note.offsetBeats });
    cursor = note.offsetBeats + note.durationBeats;
  }
  if (cursor < beats) gaps.push({ onset: cursor, end: beats });
  return {
    beats,
    activeFraction: beats > 0 ? sounding.reduce((total, note) => total + note.durationBeats, 0) / beats : 0,
    onsetDensity: beats > 0 ? sounding.length / beats : 0,
    medianPitch: pitches.length > 0 ? pitches[Math.floor(pitches.length / 2)] : 67,
    minPitch: pitches[0] ?? 67,
    maxPitch: pitches.at(-1) ?? 67,
    onsets: sounding.map((note) => note.offsetBeats),
    gaps,
    contour: sounding.slice(1).map((note) => note.interval)
  };
}

/** Assign roles by instrument range and family, never by the order of selection. */
export function assignEnsembleRoles(instrumentIds: readonly InstrumentId[]): readonly EnsembleInstrumentAssignment[] {
  const profiles = [...new Set(instrumentIds)].map((instrumentId) => ({ instrumentId,
    profile: accompanimentInstrumentProfile(instrumentId, 0) }));
  const sorted = profiles.sort((left, right) => left.profile.range[2] - right.profile.range[2] ||
    left.instrumentId.localeCompare(right.instrumentId));
  const hasBass = sorted.some(({ profile }) => profile.part.id === "bass");
  const hasKeys = sorted.some(({ profile }) => profile.part.id === "keys");
  const hasPolyphonic = sorted.some(({ profile }) => profile.polyphonic && profile.part.id !== "strings");
  return sorted.map(({ instrumentId, profile }) => {
    const family = profile.part.id;
    const siblings = sorted.filter((item) => item.profile.part.id === family);
    const familyIndex = siblings.findIndex((item) => item.instrumentId === instrumentId);
    const familyCount = siblings.length;
    let role: EnsembleRole;
    if (family === "bass") role = familyIndex === 0 ? "bass" : "pulse";
    else if (family === "keys") role = familyIndex === 0 ? "harmony" : "pulse";
    else if (family === "guitar") role = !hasKeys && familyIndex === 0 ? "harmony" : "pulse";
    else if (family === "strings") {
      role = !hasBass && /cello/.test(instrumentId) ? "bass"
        : profile.polyphonic ? "pad" : hasPolyphonic ? "counterline" : "harmony";
    } else if (family === "winds") {
      role = familyCount === 1 ? "answer" : familyIndex === 0 ? "counterline"
        : familyIndex === familyCount - 1 ? "answer" : "pad";
    } else if (family === "percussion") {
      role = instrumentId === "timpani" ? "pulse" : "ornament";
    } else role = "pad";
    const registerShift = familyCount > 1 && familyIndex > 0 && (family === "keys" || family === "bass") ? 7 : 0;
    return {
      instrumentId, role, family, familyIndex, familyCount,
      registerCenter: Math.min(profile.range[1], profile.range[2] + registerShift),
      rhythmicOffsetBeats: familyIndex % 2 === 1 ? .5 : 0,
      responsePhase: familyIndex % 2
    };
  });
}

export function ensembleRoleForInstrument(
  context: AccompanimentEnsembleContext | undefined,
  instrumentId: InstrumentId
): EnsembleInstrumentAssignment | undefined {
  return context?.roles.find((assignment) => assignment.instrumentId === instrumentId);
}

export function analyzeAccompanimentEnsemble(
  measures: readonly EnsembleMeasure[],
  instrumentIds: readonly InstrumentId[],
  section: EnsembleSection = "song"
): AccompanimentEnsembleScore {
  const roles = assignEnsembleRoles(instrumentIds);
  const ids = roles.map((assignment) => assignment.instrumentId);
  const sectionMeasures = section === "song" ? measures : measures.map((measure) => ({ ...measure,
    notes: measure.notes.map((note) => ({ ...note, pitch: null })) }));
  const contexts = sectionMeasures.map((current, scorePosition): AccompanimentEnsembleContext => {
    const measureIndex = current.measureIndex ?? scorePosition;
    const phrasePosition = measureIndex % 4;
    const phraseStart = Math.max(0, scorePosition - phrasePosition);
    const phraseMeasures = sectionMeasures.slice(phraseStart, phraseStart + 4);
    const motifSource = phraseMeasures.find((measure) => measure.notes.some((note) => note.pitch !== null));
    const motif = section === "song" && motifSource ? soundingNotes(motifSource.notes).slice(0, 6) : [];
    return {
      instrumentIds: ids, roles, measureIndex, scorePosition, section, current,
      previous: sectionMeasures[scorePosition - 1], next: sectionMeasures[scorePosition + 1],
      phraseIndex: Math.floor(measureIndex / 4), phrasePosition,
      phraseLength: Math.min(4, phrasePosition + measures.length - scorePosition),
      phraseEnding: phrasePosition === 3 || current.isSongEnding === true || scorePosition === measures.length - 1,
      melody: analyzeEnsembleMelody(current.notes),
      motif
    };
  });
  return { instrumentIds: ids, roles, measures: contexts };
}

export function ensembleContextForMeasure(
  score: AccompanimentEnsembleScore | undefined,
  measureIndex: number
): AccompanimentEnsembleContext | undefined {
  return score?.measures.find((context) => context.measureIndex === measureIndex);
}

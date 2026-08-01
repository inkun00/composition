import { chordPitchClasses } from "./chord";
import { toNumber } from "./rational";
import type { NoteEvent } from "./types";

export type ImportedKeyMode = "major" | "minor";

export type ImportedHarmonyMeasure = Readonly<{
  notes: readonly NoteEvent[];
  chords?: readonly string[];
}>;

export type ImportedHarmonyResult = Readonly<{
  chordsByMeasure: readonly (readonly string[])[];
  tonicChord: string;
  tonicPitchClass: number;
  mode: ImportedKeyMode;
}>;

const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];

function mod12(value: number): number {
  return ((value % 12) + 12) % 12;
}

function pitchHistogram(measures: readonly ImportedHarmonyMeasure[]): number[] {
  const histogram = Array(12).fill(0) as number[];
  measures.forEach((measure) => {
    measure.notes.forEach((note) => {
      if (note.pitch === null) return;
      histogram[mod12(note.pitch)] += Math.max(.125, toNumber(note.duration));
    });
  });
  return histogram;
}

function profileScore(histogram: readonly number[], tonic: number, profile: readonly number[]): number {
  return histogram.reduce((score, weight, pitchClass) =>
    score + weight * profile[mod12(pitchClass - tonic)], 0);
}

function keyFromSignature(
  histogram: readonly number[],
  fifths: number,
  requestedMode?: ImportedKeyMode
): { tonic: number; mode: ImportedKeyMode } {
  const majorTonic = mod12(fifths * 7);
  const minorTonic = mod12(majorTonic + 9);
  if (requestedMode === "minor") return { tonic: minorTonic, mode: "minor" };
  if (requestedMode === "major") return { tonic: majorTonic, mode: "major" };
  const majorScore = profileScore(histogram, majorTonic, MAJOR_PROFILE);
  const minorScore = profileScore(histogram, minorTonic, MINOR_PROFILE);
  return minorScore > majorScore * 1.04
    ? { tonic: minorTonic, mode: "minor" }
    : { tonic: majorTonic, mode: "major" };
}

function inferKey(
  measures: readonly ImportedHarmonyMeasure[],
  fifths?: number,
  requestedMode?: ImportedKeyMode
): { tonic: number; mode: ImportedKeyMode } {
  const histogram = pitchHistogram(measures);
  if (Number.isInteger(fifths)) return keyFromSignature(histogram, fifths as number, requestedMode);

  let best = { tonic: 0, mode: "major" as ImportedKeyMode, score: Number.NEGATIVE_INFINITY };
  for (let tonic = 0; tonic < 12; tonic += 1) {
    const modes: readonly ImportedKeyMode[] = requestedMode ? [requestedMode] : ["major", "minor"];
    modes.forEach((mode) => {
      const score = profileScore(histogram, tonic, mode === "major" ? MAJOR_PROFILE : MINOR_PROFILE);
      if (score > best.score) best = { tonic, mode, score };
    });
  }
  return best;
}

type ChordCandidate = Readonly<{ symbol: string; root: number; tones: readonly number[] }>;

function chordCandidates(tonic: number, mode: ImportedKeyMode, preferFlats: boolean): ChordCandidate[] {
  const names = preferFlats ? FLAT_NAMES : SHARP_NAMES;
  const degrees = mode === "major"
    ? [[0, ""], [2, "m"], [4, "m"], [5, ""], [7, ""], [9, "m"], [11, "dim"]] as const
    : [[0, "m"], [2, "dim"], [3, ""], [5, "m"], [7, ""], [8, ""], [10, ""]] as const;
  return degrees.map(([offset, quality]) => {
    const root = mod12(tonic + offset);
    const symbol = `${names[root]}${quality}`;
    return { symbol, root, tones: chordPitchClasses(symbol) };
  });
}

function noteFitScore(
  measure: ImportedHarmonyMeasure,
  chord: ChordCandidate,
  tonic: number,
  mode: ImportedKeyMode
): number {
  const scale = (mode === "major" ? MAJOR_SCALE : MINOR_SCALE).map((offset) => mod12(tonic + offset));
  let onset = 0;
  let score = 0;
  let pitchedDuration = 0;
  measure.notes.forEach((note) => {
    const duration = Math.max(.125, toNumber(note.duration));
    if (note.pitch !== null) {
      const pitchClass = mod12(note.pitch);
      const accent = onset < .001 ? 1.45 : Number.isInteger(onset) ? 1.15 : 1;
      const fit = chord.tones.includes(pitchClass) ? 2.4 : scale.includes(pitchClass) ? -.55 : -1.5;
      score += duration * accent * fit;
      if (onset < .001 && pitchClass === chord.root) score += .75;
      pitchedDuration += duration;
    }
    onset += duration;
  });
  if (pitchedDuration === 0) return chord.root === tonic ? .25 : 0;
  if (chord.symbol.includes("dim")) score -= .2;
  return score / pitchedDuration;
}

function transitionScore(previous: ChordCandidate, current: ChordCandidate, tonic: number): number {
  if (previous.root === current.root) return .08;
  const movement = mod12(current.root - previous.root);
  let score = movement === 5 || movement === 7 ? .28 : -.08;
  if (previous.root === mod12(tonic + 7) && current.root === tonic) score += .85;
  return score;
}

function inferMeasureChords(
  measures: readonly ImportedHarmonyMeasure[],
  candidates: readonly ChordCandidate[],
  tonic: number,
  mode: ImportedKeyMode
): string[] {
  if (measures.length === 0) return [];
  const scores = measures.map((measure, measureIndex) => candidates.map((candidate) => {
    let score = noteFitScore(measure, candidate, tonic, mode);
    if (measureIndex === 0 && candidate.root === tonic) score += .45;
    if (measureIndex === measures.length - 1 && candidate.root === tonic) score += 1.15;
    return score;
  }));
  const paths: number[][][] = [];
  let totals = scores[0].map((score) => score);
  paths[0] = candidates.map((_, index) => [index]);
  for (let measureIndex = 1; measureIndex < measures.length; measureIndex += 1) {
    const nextTotals = Array(candidates.length).fill(Number.NEGATIVE_INFINITY) as number[];
    const nextPaths: number[][] = candidates.map(() => []);
    candidates.forEach((candidate, candidateIndex) => {
      candidates.forEach((previous, previousIndex) => {
        const total = totals[previousIndex] + scores[measureIndex][candidateIndex] +
          transitionScore(previous, candidate, tonic);
        if (total > nextTotals[candidateIndex]) {
          nextTotals[candidateIndex] = total;
          nextPaths[candidateIndex] = [...paths[measureIndex - 1][previousIndex], candidateIndex];
        }
      });
    });
    totals = nextTotals;
    paths[measureIndex] = nextPaths;
  }
  const bestIndex = totals.reduce((best, score, index) => score > totals[best] ? index : best, 0);
  return paths[measures.length - 1][bestIndex].map((candidateIndex) => candidates[candidateIndex].symbol);
}

export function inferImportedHarmony(
  measures: readonly ImportedHarmonyMeasure[],
  options: Readonly<{ fifths?: number; mode?: ImportedKeyMode }> = {}
): ImportedHarmonyResult {
  const key = inferKey(measures, options.fifths, options.mode);
  const preferFlats = (options.fifths ?? 0) < 0;
  const candidates = chordCandidates(key.tonic, key.mode, preferFlats);
  const inferred = inferMeasureChords(measures, candidates, key.tonic, key.mode);
  const tonicChord = candidates.find((candidate) => candidate.root === key.tonic)?.symbol ?? "C";
  return {
    chordsByMeasure: measures.map((measure, index) =>
      measure.chords && measure.chords.length > 0 ? measure.chords : [inferred[index] ?? tonicChord]),
    tonicChord,
    tonicPitchClass: key.tonic,
    mode: key.mode
  };
}

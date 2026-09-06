import type { AccompanimentStyleId } from "./accompaniment";
import { toNumber } from "./rational";
import type { MelodyCandidate } from "./types";

export type RhythmPreferenceId = "short" | "medium" | "long";

export const RHYTHM_PREFERENCE_LABELS: Readonly<Record<RhythmPreferenceId, string>> = {
  short: "짧게 통통",
  medium: "고르게 또박",
  long: "길게 여유롭게"
};

const SHORT_STYLES: readonly AccompanimentStyleId[] = [
  "arpeggio", "riff", "bossa", "shuffle", "kpop", "anime_rock", "children_song", "animation_ost", "musical"
];
const MEDIUM_STYLES: readonly AccompanimentStyleId[] = ["strum", "folk", "comping"];

export function rhythmPreferenceForStyle(styleId: AccompanimentStyleId): RhythmPreferenceId {
  if (SHORT_STYLES.some((candidate) => candidate === styleId)) return "short";
  if (MEDIUM_STYLES.some((candidate) => candidate === styleId)) return "medium";
  return "long";
}

function averageDuration(candidate: MelodyCandidate): number {
  const durations = candidate.notes.map((note) => toNumber(note.duration));
  return durations.reduce((total, duration) => total + duration, 0) / Math.max(1, durations.length);
}

function durationCharacterScore(candidate: MelodyCandidate, preference: RhythmPreferenceId): number {
  const durations = candidate.notes.map((note) => toNumber(note.duration));
  const average = averageDuration(candidate);
  const shortRatio = durations.filter((duration) => duration <= .5).length / Math.max(1, durations.length);
  const longRatio = durations.filter((duration) => duration >= 1.5).length / Math.max(1, durations.length);

  if (preference === "short") {
    return shortRatio * 6 - longRatio * 2 - average;
  }
  if (preference === "long") {
    return longRatio * 6 - shortRatio * 2 + average;
  }
  const oneBeatRatio = durations.filter((duration) => duration >= .75 && duration <= 1.25).length /
    Math.max(1, durations.length);
  return oneBeatRatio * 6 - Math.abs(average - 1.0) * 2;
}

export function prioritizeCandidatesForRhythm(
  harmonyRankedCandidates: readonly MelodyCandidate[],
  styleId: AccompanimentStyleId
): readonly MelodyCandidate[] {
  const preference = rhythmPreferenceForStyle(styleId);
  return harmonyRankedCandidates
    .map((candidate, harmonyRank) => ({
      candidate,
      harmonyRank,
      score: durationCharacterScore(candidate, preference)
    }))
    .sort((left, right) => right.score - left.score || left.harmonyRank - right.harmonyRank)
    .map((item) => item.candidate);
}

export function candidateAverageDuration(candidate: MelodyCandidate): number {
  return averageDuration(candidate);
}

import { chordPitchClasses } from "./chord";
import { toNumber } from "./rational";
import type { MelodyCandidate, NoteEvent } from "./types";

function mod12(value: number): number {
  return ((value % 12) + 12) % 12;
}

function pitchedNotes(notes: readonly NoteEvent[]): readonly NoteEvent[] {
  return notes.filter((note) => note.pitch !== null);
}

function lastPitch(candidate: MelodyCandidate): number | null {
  const notes = pitchedNotes(candidate.notes);
  return notes.at(-1)?.pitch ?? null;
}

function scoreCandidate(
  candidate: MelodyCandidate,
  chords: readonly string[],
  previousPitch: number | null,
  measureIndex: number,
  measureCount: number,
  candidateIndex: number,
  previousCandidateIndex: number,
  usedCandidateIndexes: ReadonlySet<number>
): number {
  const totalDuration = candidate.notes.reduce((sum, note) => sum + toNumber(note.duration), 0);
  const chordDuration = chords.length > 0 ? totalDuration / chords.length : totalDuration;
  const usedByChord = chords.map(() => new Set<number>());
  let onset = 0;
  let score = 0;
  let priorMelodyPitch: number | null = null;
  let firstPitch: number | null = null;
  let finalPitch: number | null = null;

  for (const note of candidate.notes) {
    const chordIndex = Math.min(Math.floor(onset / chordDuration), Math.max(chords.length - 1, 0));
    if (note.pitch === null) {
      score -= 0.25;
      onset += toNumber(note.duration);
      continue;
    }

    firstPitch ??= note.pitch;
    finalPitch = note.pitch;
    const pitchClass = mod12(note.pitch);
    usedByChord[chordIndex]?.add(pitchClass);

    const chordTones = chordPitchClasses(chords[chordIndex] ?? "C");
    const toneIndex = chordTones.indexOf(pitchClass);
    if (toneIndex > 0) score += 1.8;
    else if (toneIndex === 0) score += 0.45;

    if (priorMelodyPitch !== null) {
      const interval = Math.abs(note.pitch - priorMelodyPitch);
      if (interval === 0) score -= 0.8;
      else if (interval <= 5) score += 1.1;
      else if (interval <= 7) score += 0.35;
      else score -= 0.6;
    }
    priorMelodyPitch = note.pitch;
    onset += toNumber(note.duration);
  }

  chords.forEach((chord, chordIndex) => {
    const chordTones = chordPitchClasses(chord);
    const used = usedByChord[chordIndex];
    if (!used || used.size === 0) {
      score -= 5;
      return;
    }

    // The notes after the root carry the major/minor, suspended and seventh colour.
    const colourTones = chordTones.slice(1);
    score += colourTones.filter((tone) => used.has(tone)).length * 3.2;
    score += Math.min(used.size, chordTones.length) * 0.8;
  });

  if (previousPitch !== null && firstPitch !== null) {
    const connection = Math.abs(firstPitch - previousPitch);
    if (connection === 0) score -= 0.7;
    else if (connection <= 4) score += 2.2;
    else if (connection <= 7) score += 0.7;
    else score -= 1.4;
  }

  if (measureIndex === 0 && firstPitch !== null && chords.length > 0) {
    const openingRoot = chordPitchClasses(chords[0])[0];
    if (mod12(firstPitch) === openingRoot) score += 2.5;
  }

  if (measureIndex > 0 && measureIndex < measureCount - 1 && finalPitch !== null) {
    // Middle measures can move the story forward a little more than the
    // opening and ending measures, without losing the chord fit above.
    score += Math.min(1.2, Math.abs(finalPitch - (previousPitch ?? finalPitch)) * .08);
  }

  if (measureIndex === measureCount - 1 && finalPitch !== null && chords.length > 0) {
    const finalRoot = chordPitchClasses(chords.at(-1) ?? "C")[0];
    if (mod12(finalPitch) === finalRoot) score += 4;
  }

  // A small deterministic rotation prevents identical contours from winning every bar.
  score += ((candidateIndex * 7 + measureIndex * 5) % 11) * 0.035;
  // Keep the harmony fit first, but do not let one high-scoring contour take over
  // every recurrence of the same chord. Candidate indexes also identify the
  // rhythm/shape family produced by getCandidates.
  if (candidateIndex === previousCandidateIndex) score -= 9;
  else if (usedCandidateIndexes.has(candidateIndex)) score -= 6;
  return score;
}

export function chooseRecommendedCandidate(
  candidates: readonly MelodyCandidate[],
  chords: readonly string[],
  previousPitch: number | null,
  measureIndex: number,
  measureCount: number,
  previousCandidateIndex = -1,
  usedCandidateIndexes: ReadonlySet<number> = new Set()
): MelodyCandidate {
  if (candidates.length === 0) throw new Error("추천할 가락이 없습니다.");

  let best = candidates[0];
  let bestScore = Number.NEGATIVE_INFINITY;
  candidates.forEach((candidate, index) => {
    const candidateScore = scoreCandidate(
      candidate,
      chords,
      previousPitch,
      measureIndex,
      measureCount,
      index,
      previousCandidateIndex,
      usedCandidateIndexes
    );
    if (candidateScore > bestScore) {
      best = candidate;
      bestScore = candidateScore;
    }
  });
  return best;
}

export function rankRecommendedCandidates(
  candidates: readonly MelodyCandidate[],
  chords: readonly string[],
  previousPitch: number | null,
  measureIndex: number,
  measureCount: number,
  previousCandidateIndex = -1,
  usedCandidateIndexes: ReadonlySet<number> = new Set()
): readonly MelodyCandidate[] {
  return candidates.map((candidate, index) => ({
    candidate,
    score: scoreCandidate(candidate, chords, previousPitch, measureIndex, measureCount, index, previousCandidateIndex, usedCandidateIndexes)
  })).sort((left, right) => right.score - left.score).map((item) => item.candidate);
}

export function recommendedEndingPitch(candidate: MelodyCandidate): number | null {
  return lastPitch(candidate);
}

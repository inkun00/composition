import { chordPitchClasses } from "./chord";
import { toNumber } from "./rational";
import type { MelodyCandidate, NoteEvent } from "./types";

type MelodyShape = Readonly<{
  pitches: readonly number[];
  meanPitch: number;
  attacks: readonly number[];
  intervals: readonly number[];
  leadingRest: number;
  trailingRest: number;
}>;

function describeMelody(notes: readonly NoteEvent[]): MelodyShape | null {
  const total = notes.reduce((sum, note) => sum + toNumber(note.duration), 0);
  if (total <= 0) return null;
  const pitches: number[] = [];
  const attacks: number[] = [];
  let weightedPitch = 0;
  let pitchedDuration = 0;
  let onset = 0;
  let leadingRest = 0;
  let lastSoundEnd = 0;

  for (const note of notes) {
    const duration = toNumber(note.duration);
    if (note.pitch !== null) {
      if (pitches.length === 0) leadingRest = onset / total;
      pitches.push(note.pitch);
      attacks.push(onset / total);
      weightedPitch += note.pitch * duration;
      pitchedDuration += duration;
      lastSoundEnd = onset + duration;
    }
    onset += duration;
  }
  if (pitches.length === 0 || pitchedDuration <= 0) return null;
  return {
    pitches,
    meanPitch: weightedPitch / pitchedDuration,
    attacks,
    intervals: pitches.slice(1).map((pitch, index) => pitch - pitches[index]),
    leadingRest,
    trailingRest: (total - lastSoundEnd) / total
  };
}

function connectionScore(distance: number): number {
  if (distance === 0) return 3.5;
  if (distance <= 2) return 5;
  if (distance <= 4) return 3.5;
  if (distance <= 5) return 2.2;
  if (distance <= 7) return .5;
  if (distance <= 12) return -3 - (distance - 7) * .65;
  return -6.25 - (distance - 12) * .9;
}

function rhythmicAffinity(previous: MelodyShape, next: MelodyShape): number {
  // Compare attacks at the same place in each bar, including a sung pickup
  // after a rest. The denominator prevents a busy melody matching everything.
  const sharedAttacks = previous.attacks.filter((attack) =>
    next.attacks.some((nextAttack) => Math.abs(attack - nextAttack) < .025)).length;
  return 2 * sharedAttacks / (previous.attacks.length + next.attacks.length);
}

function contourAffinity(previous: MelodyShape, next: MelodyShape): number {
  if (previous.intervals.length === 0 || next.intervals.length === 0) return 0;
  const motion = (interval: number) => Math.sign(interval) * (Math.abs(interval) >= 5 ? 2 : 1);
  let similarity = 0;
  // Sampling the phrase contour lets a four-note and an eight-note response
  // retain a related shape without requiring identical note counts or IDs.
  for (let index = 0; index < 4; index += 1) {
    const prior = previous.intervals[Math.floor(index * previous.intervals.length / 4)];
    const following = next.intervals[Math.floor(index * next.intervals.length / 4)];
    similarity += 1 - Math.abs(motion(prior) - motion(following)) / 4;
  }
  return similarity / 4;
}

function sustainedDissonance(candidate: MelodyCandidate, chords: readonly string[]): number {
  if (chords.length === 0) return 0;
  const total = candidate.notes.reduce((sum, note) => sum + toNumber(note.duration), 0);
  if (total <= 0) return 0;
  const chordDuration = total / chords.length;
  let onset = 0;
  let dissonance = 0;
  candidate.notes.forEach((note, index) => {
    const duration = toNumber(note.duration);
    const end = onset + duration;
    if (note.pitch !== null) {
      const pitchClass = ((note.pitch % 12) + 12) % 12;
      const before = candidate.notes[index - 1]?.pitch;
      const after = candidate.notes[index + 1]?.pitch;
      const passing = duration <= .5 && before != null && after != null &&
        Math.abs(note.pitch - before) <= 2 && Math.abs(after - note.pitch) <= 2;
      chords.forEach((chord, chordIndex) => {
        const overlap = Math.max(0, Math.min(end, (chordIndex + 1) * chordDuration) -
          Math.max(onset, chordIndex * chordDuration));
        if (!chordPitchClasses(chord).includes(pitchClass)) {
          dissonance += overlap * (passing ? .2 : 1);
        }
      });
    }
    onset = end;
  });
  return dissonance / total;
}

function continuationScore(previous: MelodyShape, next: MelodyShape): number {
  const lastPitch = previous.pitches.at(-1)!;
  const connection = next.pitches[0] - lastPitch;
  const phraseBreak = previous.trailingRest >= .25 || next.leadingRest >= .25;
  let score = connectionScore(Math.abs(connection)) * (phraseBreak ? .6 : 1);
  score -= Math.min(12, Math.abs(next.meanPitch - previous.meanPitch)) * .35;
  score += rhythmicAffinity(previous, next) * 2.2;
  score += contourAffinity(previous, next) * 1.8;

  const lastInterval = previous.intervals.at(-1) ?? 0;
  if (Math.abs(lastInterval) >= 5 && !phraseBreak) {
    // A leap at the end is usually easier to sing when the next note settles
    // by a small step or turns back toward the centre of the phrase.
    if (Math.abs(connection) <= 2) score += 1.2;
    else if (Math.sign(connection) !== Math.sign(lastInterval) && Math.abs(connection) <= 5) score += .7;
    else if (Math.abs(connection) >= 5) score -= 1.5;
  }
  return score;
}

export function prioritizeMelodyContinuations(
  styleRankedCandidates: readonly MelodyCandidate[],
  previousNotes: readonly NoteEvent[],
  chords: readonly string[]
): readonly MelodyCandidate[] {
  const previous = describeMelody(previousNotes);
  if (!previous) return styleRankedCandidates;
  return styleRankedCandidates.map((candidate, rank) => {
    const next = describeMelody(candidate.notes);
    return {
      candidate,
      rank,
      // The previous harmony/style order remains a preference, but cannot
      // rotate an awkward octave jump ahead of a comfortable continuation.
      score: (next ? continuationScore(previous, next) : -20) - rank * .15 -
        sustainedDissonance(candidate, chords) * 12
    };
  }).sort((left, right) => right.score - left.score || left.rank - right.rank)
    .map(({ candidate }) => candidate);
}

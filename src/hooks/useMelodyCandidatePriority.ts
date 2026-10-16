import { useMemo } from "react";
import type { AccompanimentStyleId } from "../music/accompaniment";
import { prioritizeMelodyContinuations } from "../music/melodyContinuation";
import { candidatePatternIndex, rankRecommendedCandidates } from "../music/recommendation";
import { prioritizeCandidatesForRhythm } from "../music/rhythmPreference";
import type { HarmonyStory, MelodyCandidate, NoteEvent } from "../music/types";

type MelodyMeasure = Readonly<{
  story: HarmonyStory;
  chords: readonly string[];
  candidateId: string | null;
  notes: readonly NoteEvent[] | null;
}>;

export function useMelodyCandidatePriority(
  candidates: readonly MelodyCandidate[],
  measures: readonly MelodyMeasure[],
  activeIndex: number,
  styleId: AccompanimentStyleId
): readonly MelodyCandidate[] {
  return useMemo(() => {
    const activeMeasure = measures[activeIndex];
    const earlierMeasures = measures.slice(0, activeIndex);
    // Read the edited notes, never reconstruct the original catalogue melody.
    // A missing preceding bar is a phrase gap, not a link to an older bar.
    const previousNotes = measures[activeIndex - 1]?.notes ?? [];
    const previousPitch = [...previousNotes].reverse().find((note) => note.pitch !== null)?.pitch ?? null;
    const earlierIndexes = new Set(earlierMeasures.slice(-3)
      .map((measure) => candidatePatternIndex(measure.candidateId, activeMeasure.story))
      .filter((index) => index >= 0));
    const previousCandidateIndex = candidatePatternIndex(measures[activeIndex - 1]?.candidateId ?? null,
      activeMeasure.story);
    const harmonyRanked = rankRecommendedCandidates(candidates, activeMeasure.chords, previousPitch, activeIndex,
      measures.length, previousCandidateIndex, earlierIndexes);
    const styleRanked = prioritizeCandidatesForRhythm(harmonyRanked, styleId, activeIndex);
    return prioritizeMelodyContinuations(styleRanked, previousNotes, activeMeasure.chords);
  }, [activeIndex, candidates, measures, styleId]);
}

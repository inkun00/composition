import { isBeatInstrumentId } from "../music/beatInstruments";
import { findInstrument, isValidInstrumentId } from "../music/instruments";
import type { PracticeMeasure } from "./practiceModel";
import type { PracticeCreationMode } from "./practiceCreationMode";

export const MAX_PRACTICE_SCORES = 3;

export type PracticeRhythmLayer = {
  id: string;
  instrumentId: string;
  measures: PracticeMeasure[];
};

export type PracticeScore = PracticeRhythmLayer;

type ScoreSource = {
  mode?: PracticeCreationMode | null;
  rhythmInstrumentId: string;
  measures: PracticeMeasure[];
  rhythmLayers?: PracticeRhythmLayer[];
};

export function getPracticeScores(draft: ScoreSource): PracticeScore[] {
  return [
    { id: "primary", instrumentId: draft.rhythmInstrumentId, measures: draft.measures },
    ...(draft.mode === "melody" ? [] : draft.rhythmLayers ?? [])
  ];
}

export function normalizePracticeRhythmInstrument(id: unknown): string | null {
  if (typeof id !== "string") return null;
  if (id.startsWith("beat:")) {
    return isBeatInstrumentId(id.slice(5)) ? id : null;
  }
  return isValidInstrumentId(id) ? findInstrument(id).id : null;
}

export function hasPracticeScoreData(score: Pick<PracticeScore, "measures">): boolean {
  return score.measures.some((measure) => measure.notes.length > 0 || measure.lyric.trim().length > 0);
}

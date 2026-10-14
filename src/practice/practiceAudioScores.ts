import type { PracticeAudioInput, PracticeAudioMeasure } from "./practiceAudioTypes";

export type PracticeAudioScore = Readonly<{
  id: string;
  measures: readonly PracticeAudioMeasure[];
  instrumentId: string;
  rhythm: boolean;
}>;

/** Audio and video must resolve exactly the same instruments in the same order. */
export function practiceAudioScores(input: PracticeAudioInput): readonly PracticeAudioScore[] {
  const melody = input.mode === "melody" || (input.mode !== "rhythm" && input.step === "melody");
  const main: PracticeAudioScore = {
    id: "main",
    measures: input.measures,
    instrumentId: melody ? input.melodyInstrumentId : input.rhythmInstrumentId,
    rhythm: !melody
  };
  if (input.mode === "melody") return [main];
  const sharedRhythm: PracticeAudioScore[] = input.mode === "rhythm-melody" && melody ? [{
    id: "main-rhythm",
    // The entered rhythm remains the source; no second editable copy is stored.
    measures: input.measures,
    instrumentId: input.rhythmInstrumentId,
    rhythm: true
  }] : [];
  return [main, ...sharedRhythm, ...(input.rhythmLayers ?? []).map((layer) => ({ ...layer, rhythm: true }))];
}

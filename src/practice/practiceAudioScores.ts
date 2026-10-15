import type { PracticeAudioInput, PracticeAudioMeasure } from "./practiceAudioTypes";

export type PracticeAudioScore = Readonly<{
  id: string;
  measures: readonly PracticeAudioMeasure[];
  instrumentId: string;
  rhythm: boolean;
}>;

export function practicePlaysMelodyOnly(input: Pick<PracticeAudioInput, "mode" | "step">): boolean {
  return input.mode === "melody" || (input.mode === "rhythm-melody" && input.step === "melody");
}

/** Audio and video must resolve exactly the same instruments in the same order. */
export function practiceAudioScores(input: PracticeAudioInput): readonly PracticeAudioScore[] {
  const melody = input.mode === "melody" || (input.mode !== "rhythm" && input.step === "melody");
  const main: PracticeAudioScore = {
    id: "main",
    measures: input.measures,
    instrumentId: melody ? input.melodyInstrumentId : input.rhythmInstrumentId,
    rhythm: !melody
  };
  // Melody notes already contain the entered rhythm. Keep its other scores saved,
  // but do not double the attacks or mix rhythm instruments into melody playback.
  if (practicePlaysMelodyOnly(input)) return [main];
  return [main, ...(input.rhythmLayers ?? []).map((layer) => ({ ...layer, rhythm: true }))];
}

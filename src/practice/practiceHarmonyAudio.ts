import { chordMidiPitches } from "../music/chord";
import { renderPracticeAudioPlan, type PracticeAudioRenderOptions } from "./practiceAudio";
import type { PracticeAudioPlan } from "./practiceAudioTypes";
import { getAvailablePracticeChords } from "./practiceHarmony";

/** A brief listening aid only. These notes never enter the composition or exports. */
export function buildPracticeHarmonyPlan(chord: string, instrumentId: string): PracticeAudioPlan {
  if (!getAvailablePracticeChords().some((option) => option.value === chord)) {
    throw new Error("들을 화음을 다시 골라 주세요.");
  }
  const durationSeconds = 1.5;
  const tracks = chordMidiPitches(chord).map((pitch) => ({
    instrumentId,
    rhythm: false,
    timeline: {
      durationSeconds,
      events: [{ noteId: "", pitch, startSeconds: 0, endSeconds: durationSeconds, linkToNext: false }]
    }
  }));
  return { timeline: tracks[0].timeline, tracks };
}

export function renderPracticeHarmonyAudio(
  chord: string,
  instrumentId: string,
  options: PracticeAudioRenderOptions = {}
) {
  return renderPracticeAudioPlan(buildPracticeHarmonyPlan(chord, instrumentId), options);
}

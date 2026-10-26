import type { MusicVideoMeasureCue, MusicVideoScene } from "../video/musicVideoModel";
import { getSceneMeasureRanges } from "../video/musicVideoSceneRanges";
import { validateSceneActionRanges } from "../video/sceneActionPlan";

export type SceneActionRangeIssue = Readonly<{
  sceneIndex: number;
  message: string;
}>;

/** Timing problems stay editable and saved, but must be resolved before making any video. */
export function findSceneActionRangeIssues(scenes: readonly MusicVideoScene[],
  measures: readonly MusicVideoMeasureCue[], bpm: number): readonly SceneActionRangeIssue[] {
  return getSceneMeasureRanges(scenes, measures).flatMap((range) => {
    if (range.startIndex < 0 || range.endIndex < range.startIndex || range.endIndex >= measures.length) return [];
    const issue = validateSceneActionRanges(scenes[range.sceneIndex], measures, bpm, range.startIndex, range.endIndex);
    return issue ? [{ sceneIndex: range.sceneIndex, message: `${range.sceneIndex + 1}번 장면: ${issue}` }] : [];
  });
}

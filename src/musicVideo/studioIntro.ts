import { compositionIntroDuration, type PlaybackMeasure } from "../audio/accompanimentScore";
import type { LyricVideoPlan } from "../video/lyricVideoPlan";
import { normalizeSceneBpm } from "../video/sceneMotionClock";

/** The editor estimates offline timing; recorded songs retain their actual lead-in. */
export function getStudioIntroSeconds(measures: readonly PlaybackMeasure[], bpm: number,
  recording?: Readonly<{ plan: LyricVideoPlan }>): number {
  if (recording) {
    const start = recording.plan.frames.find((frame) => frame.measureIndex !== null)?.startSeconds ?? 0;
    return Number.isFinite(start) ? Math.max(0, start) : 0;
  }
  if (!measures.length) return 0;
  const duration = compositionIntroDuration(measures, normalizeSceneBpm(bpm));
  return Number.isFinite(duration) && duration > 0 ? .08 + duration : 0;
}

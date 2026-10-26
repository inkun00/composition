import type { TimedMusicVideoScene } from "./musicVideoModel";

export type SceneMotionClock = Readonly<{
  localSeconds: number;
  durationSeconds: number;
  beatSeconds: number;
  elapsedBeats: number;
  durationBeats: number;
  songBeats: number;
}>;

export function normalizeSceneBpm(bpm: number): number {
  return Number.isFinite(bpm) && bpm > 0 ? bpm : 120;
}

export function getSceneBeatSeconds(bpm: number): number {
  return 60 / normalizeSceneBpm(bpm);
}

/** Entrances follow the scene; repeating motions keep the music's beat across scene boundaries. */
export function getSceneMotionClock(timed: TimedMusicVideoScene, bpm: number, timeSeconds: number,
  beatOriginSeconds = timed.startSeconds): SceneMotionClock {
  const durationSeconds = Math.max(.001, timed.endSeconds - timed.startSeconds);
  const localSeconds = Math.max(0, Math.min(durationSeconds, timeSeconds - timed.startSeconds));
  const beatSeconds = getSceneBeatSeconds(bpm);
  return { localSeconds, durationSeconds, beatSeconds, elapsedBeats: localSeconds / beatSeconds,
    durationBeats: durationSeconds / beatSeconds,
    songBeats: (timed.startSeconds + localSeconds - beatOriginSeconds) / beatSeconds };
}

export function sceneBeatProgress(clock: SceneMotionClock, beats: number, sceneFraction = 1): number {
  const duration = Math.max(Number.EPSILON, Math.min(beats, clock.durationBeats * sceneFraction));
  return Math.max(0, Math.min(1, clock.elapsedBeats / duration));
}

export function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

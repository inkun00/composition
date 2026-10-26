import { SCENE_HEIGHT, SCENE_WIDTH, type SceneMotion } from "./musicVideoModel";
import { getSceneBeatSeconds } from "./sceneMotionClock";

export type TravelBounds = Readonly<{ left: number; right: number; top: number; bottom: number }>;
export type SceneTravelPose = Readonly<{ dx: number; dy: number; scale: number }>;
const DIRECTIONS = {
  "move-left": [-1, 0], "move-right": [1, 0], "move-up": [0, -1], "move-down": [0, 1],
  "move-up-left": [-1, -1], "move-up-right": [1, -1],
  "move-down-left": [-1, 1], "move-down-right": [1, 1],
  "bounce-left": [-1, 0], "bounce-right": [1, 0]
} as const;
const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

export function isSceneTravelMotion(motion: SceneMotion): motion is keyof typeof DIRECTIONS {
  return Object.hasOwn(DIRECTIONS, motion);
}

function axisOffset(minimum: number, maximum: number, direction: number, distance: number, progress: number): number {
  if (!direction) return clamp(0, minimum, maximum);
  const travel = Math.min(distance, Math.max(0, maximum - minimum));
  const start = direction > 0 ? clamp(0, minimum, maximum - travel) : clamp(0, minimum + travel, maximum);
  return start + direction * travel * progress;
}

/** Reserve just enough space for visible travel; the scale remains fixed throughout the scene. */
export function sampleSceneTravelMotion(motion: SceneMotion, bounds: TravelBounds,
  localSeconds: number, durationSeconds: number, bpm: number, songBeats?: number): SceneTravelPose | null {
  if (!isSceneTravelMotion(motion)) return null;
  const [directionX, directionY] = DIRECTIONS[motion];
  const bouncing = motion === "bounce-left" || motion === "bounce-right";
  const width = Math.max(1, bounds.right - bounds.left);
  const height = Math.max(1, bounds.bottom - bounds.top);
  const requiredX = directionX ? 56 : 0;
  const requiredY = directionY ? 36 : bouncing ? 14 : 0;
  const padding = 2;
  // Some pressure-sensitive brush outlines already extend beyond the canvas before moving.
  const canvasFit = Math.min(1, (SCENE_WIDTH - padding * 2) / width, (SCENE_HEIGHT - padding * 2) / height);
  const fit = Math.min(1, (SCENE_WIDTH - requiredX - padding * 2) / width,
    (SCENE_HEIGHT - requiredY - padding * 2) / height);
  const scale = Math.max(canvasFit * .88, fit);
  const centerX = (bounds.left + bounds.right) / 2;
  const centerY = (bounds.top + bounds.bottom) / 2;
  const minimumX = padding - centerX + width * scale / 2;
  const maximumX = SCENE_WIDTH - padding - centerX - width * scale / 2;
  const minimumY = padding - centerY + height * scale / 2;
  const maximumY = SCENE_HEIGHT - padding - centerY - height * scale / 2;
  const duration = Math.max(.001, durationSeconds);
  const local = clamp(localSeconds, 0, duration);
  const progress = local / duration;
  const dx = axisOffset(minimumX, maximumX, directionX, 56, progress);
  let dy = axisOffset(minimumY, maximumY, directionY, 36, progress);
  if (bouncing) {
    const jump = Math.min(14, Math.max(0, maximumY - minimumY));
    const baseline = clamp(0, minimumY + jump, maximumY);
    const beat = songBeats ?? local / getSceneBeatSeconds(bpm);
    dy = baseline - Math.abs(Math.sin(beat * Math.PI)) * jump;
  }
  return { dx, dy, scale };
}

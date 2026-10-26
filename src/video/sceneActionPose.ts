import type { MusicVideoPlan, MusicVideoScene } from "./musicVideoModel";
import { getSceneActionTiming } from "./sceneActionPlan";
import type { ActorPoint, SceneAction, SceneActionKind, SceneActor } from "./sceneActionTypes";

export type ActionPose = Readonly<{ action: SceneAction; amount: number }>;
export type ActorPose = Readonly<{ motions: readonly ActionPose[]; light: number | null }>;
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const ease = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t); };

/** One authored action runs once. Only state changes persist after the action ends. */
export function actionAmount(kind: SceneActionKind, progress: number): number {
  if (progress <= 0) return 0;
  if (["move", "bend", "grow", "light-on", "light-off"].includes(kind)) return ease(progress);
  if (progress >= 1) return 0;
  if (kind === "press") return progress < .35 ? ease(progress / .35)
    : progress <= .65 ? 1 : 1 - ease((progress - .65) / .35);
  if (kind === "jump") return Math.sin(Math.PI * progress);
  if (kind === "walk") return Math.sin(Math.PI * 4 * progress) * Math.sin(Math.PI * progress);
  if (kind === "flap") return Math.sin(Math.PI * 4 * progress) * Math.sin(Math.PI * progress);
  if (kind === "nod") return Math.sin(Math.PI * progress);
  return Math.sin(Math.PI * 2 * progress) * Math.sin(Math.PI * progress);
}

export function sampleActorPose(scene: MusicVideoScene, actor: SceneActor,
  plan: MusicVideoPlan, timeSeconds: number): ActorPose {
  const ordered = (scene.choreography?.actions ?? []).filter((action) => action.actorId === actor.id)
    .map((action) => ({ action, timing: getSceneActionTiming(action, plan.lyrics.frames, plan.bpm) }))
    .filter((item) => item.timing && item.timing.startSeconds <= timeSeconds)
    .sort((a, b) => a.timing!.startSeconds - b.timing!.startSeconds);
  const motions: ActionPose[] = [];
  let light: number | null = null;
  for (const { action, timing } of ordered) {
    const progress = (timeSeconds - timing!.startSeconds) / Math.max(.001, timing!.endSeconds - timing!.startSeconds);
    const amount = actionAmount(action.kind, progress);
    if (action.kind === "light-on" || action.kind === "light-off") {
      const from: number = light ?? (action.kind === "light-on" ? 0 : 1);
      const to = action.kind === "light-on" ? 1 : 0;
      light = from + (to - from) * amount;
    } else if (Math.abs(amount) > .00001) motions.push({ action, amount });
  }
  // An authored off action begins with the light lit, even before its trigger.
  if (light === null) {
    const first = (scene.choreography?.actions ?? []).filter((action) => action.actorId === actor.id &&
      (action.kind === "light-on" || action.kind === "light-off"))
      .map((action) => ({ action, timing: getSceneActionTiming(action, plan.lyrics.frames, plan.bpm) }))
      .filter((item) => item.timing).sort((a, b) => a.timing!.startSeconds - b.timing!.startSeconds)[0];
    if (first) light = first.action.kind === "light-off" ? 1 : 0;
  }
  return { motions, light };
}

/** A fixed point anchors the drawing; displacement increases towards the moving handle. */
export function deformActorPoint(point: ActorPoint, actor: SceneActor, action: SceneAction): ActorPoint {
  const [fx, fy] = actor.fixedPoint;
  const ax = actor.movingPoint[0] - fx;
  const ay = actor.movingPoint[1] - fy;
  const length = Math.hypot(ax, ay);
  const x = point[0] - fx;
  const y = point[1] - fy;
  const along = length > 1 ? (x * ax + y * ay) / (length * length) : 1;
  const perpendicular = length > 1 ? (x * ay - y * ax) / length : 0;
  const local = ease(action.kind === "flap" ? Math.abs(along) : along) *
    Math.exp(-.5 * (perpendicular / Math.max(35, length * .7)) ** 2);
  const dx = (actor.endPoint[0] - actor.movingPoint[0]) * action.strength;
  const dy = (actor.endPoint[1] - actor.movingPoint[1]) * action.strength;
  const kind = action.kind;
  if (kind === "move") return [point[0] + dx, point[1] + dy];
  if (kind === "jump") return [point[0] + dx * .25, point[1] - Math.max(15, Math.hypot(dx, dy))];
  if (kind === "grow") return [fx + x * (1 + .4 * action.strength), fy + y * (1 + .4 * action.strength)];
  if (kind === "walk") {
    const lower = clamp((point[1] - actor.movingPoint[1]) / Math.max(25, fy - actor.movingPoint[1]));
    return [point[0] + dx * .2 + Math.sin(x / Math.max(10, length) * Math.PI) * lower * 16 * action.strength,
      point[1] + dy * .2 - Math.abs(lower - .5) * 8 * action.strength];
  }
  if (kind === "swing" || kind === "flap" || kind === "nod") {
    if (length < 1) return [point[0] + dx * local, point[1] + dy * local];
    const ex = actor.endPoint[0] - fx;
    const ey = actor.endPoint[1] - fy;
    const side = kind === "flap" && along < 0 ? -1 : 1;
    const angle = Math.atan2(ax * ey - ay * ex, ax * ex + ay * ey) * action.strength * local * side;
    const scale = 1 + (Math.hypot(ex, ey) / length - 1) * action.strength * local;
    return [fx + (x * Math.cos(angle) - y * Math.sin(angle)) * scale,
      fy + (x * Math.sin(angle) + y * Math.cos(angle)) * scale];
  }
  return [point[0] + dx * local, point[1] + dy * local];
}

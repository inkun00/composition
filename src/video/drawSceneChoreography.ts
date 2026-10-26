import type { MusicVideoPlan, MusicVideoScene, SceneElement } from "./musicVideoModel";
import type { SceneActor } from "./sceneActionTypes";
import { sampleActorPose, type ActorPose } from "./sceneActionPose";
import { actorPath } from "./sceneVectorEngine";
import { paintSceneElement } from "./sceneElementPainter";
import { elementBounds } from "./sceneDrawing";

function lightColor(color: string, light: number): string {
  const warm = [224, 163, 35];
  const muted = [112, 119, 132];
  const rgb = [1, 3, 5].map((offset, index) => {
    const source = Number.parseInt(color.slice(offset, offset + 2), 16);
    const off = source + (muted[index] - source) * .65;
    const on = source + (warm[index] - source) * .75;
    return Math.round(off + (on - off) * light);
  });
  return `rgb(${rgb.join(",")})`;
}

function glow(context: CanvasRenderingContext2D, elements: readonly SceneElement[], strength: number) {
  if (strength <= .001 || elements.length === 0) return;
  const bounds = elements.map(elementBounds);
  const left = Math.min(...bounds.map((bound) => bound.left));
  const right = Math.max(...bounds.map((bound) => bound.right));
  const top = Math.min(...bounds.map((bound) => bound.top));
  const bottom = Math.max(...bounds.map((bound) => bound.bottom));
  const radius = Math.max(22, Math.max(right - left, bottom - top) * .9);
  const x = (left + right) / 2;
  const y = (top + bottom) / 2;
  const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, `rgba(255,211,76,${.5 * strength})`);
  gradient.addColorStop(1, "rgba(255,211,76,0)");
  context.fillStyle = gradient;
  context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

/** Preserve original paint order. Unassigned artwork remains fixed, even when it touches a moving part. */
export function drawSceneChoreography(context: CanvasRenderingContext2D, scene: MusicVideoScene,
  plan: MusicVideoPlan, timeSeconds: number): void {
  const owners = new Map<string, Readonly<{ actor: SceneActor; pose: ActorPose }>>();
  for (const actor of scene.choreography?.actors ?? []) {
    const pose = sampleActorPose(scene, actor, plan, timeSeconds);
    actor.elementIds.forEach((id) => owners.set(id, { actor, pose }));
    if (pose.light !== null) glow(context, scene.elements.filter((element) => actor.elementIds.includes(element.id)), pose.light);
  }
  for (const element of scene.elements) {
    const owner = owners.get(element.id);
    if (!owner) { paintSceneElement(context, element); continue; }
    const { actor, pose } = owner;
    const path = pose.motions.length ? actorPath(element, actor, pose.motions) : undefined;
    paintSceneElement(context, element, path, pose.light === null ? element.color : lightColor(element.color, pose.light));
  }
}

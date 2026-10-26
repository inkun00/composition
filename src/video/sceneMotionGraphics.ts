import { SCENE_HEIGHT, SCENE_WIDTH, type MusicVideoPlan, type MusicVideoScene,
  type SceneElement, type ScenePoint, type TimedMusicVideoScene } from "./musicVideoModel";
import { elementBounds, elementPath } from "./sceneDrawing";
import { paintSceneElement } from "./sceneElementPainter";
import { drawSceneGraphicEffect } from "./sceneGraphicEffects";
import { isSceneTravelMotion, sampleSceneTravelMotion } from "./sceneTravelMotion";
import { getSceneMotionClock, sceneBeatProgress } from "./sceneMotionClock";
import { drawSceneElementMotions, hasElementMotions } from "./sceneElementMotion";

export type SceneGraphicPose = Readonly<{
  dx: number;
  dy: number;
  rotation: number;
  scale: number;
  horizontalScale: number;
  opacity: number;
  reveal: number;
}>;

type StrokeRoute = Readonly<{ points: readonly ScenePoint[]; length: number; weight: number }>;
const routes = new WeakMap<SceneElement, StrokeRoute>();
type Bounds = Readonly<{ left: number; right: number; top: number; bottom: number }>;
const boundsCache = new WeakMap<MusicVideoScene, Bounds>();
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const easeOut = (value: number) => 1 - (1 - clamp(value)) ** 3;

/** Scene-local time makes a preset restart in exactly the same way in preview and MP4. */
export function sampleSceneGraphicPose(timed: TimedMusicVideoScene, bpm: number,
  timeSeconds: number, beatOriginSeconds = timed.startSeconds, scoped = false): SceneGraphicPose {
  const clock = getSceneMotionClock(timed, bpm, timeSeconds, beatOriginSeconds);
  const { localSeconds: local, durationSeconds: duration, songBeats: beat } = clock;
  const entranceProgress = sceneBeatProgress(clock, 2, .6);
  const entrance = easeOut(entranceProgress);
  const longEntrance = sceneBeatProgress(clock, 4, .6);
  const smoothEntrance = longEntrance * longEntrance * (3 - 2 * longEntrance);
  const pose = { dx: 0, dy: 0, rotation: 0, scale: 1, horizontalScale: 1, opacity: 1, reveal: 1 };
  if (isSceneTravelMotion(timed.scene.motion)) {
    return { ...pose, ...sampleSceneTravelMotion(timed.scene.motion, artworkBounds(timed.scene), local, duration, bpm, beat)! };
  }
  switch (timed.scene.motion) {
    case "draw-on":
      pose.reveal = sceneBeatProgress(clock, 8, .6);
      break;
    case "fade":
      pose.opacity = entrance;
      break;
    case "slide":
      if (entrance < 1) {
        const bounds = scoped ? artworkBounds(timed.scene) : undefined;
        const distance = bounds ? Math.max(16, Math.min(SCENE_WIDTH * .16, (bounds.right - bounds.left) * .35)) : SCENE_WIDTH * .16;
        pose.dx = -distance * (1 - entrance);
      }
      pose.opacity = entrance;
      break;
    case "zoom":
      pose.scale = 1 + .08 * clamp(local / duration);
      break;
    case "zoom-out":
      pose.scale = 1 - .08 * clamp(local / duration);
      break;
    case "rotate-in":
      Object.assign(pose, rotatingEntrance(timed.scene, smoothEntrance, scoped));
      pose.opacity = smoothEntrance;
      break;
    case "flip-in":
      pose.horizontalScale = Math.max(.035, Math.cos((1 - smoothEntrance) * Math.PI / 2));
      pose.scale = .92 + .08 * smoothEntrance;
      pose.opacity = smoothEntrance;
      break;
    case "pop-in":
      pose.opacity = entrance;
      pose.scale = entranceProgress < .65 ? .78 + .22 * easeOut(entranceProgress / .65)
        : 1 - .035 * Math.sin((entranceProgress - .65) / .35 * Math.PI) ** 2;
      break;
    case "float":
      pose.dx = Math.sin(beat * Math.PI / 4) * 9;
      pose.dy = -Math.sin(beat * Math.PI / 2) * 7;
      pose.rotation = Math.sin(beat * Math.PI / 4) * .012;
      break;
    case "bounce":
      pose.dy = -Math.abs(Math.sin(beat * Math.PI)) * 15;
      break;
    case "pulse":
      pose.scale = 1 + Math.sin(beat * Math.PI) ** 2 * .045;
      break;
    case "sway":
      pose.dx = Math.sin(beat * Math.PI / 2) * 8;
      pose.rotation = Math.sin(beat * Math.PI / 2) * .035;
      break;
  }
  return pose;
}

function artworkBounds(scene: MusicVideoScene): Bounds {
  const cached = boundsCache.get(scene);
  if (cached) return cached;
  const bounds = scene.elements.map((element) => {
    if (element.tool !== "brush") return elementBounds(element);
    // Brush pressure can extend past width / 2. Use the same filled outline as the painter.
    const coordinates = elementPath(element).match(/-?\d+(?:\.\d+)?/g)?.map(Number);
    if (!coordinates?.length) return elementBounds(element);
    const xs = coordinates.filter((_, index) => index % 2 === 0);
    const ys = coordinates.filter((_, index) => index % 2 === 1);
    return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
  });
  const combined = bounds.length ? {
    left: Math.min(...bounds.map((bound) => bound.left)), right: Math.max(...bounds.map((bound) => bound.right)),
    top: Math.min(...bounds.map((bound) => bound.top)), bottom: Math.max(...bounds.map((bound) => bound.bottom))
  } : { left: 0, right: SCENE_WIDTH, top: 0, bottom: SCENE_HEIGHT };
  boundsCache.set(scene, combined);
  return combined;
}

function artworkCenter(scene: MusicVideoScene): readonly [number, number] {
  const bounds = artworkBounds(scene);
  return [(bounds.left + bounds.right) / 2, (bounds.top + bounds.bottom) / 2];
}

/** Fit the rotated bounding rectangle while it settles back into its authored position. */
function rotatingEntrance(scene: MusicVideoScene, progress: number, scoped = false) {
  if (progress >= 1) return { dx: 0, dy: 0, rotation: 0, scale: 1 };
  const bounds = artworkBounds(scene);
  const [centerX, centerY] = artworkCenter(scene);
  const rotation = -.22 * Math.PI * (1 - progress);
  const dx = (SCENE_WIDTH / 2 - centerX) * (1 - progress);
  const dy = (SCENE_HEIGHT / 2 - centerY) * (1 - progress);
  const halfWidth = (bounds.right - bounds.left) / 2;
  const halfHeight = (bounds.bottom - bounds.top) / 2;
  const rotatedWidth = Math.abs(Math.cos(rotation)) * halfWidth + Math.abs(Math.sin(rotation)) * halfHeight;
  const rotatedHeight = Math.abs(Math.sin(rotation)) * halfWidth + Math.abs(Math.cos(rotation)) * halfHeight;
  if (scoped) {
    const scale = Math.min(.58 + .42 * progress, (SCENE_WIDTH - 4) / Math.max(1, rotatedWidth * 2),
      (SCENE_HEIGHT - 4) / Math.max(1, rotatedHeight * 2));
    const x = Math.max(2 + rotatedWidth * scale, Math.min(SCENE_WIDTH - 2 - rotatedWidth * scale, centerX));
    const y = Math.max(2 + rotatedHeight * scale, Math.min(SCENE_HEIGHT - 2 - rotatedHeight * scale, centerY));
    return { dx: x - centerX, dy: y - centerY, rotation, scale };
  }
  const availableX = Math.max(0, Math.min(centerX + dx, SCENE_WIDTH - centerX - dx));
  const availableY = Math.max(0, Math.min(centerY + dy, SCENE_HEIGHT - centerY - dy));
  const fit = Math.min(1, availableX / Math.max(1, rotatedWidth), availableY / Math.max(1, rotatedHeight));
  return { dx, dy, rotation, scale: Math.min(.58 + .42 * progress, fit) };
}

function strokeRoute(element: SceneElement): StrokeRoute {
  const cached = routes.get(element);
  if (cached) return cached;
  const first = element.points[0];
  const last = element.points.at(-1)!;
  let points = element.points;
  if (element.tool === "line") points = [first, last];
  else if (element.tool === "rectangle" || element.tool === "ellipse") {
    const left = Math.min(first[0], last[0]);
    const right = Math.max(first[0], last[0]);
    const top = Math.min(first[1], last[1]);
    const bottom = Math.max(first[1], last[1]);
    if (element.tool === "rectangle") {
      points = [[left, top, .5], [right, top, .5], [right, bottom, .5], [left, bottom, .5], [left, top, .5]];
    } else {
      const rx = Math.max(.1, (right - left) / 2);
      const ry = Math.max(.1, (bottom - top) / 2);
      points = Array.from({ length: 129 }, (_, index): ScenePoint => {
        const angle = Math.PI - index / 128 * Math.PI * 2;
        return [left + rx + Math.cos(angle) * rx, top + ry + Math.sin(angle) * ry, .5];
      });
    }
  }
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += Math.hypot(points[index][0] - points[index - 1][0], points[index][1] - points[index - 1][1]);
  }
  const route = { points, length, weight: Math.max(element.width, length) };
  routes.set(element, route);
  return route;
}

function partialPoints(route: StrokeRoute, progress: number): readonly ScenePoint[] {
  const points: ScenePoint[] = [route.points[0]];
  let remaining = route.length * progress;
  for (let index = 1; index < route.points.length; index += 1) {
    const before = route.points[index - 1];
    const after = route.points[index];
    const length = Math.hypot(after[0] - before[0], after[1] - before[1]);
    if (remaining >= length) {
      points.push(after);
      remaining -= length;
      if (remaining <= 0) break;
    } else {
      const amount = length > 0 ? remaining / length : 0;
      points.push([before[0] + (after[0] - before[0]) * amount,
        before[1] + (after[1] - before[1]) * amount, before[2] + (after[2] - before[2]) * amount]);
      break;
    }
  }
  return points;
}

/** Reveal original strokes by their path length; completed strokes always use the original painter. */
function drawRevealedArtwork(context: CanvasRenderingContext2D, scene: MusicVideoScene, reveal: number): void {
  const strokeRoutes = scene.elements.map(strokeRoute);
  let remaining = strokeRoutes.reduce((sum, route) => sum + route.weight, 0) * reveal;
  for (const [index, element] of scene.elements.entries()) {
    if (remaining <= 0) break;
    const route = strokeRoutes[index];
    if (remaining >= route.weight) paintSceneElement(context, element);
    else {
      const points = partialPoints(route, remaining / route.weight);
      if (element.tool === "brush") paintSceneElement(context, { ...element, points });
      else paintSceneElement(context, element,
        `M ${points.map(([x, y]) => `${x} ${y}`).join(" L ")}`);
    }
    remaining -= route.weight;
  }
}

/** Apply one selected graphic treatment to all artwork, keeping background and lyrics outside it. */
function drawSceneMotionGraphicsCore(context: CanvasRenderingContext2D, timed: TimedMusicVideoScene,
  plan: MusicVideoPlan, timeSeconds: number, scoped = false): void {
  const pose = sampleSceneGraphicPose(timed, plan.bpm, timeSeconds, plan.introSeconds, scoped);
  context.save();
  context.globalAlpha *= pose.opacity;
  if (pose.dx || pose.dy || pose.rotation || pose.scale !== 1 || pose.horizontalScale !== 1) {
    const [centerX, centerY] = artworkCenter(timed.scene);
    context.translate(centerX + pose.dx, centerY + pose.dy);
    context.rotate(pose.rotation);
    context.scale(pose.scale * pose.horizontalScale, pose.scale);
    context.translate(-centerX, -centerY);
  }
  const clock = getSceneMotionClock(timed, plan.bpm, timeSeconds, plan.introSeconds);
  const entranceBeats = timed.scene.motion === "diagonal-reveal" ? 4 : 2;
  const entranceProgress = sceneBeatProgress(clock, entranceBeats, .6);
  const handled = drawSceneGraphicEffect(context, timed.scene, {
    ...clock,
    scope: scoped ? artworkBounds(timed.scene) : undefined,
    entrance: entranceProgress * entranceProgress * (3 - 2 * entranceProgress)
  }, (color) => timed.scene.elements.forEach((element) => paintSceneElement(context, element, undefined, color ?? element.color)));
  if (!handled) {
    if (pose.reveal < 1) drawRevealedArtwork(context, timed.scene, pose.reveal);
    else timed.scene.elements.forEach((element) => paintSceneElement(context, element));
  }
  context.restore();
}

export function drawSceneMotionGraphics(context: CanvasRenderingContext2D, timed: TimedMusicVideoScene,
  plan: MusicVideoPlan, timeSeconds: number): void {
  if (hasElementMotions(timed.scene)) {
    drawSceneElementMotions(context, timed, plan, timeSeconds, drawSceneMotionGraphicsCore);
  } else drawSceneMotionGraphicsCore(context, timed, plan, timeSeconds);
}

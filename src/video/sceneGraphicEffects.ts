import { SCENE_HEIGHT, SCENE_WIDTH, type MusicVideoScene } from "./musicVideoModel";
import { positiveModulo, sceneBeatProgress, type SceneMotionClock } from "./sceneMotionClock";

type Scope = Readonly<{ left: number; right: number; top: number; bottom: number }>;
type Clock = SceneMotionClock & Readonly<{ entrance: number; scope?: Scope }>;
type PaintArtwork = (color?: string) => void;
const COLORS = ["#4285f4", "#ea4335", "#fbbc04", "#34a853", "#a142f4"];
const clamp = (value: number) => Math.max(0, Math.min(1, value));
let starPath: Path2D | undefined;
let snowPath: Path2D | undefined;

function region(scope?: Scope) {
  return scope ? { left: scope.left, top: scope.top, width: Math.max(.1, scope.right - scope.left),
    height: Math.max(.1, scope.bottom - scope.top) }
    : { left: 0, top: 0, width: SCENE_WIDTH, height: SCENE_HEIGHT };
}

function decorationScale(scope?: Scope): number {
  if (!scope) return 1;
  const bounds = region(scope);
  return Math.max(.2, Math.min(1, bounds.width / SCENE_WIDTH, bounds.height / SCENE_HEIGHT));
}

function withinScope(context: CanvasRenderingContext2D, scope: Scope | undefined, paint: () => void): void {
  if (!scope) {
    paint();
    return;
  }
  const bounds = region(scope);
  context.save();
  context.beginPath();
  context.rect(bounds.left, bounds.top, bounds.width, bounds.height);
  context.clip();
  paint();
  context.restore();
}

function sceneSeed(id: string): number {
  let seed = 2166136261;
  for (let index = 0; index < id.length; index += 1) seed = Math.imul(seed ^ id.charCodeAt(index), 16777619);
  return seed >>> 0;
}

/** Independent samples make arbitrary seeks identical to uninterrupted playback. */
function sample(seed: number, index: number, channel: number): number {
  let value = seed ^ Math.imul(index + 1, 374761393) ^ Math.imul(channel + 1, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

function revealWithClip(context: CanvasRenderingContext2D, progress: number,
  kind: "iris" | "curtain", paint: PaintArtwork, scope?: Scope): void {
  if (progress <= 0) return;
  if (progress >= 1) { paint(); return; }
  context.save();
  context.beginPath();
  const bounds = region(scope);
  if (kind === "iris") {
    const radius = Math.hypot(bounds.width / 2, bounds.height / 2) * progress;
    context.arc(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2, radius, 0, Math.PI * 2);
  } else {
    const width = bounds.width * progress;
    context.rect(bounds.left + (bounds.width - width) / 2, bounds.top, width, bounds.height);
  }
  context.clip();
  paint();
  context.restore();
}

function assemble(context: CanvasRenderingContext2D, scene: MusicVideoScene,
  progress: number, paint: PaintArtwork, scope?: Scope): void {
  if (progress <= 0) return;
  if (progress >= 1) { paint(); return; }
  const seed = sceneSeed(scene.id);
  const bounds = region(scope);
  const width = bounds.width / 3;
  const height = bounds.height / 2;
  const relativeX = bounds.width / SCENE_WIDTH;
  const relativeY = bounds.height / SCENE_HEIGHT;
  const scale = .78 + .22 * progress;
  for (let index = 0; index < 6; index += 1) {
    const column = index % 3;
    const row = Math.floor(index / 3);
    const x = bounds.left + width * (column + .5);
    const y = bounds.top + height * (row + .5);
    // Scaled tiles leave enough room for these offsets to stay inside the scene.
    const dx = ((column - 1) * 18 + (sample(seed, index, 0) - .5) * 8) * (1 - progress) * relativeX;
    const dy = ((row - .5) * 28 + (sample(seed, index, 1) - .5) * 6) * (1 - progress) * relativeY;
    context.save();
    context.globalAlpha *= progress;
    context.translate(x + dx, y + dy);
    context.scale(scale, scale);
    context.translate(-x, -y);
    context.beginPath();
    context.rect(bounds.left + column * width, bounds.top + row * height, width, height);
    context.clip();
    paint();
    context.restore();
  }
}

function sparkles(context: CanvasRenderingContext2D, scene: MusicVideoScene, clock: Clock): void {
  const seed = sceneSeed(scene.id);
  starPath ??= new Path2D("M 0 -1 L .22 -.22 L 1 0 L .22 .22 L 0 1 L -.22 .22 L -1 0 L -.22 -.22 Z");
  const beat = clock.songBeats;
  const bounds = region(clock.scope);
  const relative = decorationScale(clock.scope);
  for (let index = 0; index < 12; index += 1) {
    const phase = positiveModulo(beat / 2 + sample(seed, index, 0), 1);
    const strength = Math.sin(phase * Math.PI) ** 2;
    const size = (7 + sample(seed, index, 1) * 10) * strength * relative;
    if (size < .1) continue;
    context.save();
    context.globalAlpha *= strength * .8;
    context.fillStyle = COLORS[Math.floor(sample(seed, index, 2) * COLORS.length)];
    context.translate(bounds.left + (.08 + sample(seed, index, 3) * .84) * bounds.width,
      bounds.top + (.1 + sample(seed, index, 4) * .8) * bounds.height);
    context.rotate(sample(seed, index, 5) * Math.PI / 2);
    context.scale(size, size);
    context.fill(starPath);
    context.restore();
  }
}

function confetti(context: CanvasRenderingContext2D, scene: MusicVideoScene, clock: Clock): void {
  const elapsed = sceneBeatProgress(clock, 8, .7);
  if (elapsed <= 0 || elapsed >= 1) return;
  const seed = sceneSeed(scene.id);
  const bounds = region(clock.scope);
  const relative = decorationScale(clock.scope);
  for (let index = 0; index < 36; index += 1) {
    const delay = sample(seed, index, 0) * .15;
    const progress = clamp((elapsed - delay) / (1 - delay));
    if (progress <= 0 || progress >= 1) continue;
    const angle = sample(seed, index, 1) * Math.PI * 2;
    const x = bounds.left + (.08 + sample(seed, index, 2) * .84) * bounds.width + Math.sin(angle + progress * 5) * 20 * relative;
    const y = bounds.top - 10 * relative + progress * (bounds.height + 20 * relative);
    const width = (6 + sample(seed, index, 3) * 7) * relative;
    const height = (4 + sample(seed, index, 4) * 5) * relative;
    context.save();
    context.globalAlpha *= Math.sin(progress * Math.PI) * .9;
    context.fillStyle = COLORS[Math.floor(sample(seed, index, 5) * COLORS.length)];
    context.translate(x, y);
    context.rotate(angle + progress * Math.PI * 4);
    context.fillRect(-width / 2, -height / 2, width, height);
    context.restore();
  }
}

function diagonalReveal(context: CanvasRenderingContext2D, progress: number, paint: PaintArtwork, scope?: Scope): void {
  if (progress <= 0) return;
  if (progress >= 1) { paint(); return; }
  const bounds = region(scope);
  const reach = progress * (bounds.width + bounds.height);
  context.save();
  context.beginPath();
  context.moveTo(bounds.left, bounds.top);
  context.lineTo(bounds.left + Math.min(bounds.width, reach), bounds.top);
  if (reach > bounds.width) context.lineTo(bounds.left + bounds.width, bounds.top + reach - bounds.width);
  if (reach > bounds.height) context.lineTo(bounds.left + reach - bounds.height, bounds.top + bounds.height);
  context.lineTo(bounds.left, bounds.top + Math.min(bounds.height, reach));
  context.closePath();
  context.clip();
  paint();
  context.restore();
}

function snowfall(context: CanvasRenderingContext2D, scene: MusicVideoScene, clock: Clock): void {
  const seed = sceneSeed(scene.id);
  snowPath ??= new Path2D("M 1 0 A 1 1 0 1 0 -1 0 A 1 1 0 1 0 1 0");
  const bounds = region(clock.scope);
  const relative = decorationScale(clock.scope);
  for (let index = 0; index < 32; index += 1) {
    const speed = (12.5 + sample(seed, index, 0) * 12.5) * (clock.scope ? bounds.height / SCENE_HEIGHT : 1);
    const phase = sample(seed, index, 1) * (bounds.height + 40 * relative);
    const y = bounds.top + positiveModulo(clock.songBeats * speed + phase, bounds.height + 40 * relative) - 20 * relative;
    const inset = Math.min(20 * relative, bounds.width / 4);
    const x = bounds.left + inset + sample(seed, index, 2) * (bounds.width - inset * 2)
      + Math.sin(clock.songBeats * .225 + index) * 9 * relative;
    const radius = (3 + sample(seed, index, 3) * 4) * relative;
    context.save();
    context.globalAlpha *= .75;
    context.translate(x, y);
    context.scale(radius, radius);
    context.fillStyle = "#eef8ff";
    context.strokeStyle = "#90bde0";
    context.lineWidth = .2;
    context.fill(snowPath);
    context.stroke(snowPath);
    context.restore();
  }
}

function spotlight(context: CanvasRenderingContext2D, clock: Clock, paint: PaintArtwork): void {
  const progress = sceneBeatProgress(clock, 8, .8);
  if (progress <= 0 || progress >= 1) return;
  const bounds = region(clock.scope);
  const radius = clock.scope ? Math.max(bounds.height * .55, bounds.width * .15, 4) : SCENE_HEIGHT * .35;
  const x = bounds.left - radius + (bounds.width + radius * 2) * progress;
  const y = bounds.top + bounds.height * (.45 + Math.sin(progress * Math.PI * 2) * .06);
  const envelope = Math.sin(progress * Math.PI) ** 2;
  context.save();
  // Preserve the title and lyric bands even when the original artwork extends beneath them.
  context.beginPath();
  context.rect(0, SCENE_HEIGHT * 66 / 720, SCENE_WIDTH, SCENE_HEIGHT * (720 - 66 - 104) / 720);
  context.clip();
  for (let index = 0; index < 8; index += 1) {
    context.save();
    context.globalAlpha *= .055 * envelope;
    context.beginPath();
    context.arc(x, y, radius * (1 - index * .09), 0, Math.PI * 2);
    context.clip();
    paint("#fff2a8");
    context.restore();
  }
  context.restore();
}

/** Effects act on the complete drawing or add decorations; no semantic parts are inferred. */
export function drawSceneGraphicEffect(context: CanvasRenderingContext2D, scene: MusicVideoScene,
  clock: Clock, paint: PaintArtwork): boolean {
  switch (scene.motion) {
    case "iris":
    case "curtain":
      revealWithClip(context, clock.entrance, scene.motion, paint, clock.scope);
      return true;
    case "assemble":
      assemble(context, scene, clock.entrance, paint, clock.scope);
      return true;
    case "diagonal-reveal":
      diagonalReveal(context, clock.entrance, paint, clock.scope);
      return true;
    case "sparkle":
      paint();
      withinScope(context, clock.scope, () => sparkles(context, scene, clock));
      return true;
    case "confetti":
      paint();
      withinScope(context, clock.scope, () => confetti(context, scene, clock));
      return true;
    case "snow":
      paint();
      withinScope(context, clock.scope, () => snowfall(context, scene, clock));
      return true;
    case "spotlight":
      paint();
      withinScope(context, clock.scope, () => spotlight(context, clock, paint));
      return true;
    default:
      return false;
  }
}

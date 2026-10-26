import type { MusicVideoPlan, MusicVideoScene, TimedMusicVideoScene } from "./musicVideoModel";

type DrawScene = (context: CanvasRenderingContext2D, timed: TimedMusicVideoScene,
  plan: MusicVideoPlan, timeSeconds: number, scoped?: boolean) => void;
const elementScenes = new WeakMap<MusicVideoScene, readonly MusicVideoScene[]>();

export function hasElementMotions(scene: MusicVideoScene): boolean {
  return scene.elements.some((element) => element.motion !== undefined);
}

/** Ephemeral scenes reuse the existing motion engine without changing saved artwork or recursing. */
function scopedScenes(scene: MusicVideoScene): readonly MusicVideoScene[] {
  const cached = elementScenes.get(scene);
  if (cached) return cached;
  const children = scene.elements.map((element) => {
    const { motion, ...artwork } = element;
    return { ...scene, id: `${scene.id}:element:${element.id}`, elements: [artwork],
      motion: motion ?? scene.motion, choreography: undefined };
  });
  elementScenes.set(scene, children);
  return children;
}

/** Preserve paint order so fixed foreground strokes continue to cover moving strokes behind them. */
export function drawSceneElementMotions(context: CanvasRenderingContext2D, timed: TimedMusicVideoScene,
  plan: MusicVideoPlan, timeSeconds: number, draw: DrawScene): void {
  for (const scene of scopedScenes(timed.scene)) draw(context, { ...timed, scene }, plan, timeSeconds, true);
}

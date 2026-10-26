import type { LyricVideoFrame } from "./lyricVideoPlan";
import {
  isIntroScene, SCENE_HEIGHT, SCENE_WIDTH, type MusicVideoPlan, type MusicVideoScene,
  type SceneElement
} from "./musicVideoModel";
import { paintSceneElement } from "./sceneElementPainter";
import { drawSceneChoreography } from "./drawSceneChoreography";
import { drawSceneMotionGraphics } from "./sceneMotionGraphics";
import { drawMusicVideoTitleCard } from "./musicVideoTitleCard";

export const MUSIC_VIDEO_WIDTH = 1280;
export const MUSIC_VIDEO_HEIGHT = 720;
const SCENE_BOUNDARY_EPSILON_SECONDS = 1e-7;

function drawElements(context: CanvasRenderingContext2D, elements: readonly SceneElement[]) {
  for (const element of elements) paintSceneElement(context, element);
}

/** The editor and video use the same 960 × 540 drawing coordinates. */
export function drawSceneElements(context: CanvasRenderingContext2D, scene: MusicVideoScene): void {
  context.save();
  context.fillStyle = scene.background;
  context.fillRect(0, 0, SCENE_WIDTH, SCENE_HEIGHT);
  drawElements(context, scene.elements);
  context.restore();
}

function drawLyrics(context: CanvasRenderingContext2D, title: string, frame: LyricVideoFrame | undefined): void {
  context.fillStyle = "rgba(15, 23, 42, 0.7)";
  context.fillRect(0, 0, MUSIC_VIDEO_WIDTH, 66);
  context.fillStyle = "#ffffff";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = '600 28px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
  context.fillText(title, MUSIC_VIDEO_WIDTH / 2, 33, MUSIC_VIDEO_WIDTH - 80);
  if (!frame?.syllables.length) return;
  context.fillStyle = "rgba(15, 23, 42, 0.8)";
  context.fillRect(0, MUSIC_VIDEO_HEIGHT - 104, MUSIC_VIDEO_WIDTH, 104);
  let size = 58;
  let widths: number[] = [];
  let total = 0;
  do {
    context.font = `700 ${size}px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif`;
    widths = frame.syllables.map((syllable) => context.measureText(syllable).width);
    total = widths.reduce((sum, width) => sum + width, 0) + (widths.length - 1) * 8;
    if (total <= MUSIC_VIDEO_WIDTH - 100 || size <= 26) break;
    size -= 4;
  } while (size >= 26);
  let x = (MUSIC_VIDEO_WIDTH - total) / 2;
  context.textAlign = "left";
  frame.syllables.forEach((syllable, index) => {
    context.fillStyle = index === frame.activeSyllable ? "#ffd34f" : "#ffffff";
    context.fillText(syllable, x, MUSIC_VIDEO_HEIGHT - 52);
    x += widths[index] + 8;
  });
}

export function drawMusicVideoFrame(context: CanvasRenderingContext2D, plan: MusicVideoPlan,
  timeSeconds: number, animated: boolean): void {
  // Measures and syllables sum the same note durations in a different order.
  // Keep static lyric-frame exports on the new scene despite floating-point rounding at a boundary.
  const sceneTime = timeSeconds + SCENE_BOUNDARY_EPSILON_SECONDS;
  const introductory = timeSeconds < plan.introSeconds;
  const songScenes = plan.scenes.filter((scene) => !isIntroScene(scene.scene));
  const timed = introductory ? plan.scenes.find((scene) => isIntroScene(scene.scene))
    : songScenes.find((scene) => sceneTime >= scene.startSeconds && sceneTime < scene.endSeconds) ?? songScenes.at(-1);
  context.save();
  if (introductory && !timed?.scene.elements.length) {
    drawMusicVideoTitleCard(context, plan.title, plan.composer, MUSIC_VIDEO_WIDTH, MUSIC_VIDEO_HEIGHT);
    context.restore();
    return;
  }
  context.fillStyle = timed?.scene.background ?? "#ffffff";
  context.fillRect(0, 0, MUSIC_VIDEO_WIDTH, MUSIC_VIDEO_HEIGHT);
  if (timed) {
    context.save();
    context.scale(MUSIC_VIDEO_WIDTH / SCENE_WIDTH, MUSIC_VIDEO_HEIGHT / SCENE_HEIGHT);
    if (animated && !introductory && timed.scene.choreography && !timed.scene.elements.some((element) => element.motion !== undefined)) {
      drawSceneChoreography(context, timed.scene, plan, timeSeconds);
    } else if (animated) {
      drawSceneMotionGraphics(context, timed, plan, timeSeconds);
    } else drawElements(context, timed.scene.elements);
    context.restore();
  }
  if (!introductory) {
    const lyric = plan.lyrics.frames.find((frame) => timeSeconds >= frame.startSeconds && timeSeconds < frame.endSeconds);
    drawLyrics(context, plan.title, lyric);
  }
  context.restore();
}

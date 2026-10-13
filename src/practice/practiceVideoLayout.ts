import type { PracticeVideoMeasure, PracticeVideoPlan } from "./practiceVideoTypes";

export const PRACTICE_VIDEO_WIDTH = 1280;
export const PRACTICE_VIDEO_HEIGHT = 720;
export const PRACTICE_VIDEO_FPS = 24;
export const PRACTICE_VIDEO_FONT = '"Malgun Gothic", "Apple SD Gothic Neo", sans-serif';

export type VideoTrackBounds = Readonly<{ x: number; y: number; width: number; height: number }>;

export function practiceVideoTrackBounds(trackIndex: number, trackCount: number): VideoTrackBounds {
  const available = 632;
  const gap = 20;
  const height = (available - gap * (trackCount - 1)) / trackCount;
  return { x: 48, y: 44 + trackIndex * (height + gap), width: 1184, height };
}

export function practiceVideoPage(plan: PracticeVideoPlan, seconds: number): readonly PracticeVideoMeasure[] {
  const position = plan.measures.findIndex((measure) =>
    seconds >= measure.startSeconds && seconds < measure.endSeconds);
  const activeIndex = position < 0 ? plan.measures.length - 1 : position;
  const pageStart = Math.floor(activeIndex / 2) * 2;
  return plan.measures.slice(pageStart, pageStart + 2);
}

export function roundedVideoRect(
  context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius = 12
): void {
  context.beginPath();
  context.roundRect(x, y, Math.max(0, width), Math.max(0, height), radius);
}

export function drawVideoText(
  context: CanvasRenderingContext2D, text: string, x: number, y: number,
  maxWidth: number, size = 20, color = "#fff", weight = 500
): void {
  context.fillStyle = color;
  context.font = `${weight} ${size}px ${PRACTICE_VIDEO_FONT}`;
  context.textBaseline = "middle";
  context.fillText(text, x, y, Math.max(1, maxWidth));
}

export function measureFraction(measure: PracticeVideoMeasure, seconds: number): number {
  return Math.max(0, Math.min(1,
    (seconds - measure.startSeconds) / (measure.endSeconds - measure.startSeconds)));
}

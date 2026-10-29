import { PRACTICE_VIDEO_FONT } from "./practiceVideoLayout";

export type PracticeLyricGlyph = Readonly<{
  text: string;
  startSeconds: number;
  endSeconds: number;
}>;

/** All motion derives from soundtrack time, including seeking and offline encoding. */
export function drawPracticeLyricGlyph(
  context: CanvasRenderingContext2D, glyph: PracticeLyricGlyph,
  x: number, y: number, size: number, seconds: number
): void {
  const active = seconds >= glyph.startSeconds && seconds < glyph.endSeconds && glyph.text.trim() !== "";
  if (!active) {
    context.fillText(glyph.text, x, y);
    return;
  }

  const progress = (seconds - glyph.startSeconds) / (glyph.endSeconds - glyph.startSeconds);
  const pulse = Math.sin(Math.PI * progress);
  const emphasis = 0.3 + 0.7 * pulse;
  context.save();
  context.font = `600 ${size * (1 + 0.1 * emphasis)}px ${PRACTICE_VIDEO_FONT}`;
  context.shadowColor = "#7ce8ed";
  context.shadowBlur = size * (0.16 + 0.16 * emphasis);
  context.fillText(glyph.text, x, y - size * 0.075 * pulse);

  context.restore();
}

import { PRACTICE_VIDEO_FONT } from "./practiceVideoLayout";

export type PracticeLyricGlyph = Readonly<{
  text: string;
  startSeconds: number;
  endSeconds: number;
}>;

/** All motion derives from soundtrack time, including seeking and offline encoding. */
export function drawPracticeLyricGlyph(
  context: CanvasRenderingContext2D, glyph: PracticeLyricGlyph,
  x: number, y: number, width: number, size: number, seconds: number
): void {
  const active = seconds >= glyph.startSeconds && seconds < glyph.endSeconds && glyph.text.trim() !== "";
  if (!active) {
    context.fillText(glyph.text, x, y);
    return;
  }

  const progress = (seconds - glyph.startSeconds) / (glyph.endSeconds - glyph.startSeconds);
  const pulse = Math.sin(Math.PI * progress);
  const emphasis = 0.3 + 0.7 * pulse;
  const underlineY = y + size * 0.7;
  const left = x - width / 2;
  context.save();
  context.font = `600 ${size * (1 + 0.1 * emphasis)}px ${PRACTICE_VIDEO_FONT}`;
  context.shadowColor = "#7ce8ed";
  context.shadowBlur = size * (0.16 + 0.16 * emphasis);
  context.fillText(glyph.text, x, y - size * 0.075 * pulse);

  // A quiet light trail makes the held syllable's duration visible without flashing.
  context.strokeStyle = "#7ce8ed";
  context.lineCap = "round";
  context.lineWidth = Math.max(2, size * 0.045);
  context.globalAlpha = 0.28;
  context.beginPath();
  context.moveTo(left, underlineY);
  context.lineTo(left + width, underlineY);
  context.stroke();
  context.globalAlpha = 0.9;
  context.beginPath();
  context.moveTo(left, underlineY);
  context.lineTo(left + width * progress, underlineY);
  context.stroke();
  context.fillStyle = "#fff";
  context.beginPath();
  context.arc(left + width * progress, underlineY, Math.max(1.8, size * 0.035), 0, Math.PI * 2);
  context.fill();
  context.restore();
  context.beginPath();
}

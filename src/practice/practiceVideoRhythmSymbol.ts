import type { NoteEvent } from "../music/types";
import type { VideoTrackBounds } from "./practiceVideoLayout";
import { practiceVideoNotation } from "./practiceVideoNotation";

/** Draw music notation as paths so exported videos need no music-symbol font. */
export function drawPracticeVideoRhythmSymbol(
  context: CanvasRenderingContext2D, note: NoteEvent, bounds: VideoTrackBounds
): void {
  const notation = practiceVideoNotation(note);
  const duration = notation.duration.replace(/[dr]/g, "");
  const scale = Math.max(0, Math.min(1, (bounds.width - 6) / 24, (bounds.height - 6) / 34));
  if (scale === 0) return;
  const left = bounds.x + (bounds.width - 24 * scale) / 2;
  const top = bounds.y + (bounds.height - 34 * scale) / 2;
  const x = (value: number) => left + value * scale;
  const y = (value: number) => top + value * scale;
  const move = (px: number, py: number) => context.moveTo(x(px), y(py));
  const line = (px: number, py: number) => context.lineTo(x(px), y(py));
  const curve = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) => {
    context.bezierCurveTo(x(x1), y(y1), x(x2), y(y2), x(x3), y(y3));
  };
  const dot = (px: number, py: number, radius: number) => {
    context.beginPath();
    context.arc(x(px), y(py), radius * scale, 0, Math.PI * 2);
    context.fill();
  };
  const flags = duration === "8" ? 1 : duration === "16" ? 2 : duration === "32" ? 3 : 0;

  context.save();
  context.fillStyle = "#fff";
  context.strokeStyle = "#fff";
  context.lineWidth = 1.7 * scale;
  context.lineCap = "round";
  context.lineJoin = "round";

  if (note.pitch !== null) {
    const whole = duration === "w";
    context.beginPath();
    context.ellipse(x(whole ? 12 : 7), y(whole ? 17 : 27),
      (whole ? 7 : 5) * scale, (whole ? 4.6 : 3.5) * scale, -0.35, 0, Math.PI * 2);
    if (whole || duration === "h") context.stroke();
    else context.fill();
    if (!whole) {
      context.beginPath();
      move(11.5, 26);
      line(11.5, 3);
      context.stroke();
      for (let flag = 0; flag < flags; flag += 1) {
        const offset = flag * 6;
        context.beginPath();
        move(11.5, 3 + offset);
        curve(12, 7 + offset, 21, 8 + offset, 17, 15 + offset);
        curve(20, 9 + offset, 14, 8 + offset, 11.5, 6 + offset);
        context.closePath();
        context.fill();
      }
    }
  } else if (duration === "w" || duration === "h") {
    context.beginPath();
    move(3, 17);
    line(21, 17);
    context.stroke();
    context.fillRect(x(5), y(duration === "w" ? 17 : 13), 14 * scale, 4 * scale);
  } else if (duration === "q") {
    context.beginPath();
    move(9, 3);
    line(16, 11);
    line(11, 17);
    line(16, 24);
    line(12, 22);
    curve(4, 21, 5, 28, 11, 31);
    curve(5, 29, 3, 25, 6, 21);
    line(9, 18);
    line(4, 10);
    line(10, 13);
    line(7, 6);
    context.closePath();
    context.fill();
  } else {
    context.beginPath();
    move(17, 3);
    line(8, 31);
    context.stroke();
    for (let flag = 0; flag < flags; flag += 1) {
      const cy = 8 + flag * 7;
      const stemX = 17 - (cy - 3) * 9 / 28;
      context.beginPath();
      move(stemX, cy - 2);
      curve(stemX - 1, cy + 4, stemX - 5, cy + 4, stemX - 7, cy + 1);
      context.stroke();
      dot(stemX - 7, cy, 2.5);
    }
  }
  if (notation.dotted) dot(22, note.pitch === null || duration === "w" ? 18 : 27, 1.5);
  context.restore();
}

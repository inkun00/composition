import { roundedVideoRect, type VideoTrackBounds } from "./practiceVideoLayout";

type PulseOptions = Readonly<{
  playheadX?: number;
  top?: number;
  bottom?: number;
}>;

/** Time-driven motion is identical in the preview and every encoded frame. */
export function drawPracticeVideoPulse(
  context: CanvasRenderingContext2D, seconds: number, startSeconds: number, endSeconds: number,
  bounds: VideoTrackBounds, options: PulseOptions = {}
): void {
  const progress = Math.max(0, Math.min(1,
    (seconds - startSeconds) / Math.max(0.001, endSeconds - startSeconds)));
  const attack = Math.exp(-progress * 4);
  const shimmer = (Math.sin(progress * Math.PI * 2) + 1) / 2;
  const expansion = 3 + progress * 9;
  context.save();
  context.strokeStyle = "#fff";
  context.fillStyle = "#fff";
  context.shadowColor = "rgba(255, 255, 255, 0.55)";
  context.shadowBlur = 10 + attack * 9;
  context.globalAlpha = 0.3 + attack * 0.4;
  context.lineWidth = 1.5;
  roundedVideoRect(context, bounds.x - expansion, bounds.y - expansion,
    bounds.width + expansion * 2, bounds.height + expansion * 2, 7);
  context.stroke();
  context.shadowBlur = 0;
  context.globalAlpha = (1 - progress) * 0.45;
  for (let index = 0; index < 3; index += 1) {
    const x = bounds.x + bounds.width * (index + 1) / 4;
    const y = bounds.y - 3 - progress * (9 + index * 3);
    context.beginPath();
    context.arc(x, y, 1.3 + attack, 0, Math.PI * 2);
    context.fill();
  }
  if (options.playheadX !== undefined && options.top !== undefined && options.bottom !== undefined) {
    context.globalAlpha = 0.4 + shimmer * 0.3;
    context.shadowBlur = 12;
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(options.playheadX, options.top);
    context.lineTo(options.playheadX, options.bottom);
    context.stroke();
  }
  context.restore();
}

import { pitchName } from "../music/score";
import {
  drawVideoText, measureFraction, practiceVideoTrackBounds, roundedVideoRect
} from "./practiceVideoLayout";
import { drawPracticeVideoPulse } from "./practiceVideoMotion";
import type { PracticeVideoMeasure, PracticeVideoNote, PracticeVideoPlan } from "./practiceVideoTypes";

function pitchRange(notes: readonly PracticeVideoNote[]): { low: number; high: number } {
  const pitches = notes.flatMap((note) => note.visualPitch === null ? [] : [note.visualPitch]);
  return { low: Math.min(60, ...pitches), high: Math.max(72, ...pitches) };
}

function barNoteLabel(note: PracticeVideoNote): string {
  if (note.rest) return "쉼";
  if (note.visualPitch === null) return "리듬";
  return pitchName(note.visualPitch, note.note.accidental);
}

function drawBarGrid(
  context: CanvasRenderingContext2D, x: number, top: number,
  width: number, height: number, lanes: number
): void {
  context.fillStyle = "rgba(255, 255, 255, 0.025)";
  context.fillRect(x, top, width, height);
  context.strokeStyle = "rgba(255, 255, 255, 0.13)";
  context.lineWidth = 1;
  for (let lane = 0; lane <= lanes; lane += 1) {
    const y = top + lane / lanes * height;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + width, y);
    context.stroke();
  }
}

export function drawPracticeVideoBars(
  context: CanvasRenderingContext2D, plan: PracticeVideoPlan,
  measures: readonly PracticeVideoMeasure[], seconds: number
): void {
  for (const [trackIndex, track] of plan.tracks.entries()) {
    context.save();
    const bounds = practiceVideoTrackBounds(trackIndex, plan.tracks.length);
    const gap = 16;
    const width = (bounds.width - gap * (measures.length - 1)) / measures.length;
    const chartTop = bounds.y + 6;
    const chartBottom = bounds.y + bounds.height - 30;
    const chartHeight = chartBottom - chartTop;
    const { low, high } = pitchRange(measures.flatMap((measure) => [...measure.tracks[trackIndex]]));
    const lanes = track.rhythm ? 1 : high - low + 1;
    const laneHeight = chartHeight / lanes;

    for (const [pageIndex, measure] of measures.entries()) {
      const x = bounds.x + pageIndex * (width + gap);
      drawBarGrid(context, x, chartTop, width, chartHeight, lanes);
      for (const note of measure.tracks[trackIndex]) {
        const noteStart = x + measureFraction(measure, note.startSeconds) * width;
        const noteEnd = x + measureFraction(measure, note.endSeconds) * width;
        const noteWidth = Math.max(2, noteEnd - noteStart - 3);
        const active = seconds >= note.startSeconds && seconds < note.endSeconds;
        const centerY = track.rhythm || note.rest
          ? chartTop + chartHeight / 2
          : chartTop + (high - note.visualPitch! + 0.5) * laneHeight;
        const height = track.rhythm || note.rest
          ? Math.min(44, chartHeight * 0.5)
          : Math.max(13, laneHeight - 1);
        const barBounds = {
          x: noteStart + 1, y: centerY - height / 2, width: noteWidth, height
        };
        context.fillStyle = active
          ? "rgba(255, 255, 255, 0.24)" : "rgba(255, 255, 255, 0.10)";
        roundedVideoRect(context, barBounds.x, barBounds.y, noteWidth, height, Math.min(5, height / 2));
        context.fill();
        context.strokeStyle = active ? "#fff" : "rgba(255, 255, 255, 0.45)";
        context.lineWidth = active ? 2 : 1;
        if (note.rest) context.setLineDash([5, 4]);
        context.stroke();
        context.setLineDash([]);

        if (active) {
          drawPracticeVideoPulse(context, seconds, note.startSeconds, note.endSeconds, barBounds, {
            playheadX: x + measureFraction(measure, seconds) * width,
            top: chartTop, bottom: chartBottom
          });
        }

        context.textAlign = "center";
        drawVideoText(context, barNoteLabel(note), barBounds.x + noteWidth / 2, centerY,
          Math.max(1, noteWidth - 6), Math.max(11, Math.min(19, height - 2)), "#fff", 700);
        drawVideoText(context, note.note.lyric?.trim() ?? "", noteStart + (noteEnd - noteStart) / 2,
          chartBottom + 18, Math.max(1, noteWidth - 2), 18, "#fff", active ? 700 : 500);
      }
    }
    context.restore();
  }
}

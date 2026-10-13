import { pitchName } from "../music/score";
import {
  drawVideoText, measureFraction, PRACTICE_VIDEO_COLORS,
  practiceVideoTrackBounds, roundedVideoRect
} from "./practiceVideoLayout";
import type { PracticeVideoMeasure, PracticeVideoNote, PracticeVideoPlan } from "./practiceVideoTypes";

function noteColor(note: PracticeVideoNote, trackIndex: number): string {
  if (note.rest) return "#e5e9ed";
  if (note.visualPitch === null) return PRACTICE_VIDEO_COLORS[trackIndex];
  const pitchClass = ((note.visualPitch % 12) + 12) % 12;
  return `hsl(${Math.round(pitchClass * 27 + 350) % 360} 59% 53%)`;
}

function pitchRange(notes: readonly PracticeVideoNote[]): { low: number; high: number } {
  const pitches = notes.flatMap((note) => note.visualPitch === null ? [] : [note.visualPitch]);
  return { low: Math.min(60, ...pitches), high: Math.max(72, ...pitches) };
}

function barNoteLabel(note: PracticeVideoNote): string {
  if (note.rest) return "쉼";
  if (note.visualPitch === null) return "리듬";
  return pitchName(note.visualPitch, note.note.accidental);
}

export function drawPracticeVideoBars(
  context: CanvasRenderingContext2D, plan: PracticeVideoPlan,
  measures: readonly PracticeVideoMeasure[], seconds: number
): void {
  for (const [trackIndex, track] of plan.tracks.entries()) {
    const bounds = practiceVideoTrackBounds(trackIndex, plan.tracks.length);
    const left = bounds.x + 58;
    const usable = bounds.width - 76;
    const gap = 18;
    const width = (usable - gap * (measures.length - 1)) / measures.length;
    const chartTop = bounds.y + 50;
    const chartBottom = bounds.y + bounds.height - 39;
    const chartHeight = chartBottom - chartTop;
    const { low, high } = pitchRange(measures.flatMap((measure) => [...measure.tracks[trackIndex]]));
    const laneHeight = Math.max(4, chartHeight / (high - low + 1));
    context.textAlign = "left";
    drawVideoText(context, `${trackIndex + 1}. ${track.instrumentName} · ${track.rhythm ? "리듬" : "가락"}`,
      bounds.x + 18, bounds.y + 22, bounds.width - 36, 20, PRACTICE_VIDEO_COLORS[trackIndex], 700);

    for (const [pageIndex, measure] of measures.entries()) {
      const x = left + pageIndex * (width + gap);
      const activeMeasure = seconds >= measure.startSeconds && seconds < measure.endSeconds;
      drawVideoText(context, `${measure.index + 1}마디`, x + width - 73, bounds.y + 22, 73, 16,
        activeMeasure ? "#207659" : "#73848b", activeMeasure ? 700 : 500);
      context.fillStyle = "#f7faf9";
      context.fillRect(x, chartTop, width, chartHeight);
      context.strokeStyle = "#dbe4e2";
      context.lineWidth = 1;
      const lanes = track.rhythm ? 1 : high - low + 1;
      for (let lane = 0; lane <= lanes; lane += 1) {
        const y = chartTop + lane / lanes * chartHeight;
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x + width, y);
        context.stroke();
      }
      for (const note of measure.tracks[trackIndex]) {
        const noteStart = x + measureFraction(measure, note.startSeconds) * width;
        const noteEnd = x + measureFraction(measure, note.endSeconds) * width;
        const noteWidth = Math.max(2, noteEnd - noteStart - 3);
        const active = seconds >= note.startSeconds && seconds < note.endSeconds;
        const centerY = track.rhythm || note.rest
          ? chartTop + chartHeight / 2
          : chartTop + (high - note.visualPitch! + 0.5) * laneHeight;
        const height = track.rhythm || note.rest ? Math.min(38, chartHeight * 0.5) : Math.max(7, laneHeight - 1);
        context.fillStyle = noteColor(note, trackIndex);
        roundedVideoRect(context, noteStart + 1, centerY - height / 2, noteWidth, height, Math.min(5, height / 2));
        context.fill();
        if (note.rest) {
          context.strokeStyle = "#9daab1";
          context.setLineDash([5, 4]);
          context.stroke();
          context.setLineDash([]);
        }
        if (active) {
          context.strokeStyle = "#163d34";
          context.lineWidth = 3;
          context.stroke();
        }
        if (track.rhythm && noteWidth >= 28) {
          context.textAlign = "center";
          drawVideoText(context, barNoteLabel(note), noteStart + (noteEnd - noteStart) / 2, centerY,
            noteWidth - 5, 14, note.rest ? "#596871" : "#fff", 700);
        }
        context.textAlign = "center";
        const lyric = note.note.lyric?.trim();
        const label = track.rhythm ? lyric ?? "" : `${barNoteLabel(note)}${lyric ? ` · ${lyric}` : ""}`;
        drawVideoText(context, label, noteStart + (noteEnd - noteStart) / 2, chartBottom + 21,
          Math.max(12, noteWidth - 2), 16, active ? "#156448" : "#4d626b", active ? 700 : 500);
        context.textAlign = "left";
      }
      if (activeMeasure) {
        const playheadX = x + measureFraction(measure, seconds) * width;
        context.strokeStyle = "#e3a21c";
        context.lineWidth = 4;
        context.beginPath();
        context.moveTo(playheadX, chartTop - 5);
        context.lineTo(playheadX, chartBottom + 5);
        context.stroke();
      }
      if (!track.rhythm && pageIndex === 0) {
        context.textAlign = "right";
        drawVideoText(context, pitchName(high), x - 8, chartTop + laneHeight / 2, 45, 13);
        drawVideoText(context, pitchName(low), x - 8, chartBottom - laneHeight / 2, 45, 13);
        context.textAlign = "left";
      }
    }
  }
}

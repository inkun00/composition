import { staffDegreeForPitch } from "../music/accidental";
import { pitchName } from "../music/score";
import { loadVexFlow } from "../music/vexflow";
import {
  drawVideoText, PRACTICE_VIDEO_COLORS, PRACTICE_VIDEO_HEIGHT, PRACTICE_VIDEO_WIDTH,
  practiceVideoTrackBounds, roundedVideoRect
} from "./practiceVideoLayout";
import { practiceVideoNotation } from "./practiceVideoNotation";
import type { PracticeVideoMeasure, PracticeVideoNote, PracticeVideoPlan } from "./practiceVideoTypes";

type VexModule = Awaited<ReturnType<typeof loadVexFlow>>;
type ScorePosition = Readonly<{ x: number; y: number; endX: number }>;
type ScorePage = Readonly<{ canvas: HTMLCanvasElement; positions: Map<PracticeVideoNote, ScorePosition> }>;

function createScorePage(
  plan: PracticeVideoPlan, measures: readonly PracticeVideoMeasure[], vex: VexModule
): ScorePage {
  const canvas = document.createElement("canvas");
  canvas.width = PRACTICE_VIDEO_WIDTH;
  canvas.height = PRACTICE_VIDEO_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("악보 화면을 만들 수 없어요.");
  const vexContext = new vex.CanvasContext(context);
  const positions = new Map<PracticeVideoNote, ScorePosition>();
  const noteShapes = new Map<PracticeVideoNote, InstanceType<VexModule["StaveNote"]>>();
  const trackCount = plan.tracks.length;

  for (const [trackIndex, track] of plan.tracks.entries()) {
    const bounds = practiceVideoTrackBounds(trackIndex, trackCount);
    const left = bounds.x + 18;
    const gap = 18;
    const width = (bounds.width - 36 - gap * (measures.length - 1)) / measures.length;
    // Fixed lyric rows stay below all C4–C5 noteheads and downward stems.
    const pitchLabelY = bounds.y + Math.min(132, bounds.height - 42);
    const lyricY = bounds.y + Math.min(154, bounds.height - 20);
    context.textAlign = "left";
    drawVideoText(context, `${trackIndex + 1}. ${track.instrumentName} · ${track.rhythm ? "리듬" : "가락"}`,
      left, bounds.y + 20, bounds.width - 36, 20, PRACTICE_VIDEO_COLORS[trackIndex], 700);

    for (const [pageIndex, measure] of measures.entries()) {
      const x = left + pageIndex * (width + gap);
      drawVideoText(context, `${measure.index + 1}마디`, x + width - 73, bounds.y + 20, 73, 16, "#647b84");
      const stave = new vex.Stave(x, bounds.y + 26, width, {
        spacingBetweenLinesPx: 10,
        spaceAboveStaffLn: 2,
        spaceBelowStaffLn: 2,
        leftBar: true,
        rightBar: true
      });
      if (pageIndex === 0) stave.addClef("treble").addTimeSignature(`${plan.meter.beats}/${plan.meter.beatUnit}`);
      stave.setEndBarType(measure === plan.measures[plan.measures.length - 1]
        ? vex.BarlineType.END : vex.BarlineType.SINGLE);
      stave.setStyle({ strokeStyle: "#849aa2", fillStyle: "#263e47" });
      stave.setContext(vexContext).draw();
      const notes = measure.tracks[trackIndex];
      if (!notes.length) continue;
      const alterations = new Map<number, number>();
      const staveNotes = notes.map((item) => {
        const notation = practiceVideoNotation(item.note);
        const shape = new vex.StaveNote({
          clef: "treble",
          keys: [notation.key],
          duration: notation.duration,
          autoStem: true
        });
        let accidental = notation.accidental;
        if (item.note.pitch !== null) {
          const degree = staffDegreeForPitch(item.note.pitch, item.note.accidental);
          const alteration = accidental === "#" ? 1 : accidental === "b" ? -1 : 0;
          // A natural following a sharp/flat must cancel that accidental within a bar.
          if (!accidental && (alterations.get(degree) ?? 0) !== alteration) accidental = "n";
          alterations.set(degree, alteration);
        }
        if (accidental) shape.addModifier(new vex.Accidental(accidental));
        if (notation.dotted) vex.Dot.buildAndAttach([shape], { all: true });
        shape.setStyle({ fillStyle: "#263e47", strokeStyle: "#263e47" });
        noteShapes.set(item, shape);
        return shape;
      });
      const voice = new vex.Voice({ numBeats: plan.meter.beats, beatValue: plan.meter.beatUnit })
        .setMode(vex.Voice.Mode.SOFT).addTickables(staveNotes);
      new vex.Formatter({ softmaxFactor: 1.2 }).joinVoices([voice])
        .format([voice], Math.max(60, stave.getNoteEndX() - stave.getNoteStartX() - 24));
      const beams = vex.Beam.generateBeams(staveNotes, {
        groups: vex.Beam.getDefaultBeamGroups(`${plan.meter.beats}/${plan.meter.beatUnit}`)
      });
      voice.draw(vexContext, stave);
      beams.forEach((beam) => beam.setContext(vexContext).draw());
      staveNotes.forEach((shape, index) => {
        const note = notes[index];
        const noteX = shape.getAbsoluteX();
        const nextX = staveNotes[index + 1]?.getAbsoluteX() ?? stave.getNoteEndX() - 8;
        positions.set(note, { x: noteX, y: shape.getYs()[0], endX: nextX });
        context.textAlign = "center";
        const maxWidth = Math.max(16, nextX - noteX - 6);
        drawVideoText(context, note.rest ? "쉼표" : pitchName(note.note.pitch, note.note.accidental),
          noteX + 5, pitchLabelY, maxWidth, 14, "#506a75", 600);
        drawVideoText(context, note.note.lyric?.trim() ?? "", noteX + 5, lyricY, maxWidth, 18, "#263e47", 600);
        context.textAlign = "left";
      });
    }

    const authoredNotes = plan.measures.flatMap((measure) => [...measure.tracks[trackIndex]]);
    for (const [index, item] of authoredNotes.entries()) {
      const next = authoredNotes[index + 1];
      if (!item.note.linkToNext || !next || item.rest || next.rest) continue;
      if (Math.abs(item.endSeconds - next.startSeconds) > 0.000001) continue;
      const first = noteShapes.get(item);
      const last = noteShapes.get(next);
      if (!first && !last) continue;
      // Partial curves at a page edge preserve links into the following system.
      if (item.note.pitch === next.note.pitch) {
        new vex.StaveTie({ firstNote: first, lastNote: last, firstIndexes: [0], lastIndexes: [0] })
          .setContext(vexContext).draw();
      } else {
        new vex.Curve(first, last, { position: vex.Curve.Position.NEAR_HEAD, openingDirection: "down" })
          .setContext(vexContext).draw();
      }
    }
  }
  return { canvas, positions };
}

export async function preparePracticeVideoScore(plan: PracticeVideoPlan): Promise<(
  context: CanvasRenderingContext2D, measures: readonly PracticeVideoMeasure[], seconds: number
) => void> {
  const vex = await loadVexFlow();
  const pages = new Map<string, ScorePage>();
  return (context, measures, seconds) => {
    const key = measures.map((measure) => measure.index).join(":");
    let page = pages.get(key);
    if (!page) {
      page = createScorePage(plan, measures, vex);
      pages.set(key, page);
    }
    for (const [trackIndex] of plan.tracks.entries()) {
      const bounds = practiceVideoTrackBounds(trackIndex, plan.tracks.length);
      for (const measure of measures) {
        for (const note of measure.tracks[trackIndex]) {
          if (seconds < note.startSeconds || seconds >= note.endSeconds) continue;
          const position = page.positions.get(note);
          if (!position) continue;
          context.fillStyle = "#ffe49a";
          roundedVideoRect(context, position.x - 10, position.y - 15, 33, 32, 8);
          context.fill();
          context.strokeStyle = "#248466";
          context.lineWidth = 3;
          context.stroke();
          const fraction = (seconds - note.startSeconds) / (note.endSeconds - note.startSeconds);
          const x = position.x + fraction * (position.endX - position.x);
          context.strokeStyle = "#e5a122";
          context.lineWidth = 3;
          context.beginPath();
          context.moveTo(x, bounds.y + 36);
          context.lineTo(x, bounds.y + Math.min(114, bounds.height - 51));
          context.stroke();
        }
      }
    }
    context.drawImage(page.canvas, 0, 0);
  };
}

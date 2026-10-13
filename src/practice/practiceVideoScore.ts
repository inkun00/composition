import { staffDegreeForPitch } from "../music/accidental";
import { loadVexFlow } from "../music/vexflow";
import {
  drawVideoText, PRACTICE_VIDEO_HEIGHT, PRACTICE_VIDEO_WIDTH, practiceVideoTrackBounds
} from "./practiceVideoLayout";
import { drawPracticeVideoPulse } from "./practiceVideoMotion";
import { practiceVideoNotation } from "./practiceVideoNotation";
import type { PracticeVideoMeasure, PracticeVideoNote, PracticeVideoPlan } from "./practiceVideoTypes";

type VexModule = Awaited<ReturnType<typeof loadVexFlow>>;
type ScorePosition = Readonly<{ x: number; y: number; endX: number; top: number; bottom: number }>;
type ScorePage = Readonly<{ canvas: HTMLCanvasElement; positions: Map<PracticeVideoNote, ScorePosition> }>;
const SCORE_INK = "#ffffff";
const SCORE_STYLE = { fillStyle: SCORE_INK, strokeStyle: SCORE_INK };

function createScorePage(
  plan: PracticeVideoPlan, measures: readonly PracticeVideoMeasure[], vex: VexModule
): ScorePage {
  const canvas = document.createElement("canvas");
  canvas.width = PRACTICE_VIDEO_WIDTH;
  canvas.height = PRACTICE_VIDEO_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("악보 화면을 만들 수 없어요.");
  context.fillStyle = SCORE_INK;
  context.strokeStyle = SCORE_INK;
  const vexContext = new vex.CanvasContext(context);
  const positions = new Map<PracticeVideoNote, ScorePosition>();
  const noteShapes = new Map<PracticeVideoNote, InstanceType<VexModule["StaveNote"]>>();
  const trackCount = plan.tracks.length;

  for (const [trackIndex] of plan.tracks.entries()) {
    const bounds = practiceVideoTrackBounds(trackIndex, trackCount);
    const left = bounds.x + 18;
    const width = (bounds.width - 36) / measures.length;
    const staveY = bounds.y + (bounds.height - 144) / 2;
    // The lyric row stays below C4–C5 noteheads, stems, and connecting curves.
    const lyricY = staveY + 114;

    for (const [pageIndex, measure] of measures.entries()) {
      const x = left + pageIndex * width;
      const stave = new vex.Stave(x, staveY, width, {
        spacingBetweenLinesPx: 10,
        spaceAboveStaffLn: 2,
        spaceBelowStaffLn: 2,
        // The previous stave's end bar is the next measure's shared boundary.
        leftBar: pageIndex === 0,
        rightBar: true
      });
      if (pageIndex === 0) stave.addClef("treble");
      if (measure.index === 0) stave.addTimeSignature(`${plan.meter.beats}/${plan.meter.beatUnit}`);
      stave.setEndBarType(measure === plan.measures[plan.measures.length - 1]
        ? vex.BarlineType.END : vex.BarlineType.SINGLE);
      stave.setStyle(SCORE_STYLE);
      stave.setContext(vexContext).drawWithStyle();
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
        if (accidental) shape.addModifier(new vex.Accidental(accidental).setStyle(SCORE_STYLE));
        if (notation.dotted) vex.Dot.buildAndAttach([shape], { all: true });
        shape.setStyle(SCORE_STYLE);
        shape.setLedgerLineStyle(SCORE_STYLE);
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
      beams.forEach((beam) => beam.setStyle(SCORE_STYLE).setContext(vexContext).drawWithStyle());
      staveNotes.forEach((shape, index) => {
        const note = notes[index];
        const noteX = shape.getAbsoluteX();
        const nextX = staveNotes[index + 1]?.getAbsoluteX() ?? stave.getNoteEndX() - 8;
        positions.set(note, {
          x: noteX,
          y: shape.getYs()[0],
          endX: nextX,
          top: staveY + 5,
          bottom: lyricY + 14
        });
        context.textAlign = "center";
        const maxWidth = Math.max(16, nextX - noteX - 6);
        drawVideoText(context, note.note.lyric?.trim() ?? "", noteX + 5, lyricY, maxWidth, 20, SCORE_INK, 600);
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
          .setStyle(SCORE_STYLE).setContext(vexContext).drawWithStyle();
      } else {
        new vex.Curve(first, last, { position: vex.Curve.Position.NEAR_HEAD, openingDirection: "down" })
          .setStyle(SCORE_STYLE).setContext(vexContext).drawWithStyle();
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
      for (const measure of measures) {
        for (const note of measure.tracks[trackIndex]) {
          if (seconds < note.startSeconds || seconds >= note.endSeconds) continue;
          const position = page.positions.get(note);
          if (!position) continue;
          const fraction = (seconds - note.startSeconds) / (note.endSeconds - note.startSeconds);
          const x = position.x + fraction * (position.endX - position.x);
          drawPracticeVideoPulse(context, seconds, note.startSeconds, note.endSeconds, {
            x: position.x - 9, y: position.y - 11, width: 29, height: 22
          }, { playheadX: x, top: position.top, bottom: position.bottom });
        }
      }
    }
    context.drawImage(page.canvas, 0, 0);
  };
}

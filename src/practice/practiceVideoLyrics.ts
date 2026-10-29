import { PRACTICE_VIDEO_FONT, PRACTICE_VIDEO_HEIGHT, PRACTICE_VIDEO_WIDTH } from "./practiceVideoLayout";
import { practiceVideoMeasureAtTime } from "./practiceVideoPlan";
import type { PracticeVideoNote, PracticeVideoPlan } from "./practiceVideoTypes";
import { drawPracticeLyricGlyph, type PracticeLyricGlyph } from "./practiceVideoLyricHighlight";

type LyricGlyph = PracticeLyricGlyph;
type PositionedGlyph = LyricGlyph & Readonly<{ x: number; width: number }>;
type LyricLine = Readonly<{
  glyphs: readonly PositionedGlyph[]; startSeconds: number; endSeconds: number;
}>;
type LyricTrack = Readonly<{ size: number; lines: readonly LyricLine[]; visibleRows: number }>;

const SIDE_MARGIN = 80;
const VERTICAL_MARGIN = 72;
const TRACK_GAP = 24;
const MAX_FONT_SIZE = 56;
const MIN_FONT_SIZE = 24;

function lyricGlyphs(notes: readonly PracticeVideoNote[]): LyricGlyph[] {
  return notes.flatMap((event, eventIndex) => {
    if (event.rest) return [];
    const characters = Array.from(event.note.lyric?.trim() ?? "");
    let endSeconds = event.endSeconds;
    // A tied note with no new words continues the previous sung syllable.
    let previous = event;
    for (const next of notes.slice(eventIndex + 1)) {
      if (!previous.note.linkToNext || next.rest || next.note.pitch !== previous.note.pitch ||
          next.note.lyric?.trim() || Math.abs(next.startSeconds - previous.endSeconds) > 0.000001) break;
      endSeconds = next.endSeconds;
      previous = next;
    }
    return characters.map((text, index) => ({
      text,
      startSeconds: event.startSeconds + (event.endSeconds - event.startSeconds) * index / characters.length,
      endSeconds: index === characters.length - 1 ? endSeconds :
        event.startSeconds + (event.endSeconds - event.startSeconds) * (index + 1) / characters.length
    }));
  });
}

function wrapLyrics(context: CanvasRenderingContext2D, glyphs: readonly LyricGlyph[], size: number): LyricLine[] {
  context.font = `600 ${size}px ${PRACTICE_VIDEO_FONT}`;
  const lines: LyricLine[] = [];
  let current: LyricGlyph[] = [];
  const flush = () => {
    if (!current.length) return;
    const text = current.map((glyph) => glyph.text).join("");
    const left = (PRACTICE_VIDEO_WIDTH - context.measureText(text).width) / 2;
    let prefix = "";
    lines.push({
      glyphs: current.map((glyph) => {
        const start = context.measureText(prefix).width;
        prefix += glyph.text;
        const width = context.measureText(prefix).width - start;
        return { ...glyph, x: left + start + width / 2, width };
      }),
      startSeconds: current[0].startSeconds,
      endSeconds: current[current.length - 1].endSeconds
    });
    current = [];
  };
  for (const glyph of glyphs) {
    if (glyph.text === "\n") {
      flush();
      continue;
    }
    const candidate = current.map((part) => part.text).join("") + glyph.text;
    if (current.length && context.measureText(candidate).width > PRACTICE_VIDEO_WIDTH - SIDE_MARGIN * 2) flush();
    current.push(glyph);
  }
  flush();
  return lines;
}

function fitLyrics(context: CanvasRenderingContext2D, glyphs: readonly LyricGlyph[], height: number): LyricTrack {
  for (let size = MAX_FONT_SIZE; size >= MIN_FONT_SIZE; size -= 2) {
    const lines = wrapLyrics(context, glyphs, size);
    const visibleRows = Math.max(1, Math.floor(height / (size * 1.35)));
    if (lines.length <= visibleRows || size === MIN_FONT_SIZE) return { size, lines, visibleRows };
  }
  return { size: MIN_FONT_SIZE, lines: [], visibleRows: 1 };
}

function visibleLyrics(track: LyricTrack, seconds: number): readonly LyricLine[] {
  if (track.lines.length <= track.visibleRows) return track.lines;
  const active = track.lines.findIndex((line) => seconds < line.endSeconds);
  const current = active < 0 ? track.lines.length - 1 : active;
  const first = Math.floor(current / track.visibleRows) * track.visibleRows;
  return track.lines.slice(first, first + track.visibleRows);
}

/** Keep words visible through rests and animate each sung syllable on audio time. */
export function preparePracticeVideoLyrics(
  context: CanvasRenderingContext2D, plan: PracticeVideoPlan
): (seconds: number) => void {
  const layouts = new Map(plan.measures.map((measure) => {
    const authored = measure.tracks.map(lyricGlyphs).filter((glyphs) => glyphs.length > 0);
    const height = (PRACTICE_VIDEO_HEIGHT - VERTICAL_MARGIN * 2 - TRACK_GAP * (authored.length - 1)) /
      Math.max(1, authored.length);
    return [measure.index, { height, tracks: authored.map((glyphs) => fitLyrics(context, glyphs, height)) }] as const;
  }));

  return (seconds) => {
    const measure = practiceVideoMeasureAtTime(plan.measures, seconds);
    const layout = layouts.get(measure.index);
    if (!layout) return;
    context.save();
    context.fillStyle = "#fff";
    context.globalAlpha = 1;
    context.textAlign = "center";
    context.textBaseline = "middle";
    for (const [index, track] of layout.tracks.entries()) {
      const lines = visibleLyrics(track, seconds);
      const lineHeight = track.size * 1.35;
      const center = VERTICAL_MARGIN + index * (layout.height + TRACK_GAP) + layout.height / 2;
      const firstY = center - (lines.length - 1) * lineHeight / 2;
      context.font = `600 ${track.size}px ${PRACTICE_VIDEO_FONT}`;
      for (const [row, line] of lines.entries()) {
        for (const glyph of line.glyphs) {
          drawPracticeLyricGlyph(context, glyph, glyph.x, firstY + row * lineHeight,
            glyph.width, track.size, seconds);
        }
      }
    }
    context.restore();
  };
}

import { toNumber } from "../music/rational";
import type { SharedComposition } from "../music/share";

export type QrLyricToken = Readonly<{
  id: string;
  text: string;
  startSeconds: number;
  endSeconds: number;
}>;

export type QrLyricLine = Readonly<{
  measureIndex: number;
  startSeconds: number;
  endSeconds: number;
  tokens: readonly QrLyricToken[];
}>;

export function buildQrLyricLines(
  composition: SharedComposition,
  bpm = 96
): readonly QrLyricLine[] {
  const secondsPerBeat = 60 / bpm;
  let songCursor = 0;

  return composition.measures.flatMap((measure, measureIndex) => {
    const hasNoteLyrics = measure.notes.some((note) => note.pitch !== null && note.lyric?.trim());
    const legacySyllables = Array.from((composition.lyrics[measureIndex] ?? "").replace(/\s+/g, ""));
    let syllableIndex = 0;
    let noteCursor = songCursor;
    const tokens: QrLyricToken[] = [];

    measure.notes.forEach((note, noteIndex) => {
      const duration = toNumber(note.duration) * secondsPerBeat;
      if (note.pitch !== null) {
        const text = hasNoteLyrics ? note.lyric?.trim() ?? "" : legacySyllables[syllableIndex++] ?? "";
        if (text) {
          tokens.push({
            id: `qr-lyric-${measureIndex}-${noteIndex}`,
            text,
            startSeconds: noteCursor,
            endSeconds: noteCursor + duration
          });
        }
      }
      noteCursor += duration;
    });

    const line: QrLyricLine = {
      measureIndex,
      startSeconds: songCursor,
      endSeconds: noteCursor,
      tokens
    };
    songCursor = noteCursor;
    return tokens.length > 0 ? [line] : [];
  });
}

export function activeQrLyrics(lines: readonly QrLyricLine[], elapsedSeconds: number): Readonly<{
  measureIndex: number | null;
  tokenId: string | null;
}> {
  const line = lines.find((item) =>
    elapsedSeconds >= item.startSeconds && elapsedSeconds < item.endSeconds);
  const token = line?.tokens.find((item) =>
    elapsedSeconds >= item.startSeconds && elapsedSeconds < item.endSeconds);
  return { measureIndex: line?.measureIndex ?? null, tokenId: token?.id ?? null };
}

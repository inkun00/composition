import { useState, type ReactNode, type Ref } from "react";
import { positionNotes } from "../music/score";
import { scoreLayout } from "../music/scoreLayout";
import type { PlaybackMeasure } from "../audio/accompanimentScore";
import ScoreMeasure from "../components/ScoreMeasure";
import { TEXTBOOK_CHORDS, TEXTBOOK_LYRICS, TEXTBOOK_METER, TEXTBOOK_SONG_TITLE } from "./textbookScore";

type MeasureProps = {
  measure: PlaybackMeasure;
  index: number;
  playingNoteId?: string | null;
  connected?: boolean;
  alignedLyrics?: boolean;
  children?: ReactNode;
};

export function TextbookStaff({ measure, index, playingNoteId, connected = false, alignedLyrics = false, children }: MeasureProps) {
  const chord = TEXTBOOK_CHORDS[index];
  const signature = !connected || index % 4 === 0;
  const { width, noteStartX } = scoreLayout({ compact: true, showSignature: signature });
  const [layout, setLayout] = useState<Record<string, { x: number; y: number }>>({});
  const hasLyrics = alignedLyrics && measure.notes.some((note) => note.lyric);
  return <div className="textbook-staff" data-bar={index + 1} data-playing={Boolean(playingNoteId)}>
    <div className="textbook-staff-head">
      <span><strong>{index + 1}마디</strong><span className={`textbook-chord chord-${chord.chord}`} aria-label={`${chord.symbol} 화음 ${chord.chord}`}>{chord.symbol}</span></span>
      {children}
    </div>
    <ScoreMeasure notes={measure.notes} meter={TEXTBOOK_METER} compact connectedSystem={connected} showSignature={signature}
      endBarline={index === 7 ? "final" : "single"} playingNoteId={playingNoteId}
      renderBackend={connected ? "canvas" : "svg"}
      onNoteLayout={alignedLyrics ? setLayout : undefined} />
    <div className={`textbook-lyrics${hasLyrics ? " is-aligned" : ""}`} aria-label={TEXTBOOK_LYRICS[index]}>
      {hasLyrics ? positionNotes(measure.notes).filter((note) => note.lyric).map((note) => {
        const x = layout[note.id]?.x ?? noteStartX + note.onset / 4 * (width - noteStartX - 18);
        return <span key={note.id} style={{ left: `${x / width * 100}%` }}>{note.lyric}</span>;
      }) : TEXTBOOK_LYRICS[index]}
    </div>
  </div>;
}

export function TextbookPrintSheet({ measures, creator, tempo, sheetRef }: {
  measures: readonly PlaybackMeasure[];
  creator: string;
  tempo: string;
  sheetRef: Ref<HTMLElement>;
}) {
  return <div className="textbook-print-host" aria-hidden="true">
    <article className="textbook-print-sheet" ref={sheetRef}>
      <h1>{TEXTBOOK_SONG_TITLE}</h1>
      <div className="textbook-print-meta"><span>{tempo}</span><span>{creator.trim()} 작곡</span></div>
      {[0, 4].map((start) => <div className="textbook-print-system" key={start}>
        {measures.slice(start, start + 4).map((measure, index) => <TextbookStaff key={start + index}
          measure={measure} index={start + index} connected alignedLyrics />)}
      </div>)}
    </article>
  </div>;
}

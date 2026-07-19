import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { measureCapacity, type Meter } from "../music/meter";
import type { NoteEvent } from "../music/types";
import { chordMidiPitches } from "../music/chord";
import { rational, toNumber } from "../music/rational";
import { positionNotes } from "../music/score";
import { scoreLayout } from "../music/scoreLayout";
import ScoreMeasure from "./ScoreMeasure";

export type PrintableMeasure = Readonly<{
  candidateName: string;
  notes: readonly NoteEvent[];
  chords: readonly string[];
}>;

type PdfScoreSheetProps = {
  title: string;
  description: string;
  creator: string;
  originalCreator: string;
  meter: Meter;
  measures: readonly PrintableMeasure[];
  includeAccompaniment: boolean;
  preview?: boolean;
};

const PDF_PAGE_WIDTH = 794;
const PDF_PAGE_HEIGHT = 1123;

function PdfPreviewPage({ children }: Readonly<{ children: ReactNode }>) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const updateScale = () => setScale(Math.min(1, shell.clientWidth / PDF_PAGE_WIDTH));
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(shell);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={shellRef} className="pdf-preview-page-shell" style={{ height: `${PDF_PAGE_HEIGHT * scale}px` }}>
      <div className="pdf-preview-page-scale" style={{ transform: `scale(${scale})` }}>{children}</div>
    </div>
  );
}

function PdfMeasureLyrics({ notes, meter, showSignature, notePositions }: Readonly<{
  notes: readonly NoteEvent[];
  meter: Meter;
  showSignature: boolean;
  notePositions?: Record<string, { x: number; y: number }>;
}>) {
  const { width, noteStartX } = scoreLayout({ compact: true, showSignature });
  const capacity = toNumber(measureCapacity(meter));
  const usableWidth = width - noteStartX - 8;
  const pitched = positionNotes(notes).filter((note) => note.pitch !== null);

  return (
    <div className="pdf-measure-lyrics">
      {pitched.map((note) => {
        const x = notePositions?.[note.id]?.x ?? noteStartX + (note.onset / capacity) * usableWidth + 10;
        return <span key={note.id} className="pdf-lyric-syllable" style={{ left: `${x / width * 100}%` }}>
          {note.lyric || " "}
        </span>;
      })}
    </div>
  );
}

function fitPitchToStaff(pitch: number, min: number, max: number): number {
  let fitted = pitch;
  while (fitted < min) fitted += 12;
  while (fitted > max) fitted -= 12;
  return Math.max(min, Math.min(max, fitted));
}

function accompanimentNotes(chords: readonly string[], meter: Meter, voice: "right" | "left"): readonly NoteEvent[] {
  const capacity = toNumber(measureCapacity(meter));
  const chordList = chords.length > 0 ? chords : ["C"];
  const unit = rational(Math.max(1, Math.round(capacity * 4 / (chordList.length * 2))), 4);
  return chordList.flatMap((chord, chordIndex) => {
    const pitches = chordMidiPitches(chord);
    const root = pitches[0];
    const upper = pitches.slice(1, 4);
    if (voice === "left") {
      const bassPitch = fitPitchToStaff(root, 52, 64);
      return [
        { id: `pdf-bass-${chordIndex}-a`, pitch: bassPitch, duration: unit },
        { id: `pdf-bass-${chordIndex}-b`, pitch: bassPitch, duration: unit }
      ];
    }
    return upper.slice(0, 2).map((pitch, noteIndex) => ({
      id: `pdf-accomp-${chordIndex}-${noteIndex}`,
      pitch: fitPitchToStaff(pitch, 60, 72),
      duration: unit
    }));
  }).slice(0, Math.max(1, chordList.length * 2));
}

function chunk<T>(items: readonly T[], size: number): readonly T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, index * size + size)
  );
}

export default function PdfScoreSheet({
  title, description, creator, originalCreator, meter, measures, includeAccompaniment, preview = false
}: PdfScoreSheetProps) {
  const printableTitle = title || "나의 노래";
  // Keep student titles on one centered line while still allowing long names.
  const titleFontSize = Math.max(14, Math.min(30, Math.floor(700 / Math.max(1, printableTitle.length))));
  const [melodyNotePositions, setMelodyNotePositions] = useState<
    Record<string, Record<string, { x: number; y: number }>>
  >({});
  const updateMelodyNotePositions = useCallback((measureKey: string,
    positions: Record<string, { x: number; y: number }>) => {
    setMelodyNotePositions((current) => {
      const previous = current[measureKey] ?? {};
      const changed = Object.keys(previous).length !== Object.keys(positions).length ||
        Object.entries(positions).some(([id, position]) =>
          Math.abs((previous[id]?.x ?? -9999) - position.x) > 0.5 ||
          Math.abs((previous[id]?.y ?? -9999) - position.y) > 0.5);
      return changed ? { ...current, [measureKey]: positions } : current;
    });
  }, []);
  // Melody-only sheets fit four four-bar systems per page; accompaniment sheets
  // need twice the vertical room for the piano staff.
  const pages = chunk(measures, includeAccompaniment ? 8 : 16);

  return (
    <div className={preview ? "pdf-document pdf-preview-document" : "pdf-document"} aria-hidden={!preview}>
      {pages.map((pageMeasures, pageIndex) => {
        const systems = chunk(pageMeasures, 4);
        const page = (
          <section className="pdf-page" data-pdf-page={preview ? undefined : "true"}>
            <header className="pdf-header">
              <h1 style={{ fontSize: `${titleFontSize}px` }}>{printableTitle}</h1>
              {pageIndex === 0 && description.trim() && (
                <section className="pdf-description" aria-label="이 노래에 대한 이야기">
                  <strong>이 노래에 대한 이야기</strong>
                  <p>{description}</p>
                </section>
              )}
              <div className="pdf-meta">
                <span>{creator || "어린이 작곡가"} 작곡</span>
              </div>
            </header>
            {originalCreator && originalCreator !== creator && (
              <p className="pdf-original">원작자 {originalCreator} · 이 표시는 리메이크 악보에서 지울 수 없습니다.</p>
            )}
            <div className={includeAccompaniment ? "pdf-score-systems with-accompaniment" : "pdf-score-systems melody-only"}>
              {systems.map((system, systemIndex) => (
                <section className={includeAccompaniment ? "pdf-system with-accompaniment" : "pdf-system melody-only"} key={systemIndex}>
                  <div className="pdf-melody-row">
                    {system.map((measure, localIndex) => (
                      <article className="pdf-system-measure" key={localIndex}>
                        <ScoreMeasure notes={measure.notes} meter={meter} compact
                          renderBackend="canvas" showSignature={localIndex === 0} systemMeasure connectedSystem
                          endBarline={pageIndex * (includeAccompaniment ? 8 : 16) + systemIndex * 4 + localIndex === measures.length - 1
                            ? "final" : "single"}
                          onNoteLayout={(positions) => updateMelodyNotePositions(
                            `${pageIndex}-${systemIndex}-${localIndex}`, positions)} />
                      </article>
                    ))}
                  </div>
                  <div className="pdf-lyrics-row">
                    {system.map((measure, localIndex) => (
                      <article className="pdf-system-measure" key={localIndex}>
                        <PdfMeasureLyrics notes={measure.notes} meter={meter} showSignature={localIndex === 0}
                          notePositions={melodyNotePositions[`${pageIndex}-${systemIndex}-${localIndex}`]} />
                      </article>
                    ))}
                  </div>
                  {includeAccompaniment && <div className="pdf-piano-system">
                    <div className="pdf-brace">{"{"}</div>
                    <div className="pdf-piano-rows">
                      <div className="pdf-accomp-row">
                        {system.map((measure, localIndex) => (
                          <article className="pdf-system-measure" key={localIndex}>
                            <ScoreMeasure notes={accompanimentNotes(measure.chords, meter, "right")} meter={meter}
                              compact renderBackend="canvas" showSignature={localIndex === 0} systemMeasure connectedSystem
                              endBarline={pageIndex * 8 + systemIndex * 4 + localIndex === measures.length - 1
                                ? "final" : "single"} />
                          </article>
                        ))}
                      </div>
                      <div className="pdf-accomp-row bass">
                        {system.map((measure, localIndex) => (
                          <article className="pdf-system-measure" key={localIndex}>
                            <ScoreMeasure notes={accompanimentNotes(measure.chords, meter, "left")} meter={meter}
                              compact renderBackend="canvas" showSignature={localIndex === 0} systemMeasure connectedSystem
                              endBarline={pageIndex * 8 + systemIndex * 4 + localIndex === measures.length - 1
                                ? "final" : "single"} />
                          </article>
                        ))}
                      </div>
                    </div>
                  </div>}
                </section>
              ))}
            </div>
          </section>
        );
        return preview
          ? <PdfPreviewPage key={pageIndex}>{page}</PdfPreviewPage>
          : <div key={pageIndex}>{page}</div>;
      })}
    </div>
  );
}

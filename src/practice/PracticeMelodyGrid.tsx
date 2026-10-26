import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { accidentalSymbol, staffDegreeForPitch } from "../music/accidental";
import { toNumber } from "../music/rational";
import { pitchName, type PositionedNote } from "../music/score";
import type { NoteEvent } from "../music/types";
import { PRACTICE_PITCHES } from "./practicePitch";
import { beatText, positionStyle, TimelineBase } from "./practiceTimeline";
import { usePracticeGridFocus } from "./usePracticeGridFocus";
import "./PracticeMelodyGrid.css";

function noteLabel(note: NoteEvent): string {
  if (note.pitch === null) return "쉼표";
  return PRACTICE_PITCHES.find((entry) => entry.pitch === note.pitch)?.label ?? pitchName(note.pitch, note.accidental);
}

function gridPitch(note: NoteEvent): number | null {
  if (note.pitch === null) return null;
  const degree = staffDegreeForPitch(note.pitch, note.accidental);
  return PRACTICE_PITCHES.find((entry) => staffDegreeForPitch(entry.pitch) === degree)?.pitch ?? null;
}

export default function PracticeMelodyGrid({ notes, slots, capacity, slotsPerBeat, total, selectedNoteId, playingNoteId, disabled, onSelectNote, onPitch, onAppendPitch, children }: {
  notes: readonly PositionedNote[];
  slots: number;
  capacity: number;
  slotsPerBeat: number;
  total: number;
  selectedNoteId: string | null;
  playingNoteId?: string | null;
  disabled: boolean;
  onSelectNote: (id: string) => void;
  onPitch: (id: string, pitch: number) => void;
  onAppendPitch?: (pitch: number, onset: number) => void;
  children: ReactNode;
}) {
  const emptySlots = onAppendPitch ? Array.from({ length: slots }, (_, index) => index)
    .filter((index) => index / slotsPerBeat >= total && index / slotsPerBeat < capacity) : [];
  const pitches = [...PRACTICE_PITCHES].reverse();
  const keys = pitches.flatMap((entry) => [
    ...notes.filter((note) => note.pitch !== null || entry.pitch === 65).map((note) => `${note.id}-${entry.pitch}`),
    ...emptySlots.map((slot) => `empty-${entry.pitch}-${slot}`)
  ]);
  const selected = notes.find((note) => note.id === selectedNoteId);
  const preferred = selected ? `${selected.id}-${gridPitch(selected) ?? 65}`
    : emptySlots.length ? `empty-72-${emptySlots[0]}` : undefined;
  const focus = usePracticeGridFocus(keys, preferred);
  const viewport = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  const [scrollbarWidth, setScrollbarWidth] = useState(0);
  const playing = notes.find((note) => note.id === playingNoteId);

  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    function revealNote() {
      if (!element || element.clientHeight === 0) return;
      setScrollbarWidth(element.offsetWidth - element.clientWidth);
      if (!initialized.current) {
        element.scrollTop = element.scrollHeight - element.clientHeight;
        initialized.current = true;
      }
      const active = element.querySelector(".is-playing") ?? element.querySelector(".is-selected")
        ?? (!selected && !playing ? element.querySelector(".is-filled") : null);
      const row = active?.closest(".practice-melody-row");
      if (!row) return;
      const bounds = row.getBoundingClientRect();
      const top = bounds.top - element.getBoundingClientRect().top - element.clientTop + element.scrollTop;
      if (top < element.scrollTop) element.scrollTop = top;
      else if (top + bounds.height > element.scrollTop + element.clientHeight) {
        element.scrollTop = top + bounds.height - element.clientHeight;
      }
    }
    revealNote();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(revealNote);
    observer.observe(element);
    return () => observer.disconnect();
  }, [selectedNoteId, selected?.pitch, selected?.accidental, playingNoteId, playing?.pitch]);
  return (
    <div className="practice-melody-grid" style={{ "--practice-melody-scrollbar-width": `${scrollbarWidth}px` } as CSSProperties}>
      <div ref={viewport} className="practice-melody-viewport" data-testid="practice-melody-viewport"
        role="region" aria-label="가락 음높이, 위로 스크롤하면 더 높은 음을 넣을 수 있어요">
        <div ref={focus.ref} className="practice-melody-rows" aria-label="낮은 도부터 더 높은 도까지 가락 칸 채우기, 방향키로 이동" onKeyDown={focus.onKeyDown}>
          {pitches.map((entry, row) => (
            <div key={entry.pitch} className="practice-melody-row" data-pitch-row={entry.pitch}>
              <span className="practice-pitch-row-label" style={{ backgroundColor: entry.color }}>{entry.label}</span>
              <div className="practice-melody-timeline">
                <TimelineBase slots={slots} capacity={capacity} slotsPerBeat={slotsPerBeat} />
                {emptySlots.map((slot) => (
                  <button key={`empty-${slot}`} type="button" disabled={disabled}
                    {...focus.cell(`empty-${entry.pitch}-${slot}`, row, slot / slotsPerBeat)}
                    className="practice-empty-slot practice-melody-empty-slot"
                    style={{ left: `${slot / slots * 100}%`, width: `${1 / slots * 100}%` }}
                    data-testid={`practice-melody-empty-${entry.pitch}-${slot}`}
                    aria-label={`${entry.label} ${beatText(slot / slotsPerBeat + 1)}박 빈칸에 선택한 음표 넣기`}
                    onClick={() => onAppendPitch?.(entry.pitch, slot / slotsPerBeat)}>
                    <span aria-hidden="true">+</span>
                  </button>
                ))}
            {notes.map((note, index) => {
              if (note.pitch === null) {
                if (entry.pitch === 65) {
                  return (
                    <button key={note.id} type="button" disabled={disabled}
                      {...focus.cell(`${note.id}-${entry.pitch}`, row, note.onset)}
                      className={`practice-grid-rest${selectedNoteId === note.id ? " is-selected" : ""}${playingNoteId === note.id ? " is-playing" : ""}`}
                      style={positionStyle(note, slots, slotsPerBeat)} data-testid={`practice-melody-rest-${note.id}`}
                      aria-label={`${index + 1}번째 쉼표, ${beatText(toNumber(note.duration))}박 선택`}
                      aria-pressed={selectedNoteId === note.id} onClick={() => onSelectNote(note.id)}>
                      쉼표
                    </button>
                  );
                }
                return <span key={note.id} className="practice-grid-rest"
                  style={positionStyle(note, slots, slotsPerBeat)} aria-hidden="true" />;
              }
              const active = gridPitch(note) === entry.pitch;
              return (
                <button key={note.id} type="button" disabled={disabled}
                  {...focus.cell(`${note.id}-${entry.pitch}`, row, note.onset)}
                  className={[
                    "practice-melody-cell",
                    active ? "is-filled" : "",
                    active && selectedNoteId === note.id ? "is-selected" : "",
                    active && playingNoteId === note.id ? "is-playing" : ""
                  ].filter(Boolean).join(" ")}
                  style={{ ...positionStyle(note, slots, slotsPerBeat), ...(active ? { backgroundColor: entry.color } : {}) }}
                  data-testid={`practice-melody-${note.id}-${entry.pitch}`} aria-pressed={active}
                  aria-label={`${index + 1}번째 음표를 ${entry.label}로, ${beatText(toNumber(note.duration))}박 유지`}
                  onClick={() => {
                    onSelectNote(note.id);
                    onPitch(note.id, entry.pitch);
                  }}>
                  {active && <><span aria-hidden="true">●</span><span>{note.lyric || noteLabel(note)}</span>
                    {note.lyric && note.pitch !== entry.pitch && <small>{accidentalSymbol(note.pitch, note.accidental)}</small>}
                  </>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
        </div>
      </div>
      <div className="practice-melody-lyric-wrap">{children}</div>
    </div>
  );
}

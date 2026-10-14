import { useState, type CSSProperties } from "react";
import ScoreMeasure from "../components/ScoreMeasure";
import { measureCapacity, validateMeasure } from "../music/meter";
import { toNumber } from "../music/rational";
import { pitchName, positionNotes, type PositionedNote } from "../music/score";
import { accidentalSymbol, staffDegreeForPitch } from "../music/accidental";
import type { NoteEvent } from "../music/types";
import { PRACTICE_DURATIONS, PRACTICE_PITCHES } from "./practiceModel";
import PracticeNoteTools from "./PracticeNoteTools";
import type { PracticeEditorsProps } from "./practiceEditorTypes";
import "./PracticeEditors.css";
import "./PracticeScore.css";

export type { PracticeEditorsProps } from "./practiceEditorTypes";
export { default as PracticeNoteTools } from "./PracticeNoteTools";

type TimelineProps = {
  slots: number;
  capacity: number;
  slotsPerBeat: number;
};

function beatText(beats: number): string {
  return Number.isInteger(beats) ? String(beats) : beats.toFixed(2).replace(/0$/, "");
}

function noteSymbol(note: NoteEvent): string {
  if (note.pitch === null) return "쉼";
  return PRACTICE_DURATIONS.find((duration) => duration.beats === toNumber(note.duration))?.symbol ?? "♪";
}

function noteLabel(note: NoteEvent): string {
  if (note.pitch === null) return "쉼표";
  return PRACTICE_PITCHES.find((entry) => entry.pitch === note.pitch)?.label ?? pitchName(note.pitch, note.accidental);
}

function gridPitch(note: NoteEvent): number | null {
  if (note.pitch === null) return null;
  const degree = staffDegreeForPitch(note.pitch, note.accidental);
  return PRACTICE_PITCHES.find((entry) => staffDegreeForPitch(entry.pitch) === degree)?.pitch ?? null;
}

function positionStyle(note: PositionedNote, slots: number, slotsPerBeat: number): CSSProperties {
  return {
    left: `${note.onset * slotsPerBeat / slots * 100}%`,
    width: `${toNumber(note.duration) * slotsPerBeat / slots * 100}%`
  };
}

function TimelineBase({ slots, capacity, slotsPerBeat }: TimelineProps) {
  return (
    <div className="practice-timeline-base" aria-hidden="true"
      style={{ gridTemplateColumns: `repeat(${slots}, minmax(0, 1fr))` }}>
      {Array.from({ length: slots }, (_, index) => (
        <span key={index} className={[
          "practice-half-beat",
          index % slotsPerBeat === 0 ? "practice-beat-start" : "",
          index / slotsPerBeat >= capacity ? "practice-overflow-slot" : ""
        ].filter(Boolean).join(" ")} />
      ))}
      <span className="practice-capacity-line" style={{ left: `${capacity * slotsPerBeat / slots * 100}%` }} />
    </div>
  );
}

function LyricTimeline({ notes, slots, capacity, slotsPerBeat, disabled, playingNoteId, onSelectNote, onNoteLyric }: {
  notes: readonly PositionedNote[];
  slots: number;
  capacity: number;
  slotsPerBeat: number;
  disabled: boolean;
  playingNoteId?: string | null;
  onSelectNote: (id: string) => void;
  onNoteLyric?: (id: string, lyric: string) => void;
}) {
  return (
    <div className="practice-lyric-timeline" aria-label="음표에 맞춘 가사">
      <TimelineBase slots={slots} capacity={capacity} slotsPerBeat={slotsPerBeat} />
      {notes.map((note, index) => {
        if (onNoteLyric && note.pitch === null) {
          return (
            <span key={note.id} className={`practice-lyric-cell practice-lyric-rest${playingNoteId === note.id ? " is-playing" : ""}`}
              style={positionStyle(note, slots, slotsPerBeat)} aria-label={`${index + 1}번째 쉼표 가사 없음`}>—</span>
          );
        }
        if (onNoteLyric) {
          return (
            <input key={note.id} type="text" disabled={disabled} maxLength={1}
              className={`practice-lyric-cell practice-lyric-input${playingNoteId === note.id ? " is-playing" : ""}`}
              style={positionStyle(note, slots, slotsPerBeat)} value={note.lyric ?? ""} placeholder="·"
              aria-label={`${index + 1}번째 음표 가사`}
              onFocus={() => onSelectNote(note.id)} onClick={() => onSelectNote(note.id)}
              onChange={(event) => onNoteLyric(note.id, event.target.value)} />
          );
        }
        return (
          <button type="button" key={note.id} disabled={disabled}
            className={`practice-lyric-cell${playingNoteId === note.id ? " is-playing" : ""}`} style={positionStyle(note, slots, slotsPerBeat)}
            onClick={() => onSelectNote(note.id)}
            aria-label={`${index + 1}번째 ${note.pitch === null ? "쉼표" : "음표"} 가사 ${note.lyric || "없음"} 선택`}>
            {note.pitch === null ? "—" : note.lyric || "·"}
          </button>
        );
      })}
    </div>
  );
}

function RhythmGrid({ notes, slots, capacity, slotsPerBeat, total, selectedNoteId, playingNoteId, disabled, onDelete, onAppend }: {
  notes: readonly PositionedNote[];
  slots: number;
  capacity: number;
  slotsPerBeat: number;
  total: number;
  selectedNoteId: string | null;
  playingNoteId?: string | null;
  disabled: boolean;
  onDelete: (id: string) => void;
  onAppend: () => void;
}) {
  const emptySlots = Array.from({ length: slots }, (_, index) => index)
    .filter((index) => index / slotsPerBeat >= total && index / slotsPerBeat < capacity);
  return (
    <div className="practice-rhythm-timeline" aria-label="리듬 칸 채우기">
      <TimelineBase slots={slots} capacity={capacity} slotsPerBeat={slotsPerBeat} />
      {emptySlots.map((slot) => (
        <button key={slot} type="button" disabled={disabled} className="practice-empty-slot"
          style={{ left: `${slot / slots * 100}%`, width: `${1 / slots * 100}%` }}
          onClick={onAppend} aria-label={`${beatText(slot / slotsPerBeat + 1)}박 빈칸, 다음 음표 추가`}>
          <span aria-hidden="true">+</span>
        </button>
      ))}
      {notes.map((note, index) => (
        <button type="button" key={note.id} disabled={disabled}
          className={[
            "practice-rhythm-block",
            toNumber(note.duration) === 0.25 ? "practice-sixteenth-block" : "",
            note.pitch === null ? "practice-rest-block" : "",
            index % 2 === 0 ? "practice-rhythm-pink" : "practice-rhythm-yellow",
            selectedNoteId === note.id ? "is-selected" : "",
            playingNoteId === note.id ? "is-playing" : "",
            note.onset + toNumber(note.duration) > capacity ? "is-overflowing" : ""
          ].filter(Boolean).join(" ")}
          style={positionStyle(note, slots, slotsPerBeat)} data-testid={`practice-rhythm-note-${note.id}`}
          onClick={() => onDelete(note.id)}
          aria-label={`${index + 1}번째 ${note.pitch === null ? "쉼표" : "음표"}, ${beatText(toNumber(note.duration))}박 삭제`}
          title={`${note.pitch === null ? "쉼표" : "음표"} ${beatText(toNumber(note.duration))}박 · 누르면 삭제돼요`}>
          <span className="practice-block-divisions" aria-hidden="true">
            {Array.from({ length: Math.max(0, Math.ceil(toNumber(note.duration) * slotsPerBeat) - 1) }, (_, division) => (
              <span key={division}
                className={(note.onset * slotsPerBeat + division + 1) % slotsPerBeat === 0 ? "is-whole-beat" : ""}
                style={{ left: `${(division + 1) / (toNumber(note.duration) * slotsPerBeat) * 100}%` }} />
            ))}
          </span>
          <span className="practice-note-symbol" aria-hidden="true">{noteSymbol(note)}</span>
          <span className="practice-block-length">{beatText(toNumber(note.duration))}박</span>
          {note.lyric && <small>{note.lyric}</small>}
        </button>
      ))}
    </div>
  );
}

function MelodyGrid({ notes, slots, capacity, slotsPerBeat, total, selectedNoteId, playingNoteId, disabled, onSelectNote, onPitch, onAppendPitch }: {
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
  onAppendPitch?: (pitch: number) => void;
}) {
  const emptySlots = onAppendPitch ? Array.from({ length: slots }, (_, index) => index)
    .filter((index) => index / slotsPerBeat >= total && index / slotsPerBeat < capacity) : [];
  return (
    <div className="practice-melody-rows" aria-label="낮은 도부터 높은 도까지 가락 칸 채우기">
      {[...PRACTICE_PITCHES].reverse().map((entry) => (
        <div key={entry.pitch} className="practice-melody-row">
          <span className="practice-pitch-row-label" style={{ backgroundColor: entry.color }}>{entry.label}</span>
          <div className="practice-melody-timeline">
            <TimelineBase slots={slots} capacity={capacity} slotsPerBeat={slotsPerBeat} />
            {emptySlots.map((slot) => (
              <button key={`empty-${slot}`} type="button" disabled={disabled}
                className="practice-empty-slot practice-melody-empty-slot"
                style={{ left: `${slot / slots * 100}%`, width: `${1 / slots * 100}%` }}
                data-testid={`practice-melody-empty-${entry.pitch}-${slot}`}
                aria-label={`${entry.label} ${beatText(slot / slotsPerBeat + 1)}박 빈칸, 다음 음표 추가`}
                onClick={() => onAppendPitch?.(entry.pitch)}>
                <span aria-hidden="true">+</span>
              </button>
            ))}
            {notes.map((note, index) => {
              if (note.pitch === null) {
                if (entry.pitch === 65) {
                  return (
                    <button key={note.id} type="button" disabled={disabled}
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
  );
}

export default function PracticeEditors({
  notes, meter, step, inputMode, selectedNoteId, playingNoteId, disabled = false,
  showTools = true, showSummary = true, compact = false,
  rhythmLocked = false, allowMelodyAppend = false,
  appendDuration, appendRest, onAppendDurationChange, onAppendRestChange, onNoteLyric,
  onSelectNote, onPitch, onDuration, onDelete, onAdd
}: PracticeEditorsProps) {
  const [newDuration, setNewDuration] = useState(1);
  const [newRest, setNewRest] = useState(false);
  const positioned = positionNotes(notes);
  const total = notes.reduce((sum, note) => sum + toNumber(note.duration), 0);
  const capacity = toNumber(measureCapacity(meter));
  const nextDuration = appendDuration ?? newDuration;
  const nextRest = appendRest ?? newRest;
  const slotsPerBeat = nextDuration === 0.25 || notes.some((note) => toNumber(note.duration) % 0.5 !== 0) ? 4 : 2;
  const slots = Math.max(slotsPerBeat, Math.ceil(Math.max(capacity, total) * slotsPerBeat));
  const validation = validateMeasure(notes, meter);
  const pitchLabelWidth = step === "melody" ? (compact ? 48 : 72) : 0;
  const slotMinWidth = compact ? (slotsPerBeat === 4 ? 16 : 20) : 128 / slotsPerBeat;
  const gridMinWidth = slots * slotMinWidth + pitchLabelWidth;
  const scoreMinWidth = Math.max(compact ? 200 : 580, notes.length * (compact ? 20 : 72));
  const durationChoice = PRACTICE_DURATIONS.find((duration) => duration.beats === nextDuration);
  const append = () => onAdd(nextDuration, nextRest ? null : 60, durationChoice?.dotted);
  const appendPitch = (pitch: number) => onAdd(nextDuration, nextRest ? null : pitch, durationChoice?.dotted);
  const changeDuration = (beats: number) => {
    setNewDuration(beats);
    onAppendDurationChange?.(beats);
  };
  const changeRest = (rest: boolean) => {
    setNewRest(rest);
    onAppendRestChange?.(rest);
  };
  const lyricTimeline = (
    <LyricTimeline notes={positioned} slots={slots} capacity={capacity} slotsPerBeat={slotsPerBeat}
      disabled={disabled} playingNoteId={playingNoteId} onSelectNote={onSelectNote} onNoteLyric={onNoteLyric} />
  );

  return (
    <div className={[
      "practice-editors",
      `practice-editors-${step}`,
      compact ? "practice-editors-compact" : ""
    ].filter(Boolean).join(" ")}>
      {showSummary && (
        <div className="practice-editor-summary">
          <strong>채운 길이 <span>{beatText(total)} / {beatText(capacity)}박</span></strong>
          <span className={`practice-beat-status practice-beat-status-${validation.state}`} role="status">
            {validation.message}
          </span>
        </div>
      )}
      {showTools && (
        <>
          {meter.beatUnit === 8 && <p className="practice-editor-help">6/8박자 · 8분음표 6개가 한 마디예요.</p>}
          <PracticeNoteTools notes={notes} meter={meter} step={step} inputMode={inputMode}
            selectedNoteId={selectedNoteId} disabled={disabled} onSelectNote={onSelectNote}
            onPitch={onPitch} onDuration={onDuration} onDelete={onDelete} onAdd={onAdd}
            appendDuration={nextDuration} appendRest={nextRest}
            rhythmLocked={rhythmLocked} allowMelodyAppend={allowMelodyAppend}
            onAppendDurationChange={changeDuration} onAppendRestChange={changeRest} />
        </>
      )}

      {inputMode === "grid" ? (
        <div className="practice-grid-scroll" tabIndex={0} aria-label="옆으로 넘겨 전체 칸 보기">
          <div className="practice-grid-content" style={{ minWidth: `${gridMinWidth}px` }}>
            {step === "rhythm" ? (
              <RhythmGrid notes={positioned} slots={slots} capacity={capacity} slotsPerBeat={slotsPerBeat} total={total}
                selectedNoteId={selectedNoteId} playingNoteId={playingNoteId} disabled={disabled}
                onDelete={onDelete} onAppend={append} />
            ) : (
              <MelodyGrid notes={positioned} slots={slots} capacity={capacity} slotsPerBeat={slotsPerBeat} total={total}
                selectedNoteId={selectedNoteId} playingNoteId={playingNoteId} disabled={disabled}
                onSelectNote={onSelectNote} onPitch={onPitch}
                onAppendPitch={allowMelodyAppend && !rhythmLocked ? appendPitch : undefined} />
            )}
            <div className={step === "melody" ? "practice-timeline-offset" : ""}>{lyricTimeline}</div>
          </div>
          {notes.length === 0 && step === "melody" && <p className="practice-editor-empty">
            {allowMelodyAppend ? "원하는 음높이의 빈칸을 눌러 가락을 넣어요." : "리듬을 만든 뒤 음높이를 골라요."}
          </p>}
        </div>
      ) : (
        <div className="practice-score-scroll" tabIndex={0} aria-label="연습 악보와 가사">
          <div className="practice-score-content" style={{ minWidth: `${scoreMinWidth}px` }}>
            <ScoreMeasure notes={notes} meter={meter} wide expandedStaff showPitchNames={step === "melody"}
              selectedNoteId={selectedNoteId ?? undefined} playingNoteId={playingNoteId}
              onSelectNote={disabled ? undefined : onSelectNote}
              onMoveNote={disabled || step === "rhythm" ? undefined : onPitch} />
            {lyricTimeline}
          </div>
        </div>
      )}
      {!compact && validation.state === "over" && <p className="practice-grid-legend">
        <strong>끝선 오른쪽은 넘친 박자예요. 음표 길이를 줄이거나 지워 주세요.</strong>
      </p>}
    </div>
  );
}

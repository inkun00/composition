import { useState, type CSSProperties } from "react";
import ScoreMeasure from "../components/ScoreMeasure";
import { measureCapacity, validateMeasure, type Meter } from "../music/meter";
import { toNumber } from "../music/rational";
import { positionNotes, type PositionedNote } from "../music/score";
import type { NoteEvent } from "../music/types";
import { PRACTICE_DURATIONS, PRACTICE_PITCHES } from "./practiceModel";
import "./PracticeEditors.css";

export type PracticeEditorsProps = {
  notes: readonly NoteEvent[];
  meter: Meter;
  step: "rhythm" | "melody";
  inputMode: "grid" | "score";
  selectedNoteId: string | null;
  playingNoteId?: string | null;
  disabled?: boolean;
  showTools?: boolean;
  showSummary?: boolean;
  compact?: boolean;
  appendDuration?: number;
  onAppendDurationChange?: (beats: number) => void;
  onNoteLyric?: (id: string, lyric: string) => void;
  onSelectNote: (id: string) => void;
  onPitch: (id: string, pitch: number) => void;
  onDuration: (id: string, beats: number, dotted?: boolean) => void;
  onDelete: (id: string) => void;
  onAdd: (beats: number, pitch: number | null, dotted?: boolean) => void;
};

type TimelineProps = {
  slots: number;
  capacity: number;
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
  return PRACTICE_PITCHES.find((entry) => entry.pitch === note.pitch)?.label ?? "음표";
}

function positionStyle(note: PositionedNote, slots: number): CSSProperties {
  return {
    left: `${note.onset * 2 / slots * 100}%`,
    width: `${toNumber(note.duration) * 2 / slots * 100}%`
  };
}

function TimelineBase({ slots, capacity }: TimelineProps) {
  return (
    <div className="practice-timeline-base" aria-hidden="true"
      style={{ gridTemplateColumns: `repeat(${slots}, minmax(0, 1fr))` }}>
      {Array.from({ length: slots }, (_, index) => (
        <span key={index} className={[
          "practice-half-beat",
          index % 2 === 0 ? "practice-beat-start" : "",
          index / 2 >= capacity ? "practice-overflow-slot" : ""
        ].filter(Boolean).join(" ")} />
      ))}
      <span className="practice-capacity-line" style={{ left: `${capacity * 2 / slots * 100}%` }} />
    </div>
  );
}

function TimelineHeader({ slots, capacity }: TimelineProps) {
  return (
    <div className="practice-beat-header" aria-hidden="true">
      {Array.from({ length: Math.ceil(slots / 2) }, (_, index) => (
        <span key={index} className={index >= capacity ? "practice-overflow-label" : ""}
          style={{ left: `${index * 2 / slots * 100}%`, width: `${2 / slots * 100}%` }}>
          {index >= capacity ? "+" : ""}{index + 1}
        </span>
      ))}
    </div>
  );
}

function LyricTimeline({ notes, slots, capacity, disabled, onSelectNote, onNoteLyric }: {
  notes: readonly PositionedNote[];
  slots: number;
  capacity: number;
  disabled: boolean;
  onSelectNote: (id: string) => void;
  onNoteLyric?: (id: string, lyric: string) => void;
}) {
  return (
    <div className="practice-lyric-timeline" aria-label="음표에 맞춘 가사">
      <TimelineBase slots={slots} capacity={capacity} />
      {notes.map((note, index) => {
        if (onNoteLyric && note.pitch === null) {
          return (
            <span key={note.id} className="practice-lyric-cell practice-lyric-rest"
              style={positionStyle(note, slots)} aria-label={`${index + 1}번째 쉼표 가사 없음`}>—</span>
          );
        }
        if (onNoteLyric) {
          return (
            <input key={note.id} type="text" disabled={disabled} maxLength={1}
              className="practice-lyric-cell practice-lyric-input"
              style={positionStyle(note, slots)} value={note.lyric ?? ""} placeholder="·"
              aria-label={`${index + 1}번째 음표 가사`}
              onFocus={() => onSelectNote(note.id)} onClick={() => onSelectNote(note.id)}
              onChange={(event) => onNoteLyric(note.id, event.target.value)} />
          );
        }
        return (
          <button type="button" key={note.id} disabled={disabled}
            className="practice-lyric-cell" style={positionStyle(note, slots)}
            onClick={() => onSelectNote(note.id)}
            aria-label={`${index + 1}번째 ${note.pitch === null ? "쉼표" : "음표"} 가사 ${note.lyric || "없음"} 선택`}>
            {note.pitch === null ? "—" : note.lyric || "·"}
          </button>
        );
      })}
    </div>
  );
}

function RhythmGrid({ notes, slots, capacity, total, selectedNoteId, playingNoteId, disabled, onDelete, onAppend }: {
  notes: readonly PositionedNote[];
  slots: number;
  capacity: number;
  total: number;
  selectedNoteId: string | null;
  playingNoteId?: string | null;
  disabled: boolean;
  onDelete: (id: string) => void;
  onAppend: () => void;
}) {
  const emptySlots = Array.from({ length: slots }, (_, index) => index)
    .filter((index) => index / 2 >= total && index / 2 < capacity);
  return (
    <div className="practice-rhythm-timeline" aria-label="리듬 칸 채우기">
      <TimelineBase slots={slots} capacity={capacity} />
      {emptySlots.map((slot) => (
        <button key={slot} type="button" disabled={disabled} className="practice-empty-slot"
          style={{ left: `${slot / slots * 100}%`, width: `${1 / slots * 100}%` }}
          onClick={onAppend} aria-label={`${beatText(slot / 2 + 1)}박 빈칸, 다음 음표 추가`}>
          <span aria-hidden="true">+</span>
        </button>
      ))}
      {notes.map((note, index) => (
        <button type="button" key={note.id} disabled={disabled}
          className={[
            "practice-rhythm-block",
            note.pitch === null ? "practice-rest-block" : "",
            index % 2 === 0 ? "practice-rhythm-pink" : "practice-rhythm-yellow",
            selectedNoteId === note.id ? "is-selected" : "",
            playingNoteId === note.id ? "is-playing" : "",
            note.onset + toNumber(note.duration) > capacity ? "is-overflowing" : ""
          ].filter(Boolean).join(" ")}
          style={positionStyle(note, slots)} data-testid={`practice-rhythm-note-${note.id}`}
          onClick={() => onDelete(note.id)}
          aria-label={`${index + 1}번째 ${note.pitch === null ? "쉼표" : "음표"}, ${beatText(toNumber(note.duration))}박 삭제`}
          title="다시 누르면 삭제돼요">
          <span className="practice-block-divisions" aria-hidden="true">
            {Array.from({ length: Math.max(0, Math.ceil(toNumber(note.duration) * 2) - 1) }, (_, division) => (
              <span key={division}
                className={(note.onset * 2 + division + 1) % 2 === 0 ? "is-whole-beat" : ""}
                style={{ left: `${(division + 1) / (toNumber(note.duration) * 2) * 100}%` }} />
            ))}
          </span>
          <span className="practice-note-symbol" aria-hidden="true">{noteSymbol(note)}</span>
          <span>{beatText(toNumber(note.duration))}박</span>
          {note.lyric && <small>{note.lyric}</small>}
        </button>
      ))}
    </div>
  );
}

function MelodyGrid({ notes, slots, capacity, selectedNoteId, playingNoteId, disabled, onSelectNote, onPitch }: {
  notes: readonly PositionedNote[];
  slots: number;
  capacity: number;
  selectedNoteId: string | null;
  playingNoteId?: string | null;
  disabled: boolean;
  onSelectNote: (id: string) => void;
  onPitch: (id: string, pitch: number) => void;
}) {
  return (
    <div className="practice-melody-rows" aria-label="낮은 도부터 높은 도까지 가락 칸 채우기">
      {[...PRACTICE_PITCHES].reverse().map((entry) => (
        <div key={entry.pitch} className="practice-melody-row">
          <span className="practice-pitch-row-label" style={{ backgroundColor: entry.color }}>{entry.label}</span>
          <div className="practice-melody-timeline">
            <TimelineBase slots={slots} capacity={capacity} />
            {notes.map((note, index) => {
              if (note.pitch === null) {
                if (entry.pitch === 65) {
                  return (
                    <button key={note.id} type="button" disabled={disabled}
                      className={`practice-grid-rest${selectedNoteId === note.id ? " is-selected" : ""}`}
                      style={positionStyle(note, slots)} data-testid={`practice-melody-rest-${note.id}`}
                      aria-label={`${index + 1}번째 쉼표, ${beatText(toNumber(note.duration))}박 선택`}
                      aria-pressed={selectedNoteId === note.id} onClick={() => onSelectNote(note.id)}>
                      쉼표
                    </button>
                  );
                }
                return <span key={note.id} className="practice-grid-rest"
                  style={positionStyle(note, slots)} aria-hidden="true" />;
              }
              const active = note.pitch === entry.pitch;
              return (
                <button key={note.id} type="button" disabled={disabled}
                  className={[
                    "practice-melody-cell",
                    active ? "is-filled" : "",
                    active && selectedNoteId === note.id ? "is-selected" : "",
                    active && playingNoteId === note.id ? "is-playing" : ""
                  ].filter(Boolean).join(" ")}
                  style={{ ...positionStyle(note, slots), ...(active ? { backgroundColor: entry.color } : {}) }}
                  data-testid={`practice-melody-${note.id}-${entry.pitch}`} aria-pressed={active}
                  aria-label={`${index + 1}번째 음표를 ${entry.label}로, ${beatText(toNumber(note.duration))}박 유지`}
                  onClick={() => {
                    onSelectNote(note.id);
                    onPitch(note.id, entry.pitch);
                  }}>
                  {active && <><span aria-hidden="true">●</span><span>{note.lyric || entry.label}</span></>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function closestPracticePitch(pitch: number, previousPitch: number): number {
  return PRACTICE_PITCHES.reduce((closest, entry) => {
    const distance = Math.abs(entry.pitch - pitch);
    const currentDistance = Math.abs(closest - pitch);
    if (distance < currentDistance) return entry.pitch;
    if (distance === currentDistance && (pitch > previousPitch ? entry.pitch > closest : entry.pitch < closest)) {
      return entry.pitch;
    }
    return closest;
  }, PRACTICE_PITCHES[0].pitch);
}

type NoteToolsProps = PracticeEditorsProps & {
  newDuration: number;
  onNewDuration: (beats: number) => void;
};

function NoteTools({
  notes, step, inputMode, selectedNoteId, disabled = false,
  onPitch, onDuration, onDelete, onAdd, newDuration, onNewDuration
}: NoteToolsProps) {
  const selected = notes.find((note) => note.id === selectedNoteId);
  const durationChoice = PRACTICE_DURATIONS.find((duration) => duration.beats === newDuration);
  const selectedDuration = selected ? toNumber(selected.duration) : newDuration;
  const append = (rest = false) => onAdd(newDuration, rest ? null : 60, durationChoice?.dotted);

  function moveSelectedPitch(direction: number) {
    if (!selected || selected.pitch === null || disabled) return;
    const current = PRACTICE_PITCHES.findIndex((entry) => entry.pitch === selected.pitch);
    const nextIndex = Math.max(0, Math.min(PRACTICE_PITCHES.length - 1, current + direction));
    onPitch(selected.id, PRACTICE_PITCHES[nextIndex].pitch);
  }

  return (
    <>
      <div className="practice-rhythm-tools">
        <div className="practice-duration-options" role="group" aria-label="음표 길이 선택">
          {PRACTICE_DURATIONS.map((duration) => (
            <button type="button" key={duration.beats} disabled={disabled}
              className={selectedDuration === duration.beats ? "is-active" : ""}
              aria-pressed={selectedDuration === duration.beats}
              aria-label={`${duration.label.split(" · ")[0]}, ${beatText(duration.beats)}박`}
              data-testid={`practice-duration-${duration.beats}`}
              onClick={() => {
                onNewDuration(duration.beats);
                if (selected) onDuration(selected.id, duration.beats, duration.dotted);
              }}>
              <span className="practice-note-symbol" aria-hidden="true">{duration.symbol}</span>
              <span>{duration.label.split(" · ")[0]}</span>
              <small>{beatText(duration.beats)}박</small>
            </button>
          ))}
        </div>
        <div className="practice-note-actions">
          <button type="button" disabled={disabled} data-testid="practice-add-note" onClick={() => append()}>
            + {beatText(newDuration)}박 음표 추가
          </button>
          <button type="button" disabled={disabled} data-testid="practice-add-rest" onClick={() => append(true)}>
            + {beatText(newDuration)}박 쉼표 추가
          </button>
          <button type="button" disabled={disabled || !selected} data-testid="practice-delete-note"
            className="practice-delete-note" onClick={() => selected && onDelete(selected.id)}>
            선택한 음표·쉼표 삭제
          </button>
        </div>
        <p className="practice-editor-help">
          {selected ? "선택한 음표·쉼표의 길이를 위에서 바꿀 수 있어요. 새 음표는 맨 뒤에 더해져요." : "길이를 고르고 음표를 추가해요. 음표 아래 가사 칸이나 악보에서 선택하면 길이를 바꿀 수 있어요."}
          {inputMode === "grid" && step === "rhythm" && " 빈칸을 누르면 추가되고, 색칠한 칸을 다시 누르면 삭제돼요."}
        </p>
      </div>
      {step === "melody" && (
        <div className="practice-melody-tools">
          <p className="practice-editor-help">음표를 선택해 음높이를 바꿔요. 필요하면 위에서 길이를 바꾸거나 음표·쉼표를 더하고 지울 수 있어요.</p>
          {inputMode === "score" && <p className="practice-editor-help">악보의 음표를 위아래로 끌거나, 선택한 뒤 아래 음이름을 눌러요.</p>}
          <div className="practice-pitch-options" role="group" aria-label="선택한 음표의 음높이">
            {PRACTICE_PITCHES.map((entry) => (
              <button type="button" key={entry.pitch} disabled={disabled || !selected || selected.pitch === null}
                style={{ backgroundColor: entry.color }} aria-pressed={selected?.pitch === entry.pitch}
                data-testid={`practice-pitch-${entry.pitch}`} aria-label={`선택한 음표를 ${entry.label}로 바꾸기`}
                onClick={() => selected && selected.pitch !== null && onPitch(selected.id, entry.pitch)}>{entry.label}</button>
            ))}
          </div>
          <div className="practice-pitch-navigation">
            <span>{selected ? `${notes.findIndex((note) => note.id === selected.id) + 1}번째 ${noteLabel(selected)} 선택` : "먼저 음표를 선택해 주세요."}</span>
            <button type="button" disabled={disabled || !selected || selected.pitch === null || selected.pitch <= 60}
              onClick={() => moveSelectedPitch(-1)} aria-label="선택한 음표 한 음 낮추기">↓ 한 음 낮게</button>
            <button type="button" disabled={disabled || !selected || selected.pitch === null || selected.pitch >= 72}
              onClick={() => moveSelectedPitch(1)} aria-label="선택한 음표 한 음 높이기">↑ 한 음 높게</button>
          </div>
        </div>
      )}
    </>
  );
}

export function PracticeNoteTools(props: PracticeEditorsProps) {
  const [newDuration, setNewDuration] = useState(1);
  const changeDuration = (beats: number) => {
    setNewDuration(beats);
    props.onAppendDurationChange?.(beats);
  };

  return (
    <div className="practice-editors practice-note-tools">
      <NoteTools {...props} newDuration={props.appendDuration ?? newDuration} onNewDuration={changeDuration} />
    </div>
  );
}

export default function PracticeEditors({
  notes, meter, step, inputMode, selectedNoteId, playingNoteId, disabled = false,
  showTools = true, showSummary = true, compact = false,
  appendDuration, onAppendDurationChange, onNoteLyric,
  onSelectNote, onPitch, onDuration, onDelete, onAdd
}: PracticeEditorsProps) {
  const [newDuration, setNewDuration] = useState(1);
  const positioned = positionNotes(notes);
  const total = notes.reduce((sum, note) => sum + toNumber(note.duration), 0);
  const capacity = toNumber(measureCapacity(meter));
  const slots = Math.max(2, Math.ceil(Math.max(capacity, total) * 2));
  const validation = validateMeasure(notes, meter);
  const pitchLabelWidth = step === "melody" ? (compact ? 48 : 72) : 0;
  const gridMinWidth = slots * (compact ? 20 : 64) + pitchLabelWidth;
  const scoreMinWidth = Math.max(compact ? 200 : 580, notes.length * (compact ? 20 : 72));
  const nextDuration = appendDuration ?? newDuration;
  const durationChoice = PRACTICE_DURATIONS.find((duration) => duration.beats === nextDuration);
  const append = () => onAdd(nextDuration, 60, durationChoice?.dotted);
  const changeDuration = (beats: number) => {
    setNewDuration(beats);
    onAppendDurationChange?.(beats);
  };
  const lyricTimeline = (
    <LyricTimeline notes={positioned} slots={slots} capacity={capacity}
      disabled={disabled} onSelectNote={onSelectNote} onNoteLyric={onNoteLyric} />
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
          {meter.beatUnit === 8 && <p className="practice-editor-help">이 표에서 1박은 4분음표 길이예요. 6/8박자는 0.5박 칸 6개를 채워요.</p>}
          <NoteTools notes={notes} meter={meter} step={step} inputMode={inputMode}
            selectedNoteId={selectedNoteId} disabled={disabled} onSelectNote={onSelectNote}
            onPitch={onPitch} onDuration={onDuration} onDelete={onDelete} onAdd={onAdd}
            newDuration={nextDuration} onNewDuration={changeDuration} />
        </>
      )}

      {inputMode === "grid" ? (
        <div className="practice-grid-scroll" tabIndex={0} aria-label="옆으로 넘겨 전체 칸 보기">
          <div className="practice-grid-content" style={{ minWidth: `${gridMinWidth}px` }}>
            <div className={step === "melody" ? "practice-timeline-offset" : ""}>
              <TimelineHeader slots={slots} capacity={capacity} />
            </div>
            {step === "rhythm" ? (
              <RhythmGrid notes={positioned} slots={slots} capacity={capacity} total={total}
                selectedNoteId={selectedNoteId} playingNoteId={playingNoteId} disabled={disabled}
                onDelete={onDelete} onAppend={append} />
            ) : (
              <MelodyGrid notes={positioned} slots={slots} capacity={capacity}
                selectedNoteId={selectedNoteId} playingNoteId={playingNoteId} disabled={disabled}
                onSelectNote={onSelectNote} onPitch={onPitch} />
            )}
            <div className={step === "melody" ? "practice-timeline-offset" : ""}>{lyricTimeline}</div>
          </div>
          {notes.length === 0 && step === "melody" && <p className="practice-editor-empty">음표를 추가한 뒤 칸을 눌러 가락을 만들어요.</p>}
        </div>
      ) : (
        <div className="practice-score-scroll" tabIndex={0} aria-label="연습 악보와 가사">
          <div className="practice-score-content" style={{ minWidth: `${scoreMinWidth}px` }}>
            <ScoreMeasure notes={notes} meter={meter} wide expandedStaff
              selectedNoteId={selectedNoteId ?? undefined} playingNoteId={playingNoteId}
              onSelectNote={disabled ? undefined : onSelectNote}
              onMoveNote={disabled || step === "rhythm" ? undefined : (id, pitch) => {
                const note = notes.find((entry) => entry.id === id);
                if (note?.pitch !== undefined && note.pitch !== null) {
                  onPitch(id, closestPracticePitch(pitch, note.pitch));
                }
              }} />
            {lyricTimeline}
          </div>
        </div>
      )}
      {!compact && <p className="practice-grid-legend">
        {inputMode === "grid" ? "실선은 1박, 점선은 0.5박이에요. 색칠한 한 덩어리가 음표 하나예요." : "악보 아래 가사는 음표와 같은 순서예요. 음표를 눌러 선택할 수 있어요."}
        {validation.state === "over" && <strong> 굵은 끝선 오른쪽은 넘친 박자예요. 길이를 줄이거나 음표를 지워 주세요.</strong>}
      </p>}
    </div>
  );
}

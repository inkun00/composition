import { useState } from "react";
import { toNumber } from "../music/rational";
import { pitchName } from "../music/score";
import { PRACTICE_DURATIONS, PRACTICE_PITCHES } from "./practiceModel";
import type { PracticeEditorsProps } from "./practiceEditorTypes";

const REST_SYMBOLS: Readonly<Record<number, string>> = {
  0.5: "𝄾",
  1: "𝄽",
  1.5: "𝄽·",
  2: "𝄼",
  3: "𝄼·",
  4: "𝄻"
};

function beatText(beats: number): string {
  return Number.isInteger(beats) ? String(beats) : beats.toFixed(2).replace(/0$/, "");
}

export default function PracticeNoteTools({
  notes, step, inputMode, selectedNoteId, disabled = false,
  appendDuration, appendRest, onAppendDurationChange, onAppendRestChange,
  onPitch, onDuration, onDelete, onAdd
}: PracticeEditorsProps) {
  const [newDuration, setNewDuration] = useState(1);
  const [newRest, setNewRest] = useState(false);
  const nextDuration = appendDuration ?? newDuration;
  const nextRest = appendRest ?? newRest;
  const selected = notes.find((note) => note.id === selectedNoteId);
  const selectedLabel = selected?.pitch === null ? "쉼표" : selected
    ? PRACTICE_PITCHES.find((entry) => entry.pitch === selected.pitch)?.label ?? pitchName(selected.pitch!, selected.accidental)
    : "";

  function append(beats: number, rest: boolean, dotted?: boolean) {
    if (disabled) return;
    setNewDuration(beats);
    setNewRest(rest);
    onAppendDurationChange?.(beats);
    onAppendRestChange?.(rest);
    onAdd(beats, rest ? null : 60, dotted);
  }

  function moveSelectedPitch(direction: number) {
    if (!selected || selected.pitch === null || disabled) return;
    const next = inputMode === "score" ? Math.max(60, Math.min(72, selected.pitch + direction))
      : [...PRACTICE_PITCHES].sort((left, right) => direction * (left.pitch - right.pitch))
        .find((entry) => direction * (entry.pitch - selected.pitch!) > 0)?.pitch ?? selected.pitch;
    onPitch(selected.id, next);
  }

  return (
    <div className="practice-editors practice-note-tools">
      <div className="practice-rhythm-tools">
        <div className="practice-duration-options" role="group" aria-label="음표와 쉼표 넣기">
          {PRACTICE_DURATIONS.map((duration) => {
            const noteName = duration.label.split(" · ")[0];
            const restName = noteName.replace("음표", "쉼표");
            return (
              <div className="practice-duration-pair" key={duration.beats}>
                {[false, true].map((rest) => {
                  const active = nextDuration === duration.beats && nextRest === rest;
                  return (
                    <button type="button" key={String(rest)} disabled={disabled}
                      className={[rest ? "practice-rest-option" : "", active ? "is-active" : ""].filter(Boolean).join(" ")}
                      aria-pressed={active}
                      aria-label={`${rest ? restName : noteName}, ${beatText(duration.beats)}박 넣기`}
                      data-testid={`practice-${rest ? "rest" : "duration"}-${duration.beats}`}
                      onClick={() => append(duration.beats, rest, duration.dotted)}>
                      <span className="practice-note-symbol" aria-hidden="true">{rest ? REST_SYMBOLS[duration.beats] : duration.symbol}</span>
                      <span>{noteName.replace("음표", "")}<wbr />{rest ? "쉼표" : "음표"}</span>
                      <small>{beatText(duration.beats)}박</small>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
        <div className="practice-note-actions">
          <button type="button" disabled={disabled || !selected} data-testid="practice-delete-note"
            className="practice-delete-note" aria-label="선택한 음표·쉼표 삭제" onClick={() => selected && onDelete(selected.id)}>
            삭제
          </button>
        </div>
      </div>
      {step === "melody" && (
        <div className="practice-melody-tools">
          <div className="practice-pitch-options" role="group" aria-label="선택한 음표의 음높이">
            {PRACTICE_PITCHES.map((entry) => (
              <button type="button" key={entry.pitch} disabled={disabled || !selected || selected.pitch === null}
                style={{ backgroundColor: entry.color }} aria-pressed={selected?.pitch === entry.pitch}
                data-testid={`practice-pitch-${entry.pitch}`} aria-label={`선택한 음표를 ${entry.label}로 바꾸기`}
                onClick={() => selected && selected.pitch !== null && onPitch(selected.id, entry.pitch)}>{entry.label}</button>
            ))}
          </div>
          <div className="practice-pitch-navigation">
            <span>{selected ? `${notes.findIndex((note) => note.id === selected.id) + 1}번째 ${selectedLabel} 선택` : "먼저 음표를 선택해 주세요."}</span>
            <label className="practice-selected-duration">길이
              <select aria-label="선택한 음표 길이" data-testid="practice-edit-duration"
                disabled={disabled || !selected} value={selected ? toNumber(selected.duration) : ""}
                onChange={(event) => {
                  const duration = PRACTICE_DURATIONS.find((item) => item.beats === Number(event.target.value));
                  if (selected && duration) onDuration(selected.id, duration.beats, duration.dotted);
                }}>
                {!selected && <option value="">음표 선택</option>}
                {PRACTICE_DURATIONS.map((duration) => (
                  <option key={duration.beats} value={duration.beats}>{beatText(duration.beats)}박</option>
                ))}
              </select>
            </label>
            <button type="button" disabled={disabled || !selected || selected.pitch === null || selected.pitch <= 60}
              onClick={() => moveSelectedPitch(-1)} aria-label={inputMode === "score" ? "선택한 음표 반음 낮추기" : "선택한 음표 한 음 낮추기"}>↓ {inputMode === "score" ? "반음" : "한 음"} 낮게</button>
            <button type="button" disabled={disabled || !selected || selected.pitch === null || selected.pitch >= 72}
              onClick={() => moveSelectedPitch(1)} aria-label={inputMode === "score" ? "선택한 음표 반음 높이기" : "선택한 음표 한 음 높이기"}>↑ {inputMode === "score" ? "반음" : "한 음"} 높게</button>
          </div>
        </div>
      )}
    </div>
  );
}

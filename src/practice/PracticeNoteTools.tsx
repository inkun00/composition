import { useState } from "react";
import { toNumber } from "../music/rational";
import { pitchName } from "../music/score";
import { PRACTICE_DURATIONS, PRACTICE_PITCHES } from "./practiceModel";
import type { PracticeEditorsProps } from "./practiceEditorTypes";

const REST_SYMBOLS: Readonly<Record<number, string>> = {
  0.25: "𝄿",
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
  rhythmLocked = false, allowMelodyAppend = false,
  appendDuration, appendRest, onAppendDurationChange, onAppendRestChange,
  onPitch, onDuration, onDelete
}: PracticeEditorsProps) {
  const [newDuration, setNewDuration] = useState(1);
  const [newRest, setNewRest] = useState(false);
  const nextDuration = appendDuration ?? newDuration;
  const nextRest = appendRest ?? newRest;
  const selected = notes.find((note) => note.id === selectedNoteId);
  const selectedLabel = selected?.pitch === null ? "쉼표" : selected
    ? PRACTICE_PITCHES.find((entry) => entry.pitch === selected.pitch)?.label ?? pitchName(selected.pitch!, selected.accidental)
    : "";

  function choose(beats: number, rest: boolean) {
    if (disabled || rhythmLocked) return;
    setNewDuration(beats);
    setNewRest(rest);
    onAppendDurationChange?.(beats);
    onAppendRestChange?.(rest);
  }

  function durationButtons(common: boolean) {
    return PRACTICE_DURATIONS.filter((duration) => [0.5, 1, 2].includes(duration.beats) === common).map((duration) => {
      const name = duration.label.split(" · ")[0].replace("음표", nextRest ? "쉼표" : "음표");
      const active = nextDuration === duration.beats;
      return (
        <button type="button" key={duration.beats} disabled={disabled}
          className={[nextRest ? "practice-rest-option" : "", active ? "is-active" : ""].filter(Boolean).join(" ")}
          aria-pressed={active} aria-label={`${name}, ${beatText(duration.beats)}박 선택`}
          data-testid={`practice-${nextRest ? "rest" : "duration"}-${duration.beats}`}
          onClick={() => choose(duration.beats, nextRest)}>
          <span className="practice-note-symbol" aria-hidden="true">{nextRest ? REST_SYMBOLS[duration.beats] : duration.symbol}</span>
          <span>{name}</span>
          <small>{beatText(duration.beats)}박</small>
        </button>
      );
    });
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
      {!rhythmLocked && <div className="practice-rhythm-tools">
        <div className="practice-duration-options practice-duration-palette" role="group" aria-label="넣을 음표 선택">
          <div className="practice-note-kind" role="group" aria-label="음표 또는 쉼표">
            {[false, true].map((rest) => (
              <button type="button" key={String(rest)} disabled={disabled} aria-pressed={nextRest === rest}
                data-testid={`practice-choose-${rest ? "rest" : "note"}`} onClick={() => choose(nextDuration, rest)}>
                {rest ? "쉼표" : "음표"}
              </button>
            ))}
          </div>
          <div className="practice-duration-buttons practice-common-durations">{durationButtons(true)}</div>
          <details className="practice-more-durations">
            <summary>더 보기{![0.5, 1, 2].includes(nextDuration) ? ` · ${beatText(nextDuration)}박 선택됨` : ""}</summary>
            <div className="practice-duration-buttons">{durationButtons(false)}</div>
          </details>
          <p className="practice-placement-hint">{nextRest ? "쉼표" : "음표"}를 고른 뒤 빈칸을 눌러요.</p>
        </div>
        {step === "melody" && <div className="practice-note-actions">
          <button type="button" disabled={disabled || !selected} data-testid="practice-delete-note"
            className="practice-delete-note" aria-label="선택한 음표·쉼표 삭제" onClick={() => selected && onDelete(selected.id)}>
            삭제
          </button>
        </div>}
      </div>}
      {rhythmLocked && <p className="practice-editor-help">
        만든 리듬에 높낮이를 붙여요. 길이를 고치려면 리듬만들기로 돌아가요.
      </p>}
      {step === "melody" && (
        <div className="practice-melody-tools">
          <div className="practice-pitch-options" role="group" aria-label="선택한 음표의 음높이">
            {PRACTICE_PITCHES.map((entry) => (
              <button type="button" key={entry.pitch}
                disabled={disabled || !selected || selected.pitch === null}
                style={{ backgroundColor: entry.color }} aria-pressed={selected?.pitch === entry.pitch}
                data-testid={`practice-pitch-${entry.pitch}`}
                aria-label={`선택한 음표를 ${entry.label}로 바꾸기`}
                onClick={() => {
                  if (selected && selected.pitch !== null) onPitch(selected.id, entry.pitch);
                }}>{entry.label}</button>
            ))}
          </div>
          <div className="practice-pitch-navigation">
            <span>{selected ? `${notes.findIndex((note) => note.id === selected.id) + 1}번째 ${selectedLabel} 선택`
              : allowMelodyAppend ? "빈칸에 음표를 넣고 높낮이를 바꿔요." : "먼저 음표를 선택해 주세요."}</span>
            {!rhythmLocked && <label className="practice-selected-duration">길이
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
            </label>}
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

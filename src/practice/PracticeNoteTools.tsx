import { useState } from "react";
import { toNumber } from "../music/rational";
import { PRACTICE_DURATIONS } from "./practiceModel";
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
  notes, step, selectedNoteId, disabled = false,
  rhythmLocked = false,
  appendDuration, appendRest, onAppendDurationChange, onAppendRestChange,
  onDuration, onDelete
}: PracticeEditorsProps) {
  const [newDuration, setNewDuration] = useState(1);
  const [newRest, setNewRest] = useState(false);
  const nextDuration = appendDuration ?? newDuration;
  const nextRest = appendRest ?? newRest;
  const selected = notes.find((note) => note.id === selectedNoteId);

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

  if (rhythmLocked) return null;

  return (
    <div className="practice-editors practice-note-tools">
      <div className="practice-rhythm-tools">
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
          <label className="practice-selected-duration">
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
          <button type="button" disabled={disabled || !selected} data-testid="practice-delete-note"
            className="practice-delete-note" aria-label="선택한 음표·쉼표 삭제" onClick={() => selected && onDelete(selected.id)}>
            삭제
          </button>
        </div>}
      </div>
    </div>
  );
}

import { useState } from "react";
import { CheckCircle2, Lightbulb, Square, Volume2 } from "../components/AppArtworkIcons";
import { measureCapacity, type Meter } from "../music/meter";
import { toNumber } from "../music/rational";
import type { MeasureValidation } from "../music/types";
import PracticeEditors from "./PracticeEditors";
import PracticeHarmonyChooser from "./PracticeHarmonyChooser";
import PracticePlaybackIndicator from "./PracticePlaybackIndicator";
import { getPracticeHarmonyHints, type PracticeMeasure } from "./practiceModel";
import { unassignedLyricSyllables } from "./practiceLyricPlacement";
import { getPracticeHarmonySummary } from "./practiceHarmonyHints";
import type { usePracticeState } from "./usePracticeState";

type PracticeMeasureCardProps = {
  measure: PracticeMeasure;
  index: number;
  scoreIndex: number;
  meter: Meter;
  validation: MeasureValidation;
  practice: ReturnType<typeof usePracticeState>;
  disabled: boolean;
  playingNoteId: string | null;
  appendDuration: number;
  appendRest: boolean;
  previewActive: boolean;
  playbackActive?: boolean;
  previewPreparing: boolean;
  onPreviewRhythm: () => void;
  onPreviewHarmony: () => void;
  harmonyPreviewActive: boolean;
};

export default function PracticeMeasureCard({
  measure, index, scoreIndex, meter, validation, practice, disabled, playingNoteId, appendDuration, appendRest,
  previewActive, playbackActive = false, previewPreparing, onPreviewRhythm, onPreviewHarmony, harmonyPreviewActive
}: PracticeMeasureCardProps) {
  const [editSyllables, setEditSyllables] = useState(false);
  const active = practice.activeIndex === index && practice.activeScoreIndex === scoreIndex;
  const step = scoreIndex === 0 ? practice.step : "rhythm";
  const rhythmLocked = practice.draft.mode === "rhythm-melody" && step === "melody";
  const idPrefix = scoreIndex === 0 ? "practice" : `practice-score-${scoreIndex}`;
  const labelPrefix = scoreIndex === 0 ? "" : `${scoreIndex + 1}번 악보 `;
  const lyricInputId = `practice-lyric-input-${scoreIndex}-${index}`;
  const used = measure.notes.reduce((sum, note) => sum + toNumber(note.duration), 0);
  const capacity = toNumber(measureCapacity(meter));
  const remainingBeats = Math.abs(capacity - used);
  const missingLyrics = unassignedLyricSyllables(measure);
  const scoreMeasures = practice.scores[scoreIndex].measures;
  const harmonyContext = {
    previousMeasure: scoreMeasures[index - 1],
    nextMeasure: scoreMeasures[index + 1],
    isFinalMeasure: index === scoreMeasures.length - 1
  };
  const hints = step === "melody" ? getPracticeHarmonyHints(measure.notes, measure.chord, meter, harmonyContext) : [];
  const hasSound = measure.notes.some((note) => note.pitch !== null);
  const previewLabel = `${labelPrefix}${index + 1}마디 ${previewActive
    ? previewPreparing ? "준비 취소" : "연주 멈추기"
    : step === "melody" ? "가락 미리 듣기" : "리듬 미리듣기"}`;

  return (
    <section className={`practice-measure-card${active ? " is-active" : ""}`}
      data-testid={`${idPrefix}-measure-card-${index}`} aria-label={`${labelPrefix}${index + 1}마디 연습`}>
      <div className="practice-measure-card-heading">
        <button type="button" disabled={disabled} data-testid={`${idPrefix}-measure-${index}`}
          aria-pressed={active} onClick={() => practice.selectMeasure(index, scoreIndex)}>
          {index + 1}마디
          {validation.state === "exact" && <CheckCircle2 size={16} aria-label="박자 완성" />}
        </button>
        <span className={`practice-measure-total ${validation.state}`}>{used} / {capacity}박</span>
      </div>

      <PracticePlaybackIndicator notes={measure.notes} playingNoteId={playingNoteId}
        active={previewActive || playbackActive} preparing={previewPreparing} />

      <PracticeEditors notes={measure.notes} meter={meter} step={step} inputMode={practice.inputMode}
        selectedNoteId={practice.selectedNoteId} playingNoteId={playingNoteId} disabled={disabled}
        showTools={false} showSummary={false} compact appendDuration={appendDuration} appendRest={appendRest}
        rhythmLocked={rhythmLocked} allowMelodyAppend={practice.draft.mode === "melody"}
        onSelectNote={practice.setSelectedNoteId} onPitch={practice.setPitch} onDuration={practice.setDuration}
        onDelete={practice.deleteNote} onAdd={(beats, pitch, dotted, onset) => practice.addNote(beats, pitch, dotted, index, scoreIndex, onset)}
        onNoteLyric={editSyllables ? practice.setNoteLyric : undefined} />

      <fieldset className="practice-lyric-area" disabled={disabled}>
        <legend className="practice-sr-only">{labelPrefix}{index + 1}마디 가사</legend>
        <div className="practice-lyric-heading">
          <label htmlFor={lyricInputId}>가사</label>
          {measure.notes.some((note) => note.pitch !== null) && (
            <button type="button" aria-expanded={editSyllables} onClick={() => setEditSyllables((value) => !value)}>
              {editSyllables ? "글자 위치 닫기" : "글자 위치 고치기"}
            </button>
          )}
        </div>
        <div className="practice-lyric-entry">
          <input id={lyricInputId} aria-label={`${labelPrefix}${index + 1}마디 가사`}
            placeholder="가사 입력" maxLength={200} value={measure.lyric}
            onChange={(event) => practice.setLyric(event.target.value, index, scoreIndex)} />
        </div>
        {missingLyrics.length > 0 && (
          <p className="practice-lyric-warning" role="status">
            남은 가사: <strong>{missingLyrics.join("")}</strong> · 음표를 더 넣거나 다음 마디로 나눠 주세요.
          </p>
        )}
      </fieldset>

      <p className={`practice-measure-validation ${validation.state}`}
        role={validation.state === "over" ? "alert" : "status"}>
        {validation.state === "exact" ? "박자가 딱 맞아요!"
          : validation.state === "over" ? `${remainingBeats}박 넘쳤어요. 음표를 줄이거나 지워 주세요.`
          : measure.notes.length ? `${remainingBeats}박 남았어요.` : `${capacity}박을 채워 보세요.`}
      </p>
      {!rhythmLocked && validation.state === "short" && measure.notes.length > 0 && (
        <button type="button" className="practice-fill-rest" disabled={disabled} onClick={() => practice.fillRests(index, scoreIndex)}>
          남은 박자는 쉼표로 채우기
        </button>
      )}

      <button type="button" className={`practice-measure-preview${previewActive ? " is-playing" : ""}`}
        data-testid={`${idPrefix}-measure-preview-${index}`} aria-label={previewLabel}
        disabled={!hasSound || (disabled && !previewActive)} onClick={onPreviewRhythm}>
        {previewActive ? <Square size={15} /> : <Volume2 size={16} />}
        {previewActive ? previewPreparing ? "준비 취소" : "멈추기" : step === "melody" ? "미리 듣기" : "미리듣기"}
      </button>

      {step === "melody" && (
        <div className="practice-measure-harmony">
          <PracticeHarmonyChooser chord={measure.chord} index={index} disabled={disabled}
            previousChord={practice.scores[scoreIndex].measures[index - 1]?.chord}
            onPreview={onPreviewHarmony} previewActive={harmonyPreviewActive} previewPreparing={previewPreparing}
            onChange={(chord) => practice.setChord(chord, index, scoreIndex)} />
          {hints.length > 0 ? (
            <div className="practice-harmony-warning" role="status">
              <strong>가락과 화음을 함께 살펴봐요</strong>
              {hints.map((hint) => (
                <button type="button" key={`${hint.noteId}-${hint.kind}`} disabled={disabled}
                  onClick={() => practice.setSelectedNoteId(hint.noteId)}>
                  <Lightbulb size={16} /><span>{hint.message}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="practice-measure-harmony-good">
              {getPracticeHarmonySummary(measure.notes, measure.chord, meter, harmonyContext)}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

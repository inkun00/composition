import { CheckCircle2, Lightbulb, Square, Volume2, WandSparkles } from "lucide-react";
import { measureCapacity, type Meter } from "../music/meter";
import { toNumber } from "../music/rational";
import type { MeasureValidation } from "../music/types";
import PracticeEditors from "./PracticeEditors";
import { getPracticeHarmonyHints, lyricSyllables, type PracticeMeasure } from "./practiceModel";
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
  previewActive: boolean;
  previewPreparing: boolean;
  onPreviewRhythm: () => void;
};

export default function PracticeMeasureCard({
  measure, index, scoreIndex, meter, validation, practice, disabled, playingNoteId, appendDuration,
  previewActive, previewPreparing, onPreviewRhythm
}: PracticeMeasureCardProps) {
  const active = practice.activeIndex === index && practice.activeScoreIndex === scoreIndex;
  const step = scoreIndex === 0 ? practice.step : "rhythm";
  const idPrefix = scoreIndex === 0 ? "practice" : `practice-score-${scoreIndex}`;
  const labelPrefix = scoreIndex === 0 ? "" : `${scoreIndex + 1}번 악보 `;
  const lyricInputId = `practice-lyric-input-${scoreIndex}-${index}`;
  const used = measure.notes.reduce((sum, note) => sum + toNumber(note.duration), 0);
  const capacity = toNumber(measureCapacity(meter));
  const assignedLyrics = measure.notes.reduce((sum, note) => sum + (note.pitch === null ? 0 : lyricSyllables(note.lyric ?? "").length), 0);
  const missingLyrics = Math.max(0, lyricSyllables(measure.lyric).length - assignedLyrics);
  const hints = step === "melody" ? getPracticeHarmonyHints(measure.notes, measure.chord, meter) : [];
  const hasSound = measure.notes.some((note) => note.pitch !== null);
  const previewLabel = `${labelPrefix}${index + 1}마디 ${previewActive
    ? previewPreparing ? "준비 취소" : "연주 멈추기"
    : "리듬 미리듣기"}`;

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

      <PracticeEditors notes={measure.notes} meter={meter} step={step} inputMode={practice.inputMode}
        selectedNoteId={practice.selectedNoteId} playingNoteId={playingNoteId} disabled={disabled}
        showTools={false} showSummary={false} compact appendDuration={appendDuration}
        onSelectNote={practice.setSelectedNoteId} onPitch={practice.setPitch} onDuration={practice.setDuration}
        onDelete={practice.deleteNote} onAdd={(beats, pitch, dotted) => practice.addNote(beats, pitch, dotted, index, scoreIndex)}
        onNoteLyric={practice.setNoteLyric} />

      <fieldset className="practice-lyric-area" disabled={disabled}>
        <legend className="practice-sr-only">{labelPrefix}{index + 1}마디 가사</legend>
        <label htmlFor={lyricInputId}>{index + 1}마디 가사 한 줄 넣기</label>
        <div className="practice-lyric-entry">
          <input id={lyricInputId} aria-label={`${labelPrefix}${index + 1}마디 가사`}
            placeholder="위 음표에 맞춰 가사를 적어요" maxLength={200} value={measure.lyric}
            onChange={(event) => practice.setLyric(event.target.value, index, scoreIndex)} />
          {step === "rhythm" && (
            <button type="button" onClick={() => practice.generateRhythm(index, scoreIndex)} disabled={!measure.lyric.trim()}>
              <WandSparkles size={15} /> 가사에 음표 붙이기
            </button>
          )}
        </div>
        {missingLyrics > 0 && (
          <p className="practice-lyric-warning" role="alert">
            가사 {missingLyrics}글자에 아직 음표가 없어요. 음표를 더 넣거나 다음 마디로 나눠 보세요.
          </p>
        )}
      </fieldset>

      <p className={`practice-measure-validation ${validation.state}`}
        role={validation.state === "exact" ? "status" : "alert"}>
        {validation.state === "exact" ? "박자가 딱 맞아요!" : `박자가 맞지 않아요. ${validation.message}`}
      </p>
      {validation.state === "short" && measure.notes.length > 0 && (
        <button type="button" className="practice-fill-rest" disabled={disabled} onClick={() => practice.fillRests(index, scoreIndex)}>
          남은 박자는 쉼표로 채우기
        </button>
      )}

      <button type="button" className={`practice-measure-preview${previewActive ? " is-playing" : ""}`}
        data-testid={`${idPrefix}-measure-preview-${index}`} aria-label={previewLabel}
        disabled={!hasSound || (disabled && !previewActive)} onClick={onPreviewRhythm}>
        {previewActive ? <Square size={15} /> : <Volume2 size={16} />}
        {previewLabel}
      </button>

      {step === "melody" && (
        <div className="practice-measure-harmony">
          <label>어울릴 화음
            <select aria-label={`${index + 1}마디 가락 연습 화음`} disabled={disabled} value={measure.chord}
              onChange={(event) => practice.setChord(event.target.value, index, scoreIndex)}>
              <option value="C">C · 도·미·솔</option>
              <option value="F">F · 파·라·도</option>
              <option value="G">G · 솔·시·레</option>
              <option value="Am">Am · 라·도·미</option>
            </select>
          </label>
          {hints.length > 0 ? (
            <div className="practice-harmony-warning" role="alert">
              <strong>조금 불안정하게 들릴 수 있어요</strong>
              {hints.map((hint) => (
                <button type="button" key={hint.noteId} disabled={disabled}
                  onClick={() => practice.setSelectedNoteId(hint.noteId)}>
                  <Lightbulb size={16} /><span>{hint.message}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="practice-measure-harmony-good">화음과 편안하게 어울려요.</p>
          )}
        </div>
      )}
    </section>
  );
}

import { Music2, Plus, Square, Trash2 } from "../components/AppArtworkIcons";
import PracticeRhythmInstrument from "./PracticeRhythmInstrument";
import { INSTRUMENTS } from "../music/instruments";
import type { usePracticeState } from "./usePracticeState";
import type { usePracticeAudio } from "./usePracticeAudio";

type PracticeRhythmScoresProps = {
  practice: Pick<ReturnType<typeof usePracticeState>,
    "draft" | "step" | "configure" | "scores" | "activeScoreIndex" | "selectScore" | "addRhythmScore" | "removeRhythmScore" | "setRhythmInstrument">;
  audio: Pick<ReturnType<typeof usePracticeAudio>,
    "busy" | "playing" | "previewRhythmMixing" | "stop" | "previewRhythmMix">;
};

export default function PracticeRhythmScores({ practice, audio }: PracticeRhythmScoresProps) {
  const busy = audio.busy || audio.playing;
  const melodyStep = practice.step === "melody";
  const showRhythm = practice.draft.mode !== "melody" && !melodyStep;
  const hasSound = practice.scores.some((score) => score.measures.some((measure) => (
    measure.notes.some((note) => note.pitch !== null)
  )));
  const mixLabel = audio.previewRhythmMixing
    ? audio.busy ? "리듬 함께 듣기 준비 취소" : "겹친 리듬 멈추기"
    : "리듬 함께 듣기";

  return (
    <section className="practice-rhythm-scores" aria-label={showRhythm ? "리듬 악보와 악기 선택" : "가락 악기 선택"}>
      <div className="practice-rhythm-scores-heading">
        <div>
          <h3>악기</h3>
        </div>
        {showRhythm && <button type="button" className="practice-add-score" disabled={busy || practice.scores.length >= 3}
          onClick={practice.addRhythmScore}>
          <Plus size={17} /> 악보 추가하기 <small>{practice.scores.length} / 3</small>
        </button>}
      </div>
      {melodyStep && <label className="practice-melody-instrument">가락 악기
        <select aria-label="가락 연주 악기" value={practice.draft.melodyInstrumentId} disabled={busy}
          onChange={(event) => practice.configure({ melodyInstrumentId: event.target.value })}>
          {INSTRUMENTS.map((instrument) => <option key={instrument.id} value={instrument.id}>{instrument.name}</option>)}
        </select>
      </label>}
      {melodyStep && practice.draft.mode === "rhythm-melody" && <p>
        {practice.scores.length > 1 ? "악보 1의 리듬을" : "만든 리듬을"} 가락 악기로 연주해요.
      </p>}
      {showRhythm && <>
      <div className="practice-score-options">
        {practice.scores.map((score, index) => (
          <div key={score.id} className={`practice-score-option${practice.activeScoreIndex === index ? " is-active" : ""}`}>
            <div className="practice-score-option-heading">
              <button type="button" aria-label={`${index + 1}번 악보 편집`}
                data-testid={`practice-score-select-${index}`} aria-pressed={practice.activeScoreIndex === index}
                disabled={busy} onClick={() => practice.selectScore(index)}>
                <Music2 size={16} /> 악보 {index + 1}
              </button>
              {index > 0 && (
                <button type="button" className="practice-remove-score" aria-label={`${index + 1}번 악보 삭제`}
                  disabled={busy} onClick={() => practice.removeRhythmScore(index)}>
                  <Trash2 size={16} />
                </button>
              )}
            </div>
            <PracticeRhythmInstrument label={index === 0 ? "리듬 연주 악기" : `${index + 1}번 악보 리듬 연주 악기`}
              value={score.instrumentId} disabled={busy}
              onChange={(instrumentId) => practice.setRhythmInstrument(index, instrumentId)} />
          </div>
        ))}
      </div>
      {practice.scores.length > 1 && (
        <div className="practice-score-mix">
          <button type="button" disabled={!hasSound || (busy && !audio.previewRhythmMixing)}
            onClick={() => audio.previewRhythmMixing ? audio.stop() : void audio.previewRhythmMix()}>
            {audio.previewRhythmMixing ? <Square size={16} /> : <Music2 size={18} />}
            {mixLabel}
          </button>
        </div>
      )}
      </>}
    </section>
  );
}

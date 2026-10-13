import { useState, type CSSProperties } from "react";
import { ArrowLeft, ArrowRight, GraduationCap, Lightbulb } from "lucide-react";
import { meterKey, SUPPORTED_METERS } from "../music/meter";
import { useUnsavedWorkWarning } from "../hooks/useUnsavedWorkWarning";
import { PracticeNoteTools } from "./PracticeEditors";
import PracticeMeasureCard from "./PracticeMeasureCard";
import PracticePlayback from "./PracticePlayback";
import PracticeRhythmScores from "./PracticeRhythmScores";
import PracticeTutorial from "./PracticeTutorial";
import { usePracticeAudio } from "./usePracticeAudio";
import { usePracticeState } from "./usePracticeState";
import "./PracticeMode.css";
import "./PracticeOverview.css";
import "./PracticeRhythmScores.css";

type PracticeModeProps = { onClose: () => void };

export default function PracticeMode({ onClose }: PracticeModeProps) {
  const practice = usePracticeState();
  const { draft, active, activeIndex, activeScoreIndex, editingStep, scores, scoreValidations, step, inputMode, complete } = practice;
  const [appendDuration, setAppendDuration] = useState(1);
  const audio = usePracticeAudio({
    measures: draft.measures,
    bpm: draft.bpm,
    melodyInstrumentId: draft.melodyInstrumentId,
    rhythmInstrumentId: draft.rhythmInstrumentId,
    rhythmLayers: draft.rhythmLayers,
    meter: draft.meter,
    step,
    title: draft.title
  });
  useUnsavedWorkWarning(!practice.saved);
  const busy = audio.busy || audio.playing;
  const finishedCount = scoreValidations.flat().filter((item) => item.state === "exact").length;
  const totalMeasures = draft.measures.length * scores.length;

  function close() {
    if (!practice.saved && !window.confirm("연습을 이 기기에 저장하지 못했어요. 화면을 나갈까요?")) return;
    audio.stop();
    onClose();
  }

  return (
    <div className="practice-shell">
      <header className="practice-topbar">
        <button type="button" className="practice-back" onClick={close}><ArrowLeft size={19} /> 돌아가기</button>
        <span className="practice-brand"><GraduationCap size={23} /> 기능 연습하기</span>
        <span className={`practice-save-state${practice.saved ? "" : " failed"}`} role="status">
          {practice.saved ? "이 기기에 자동 저장" : "저장 공간을 확인해 주세요"}
        </span>
      </header>
      <main className="practice-main">
        <div className="practice-intro">
          <div>
            <span className="practice-eyebrow">모든 마디를 함께 보며 연습해요</span>
            <h1>리듬을 만들고<br className="practice-mobile-break" /> 원하면 가락도 더해요</h1>
            <p>박자를 채우면 리듬만으로도 듣고 저장할 수 있어요. 가사와 가락은 원할 때 더해 보세요.</p>
          </div>
          <PracticeTutorial />
        </div>

        <fieldset className="practice-settings" disabled={busy}>
          <legend className="practice-sr-only">연습할 곡 설정</legend>
          <label className="practice-title-field">가락 이름
            <input aria-label="연습 가락 이름" maxLength={80} value={draft.title}
              onChange={(event) => practice.configure({ title: event.target.value })} />
          </label>
          <label>마디 수
            <select aria-label="연습할 마디 수" value={draft.measures.length}
              onChange={(event) => practice.resize(Number(event.target.value))}>
              {Array.from({ length: 8 }, (_, index) => index + 1).map((count) => (
                <option key={count} value={count}>{count}마디</option>
              ))}
            </select>
          </label>
          <label>박자
            <select aria-label="연습 박자" value={meterKey(draft.meter)} onChange={(event) => {
              const meter = SUPPORTED_METERS.find((item) => meterKey(item) === event.target.value);
              if (meter) practice.setMeter(meter);
            }}>
              {SUPPORTED_METERS.map((meter) => (
                <option key={meterKey(meter)} value={meterKey(meter)}>{meterKey(meter)}박자</option>
              ))}
            </select>
          </label>
          <label>빠르기
            <select aria-label="연습 빠르기" value={draft.bpm}
              onChange={(event) => practice.configure({ bpm: Number(event.target.value) })}>
              {[60, 72, 84, 96, 108, 120, 144].map((bpm) => (
                <option key={bpm} value={bpm}>{bpm} BPM{bpm === 72 ? " · 천천히" : bpm === 96 ? " · 보통" : ""}</option>
              ))}
              {![60, 72, 84, 96, 108, 120, 144].includes(draft.bpm) && <option value={draft.bpm}>{draft.bpm} BPM</option>}
            </select>
          </label>
        </fieldset>

        <div className="practice-step-tabs" role="tablist" aria-label="연습 단계">
          <button type="button" role="tab" id="practice-rhythm-tab" aria-controls="practice-workspace"
            aria-selected={step === "rhythm"} disabled={busy} onClick={() => practice.setStep("rhythm")}>
            <span>1</span><div><strong>리듬 만들기</strong><small>모든 마디의 박자 채우기</small></div>
          </button>
          <ArrowRight size={20} aria-hidden="true" />
          <button type="button" role="tab" id="practice-melody-tab" aria-controls="practice-workspace"
            aria-selected={step === "melody"} disabled={busy || (step !== "melody" && !complete)} onClick={practice.goToMelody}>
            <span>2</span><div><strong>가락 만들기</strong><small>선택 · 음높이와 리듬 다듬기</small></div>
          </button>
        </div>

        <section className="practice-workspace" id="practice-workspace" role="tabpanel" aria-labelledby={`practice-${step}-tab`}>
          <div className="practice-workspace-heading">
            <div>
              <h2>{step === "rhythm" ? "모든 마디에 리듬을 채워요" : "모든 마디의 가락을 만들어 봐요"}</h2>
              <p>{step === "rhythm" ? "마디 이름을 누르고 길이를 골라 음표나 쉼표를 넣어요. 칸 채우기에서는 배치한 칸을 다시 누르면 삭제돼요." : "음높이를 바꾸고, 필요하면 음표 길이와 쉼표도 바로 고쳐요."}</p>
            </div>
            <div className="practice-input-toggle" role="group" aria-label="음표 입력 방식">
              <button type="button" aria-pressed={inputMode === "grid"} disabled={busy} onClick={() => practice.setInputMode("grid")}>칸 채우기</button>
              <button type="button" aria-pressed={inputMode === "score"} disabled={busy} onClick={() => practice.setInputMode("score")}>악보에 넣기</button>
            </div>
          </div>

          <PracticeRhythmScores practice={practice} audio={audio} />

          <div className="practice-shared-tools">
            <p className="practice-current-measure" role="status">{scores.length > 1 ? `${activeScoreIndex + 1}번 악보 · ` : ""}{activeIndex + 1}마디 편집 중 · {inputMode === "grid" && editingStep === "rhythm"
              ? "배치한 칸을 누르면 삭제돼요. 길이는 아래 가사 칸을 눌러 선택한 뒤 바꿔요."
              : "음표를 누르면 길이를 바꿀 수 있어요"}</p>
            {draft.meter.beatUnit === 8 && <p className="practice-editor-help">이 표에서 1박은 4분음표 길이예요. 6/8박자는 0.5박 칸 6개를 채워요.</p>}
            <PracticeNoteTools notes={active.notes} meter={draft.meter} step={editingStep} inputMode={inputMode}
              selectedNoteId={practice.selectedNoteId} disabled={busy} appendDuration={appendDuration}
              onAppendDurationChange={setAppendDuration} onSelectNote={practice.setSelectedNoteId}
              onPitch={practice.setPitch} onDuration={practice.setDuration} onDelete={practice.deleteNote}
              onAdd={practice.addNote} />
          </div>

          {scores.map((score, scoreIndex) => (
            <section key={score.id} className="practice-score-workspace" data-testid={`practice-score-workspace-${scoreIndex}`}>
              {scores.length > 1 && (
                <div className="practice-score-workspace-heading">
                  <h3>악보 {scoreIndex + 1} · {scoreIndex === 0 && step === "melody" ? "가락" : "리듬"}</h3>
                  <button type="button" disabled={busy} onClick={() => practice.selectScore(scoreIndex)}>
                    {activeScoreIndex === scoreIndex ? "편집 중" : "이 악보 편집"}
                  </button>
                </div>
              )}
              <div className="practice-measures-overview" style={{ "--practice-columns": Math.min(4, draft.measures.length) } as CSSProperties}>
                {score.measures.map((measure, index) => {
                  const previewActive = audio.previewMeasureIndex === index && audio.previewScoreIndex === scoreIndex;
                  const playingNoteId = audio.playingNoteIds.find((id) => measure.notes.some((note) => note.id === id)) ?? audio.playingNoteId;
                  return (
                    <PracticeMeasureCard key={measure.id} measure={measure} index={index} scoreIndex={scoreIndex} meter={draft.meter}
                      validation={scoreValidations[scoreIndex][index]} practice={practice} disabled={busy}
                      playingNoteId={playingNoteId} appendDuration={appendDuration}
                      previewActive={previewActive} previewPreparing={audio.busy}
                      onPreviewRhythm={() => previewActive ? audio.stop() : void audio.previewMeasure(index, scoreIndex)} />
                  );
                })}
              </div>
            </section>
          ))}

          {practice.notice && <p className="practice-notice" role="status">{practice.notice}</p>}
          <div className="practice-workspace-footer">
            <span>{finishedCount} / {totalMeasures}마디 박자 완성</span>
            {step === "rhythm" ? (
              <div className="practice-stage-next">
                <small>{complete
                  ? "완성한 리듬은 아래에서 바로 저장해요. 가락 만들기는 선택이에요."
                  : "모든 마디의 박자를 완성하면 저장하거나 가락을 만들 수 있어요."}</small>
                <button type="button" className="practice-primary" disabled={busy || !complete} onClick={practice.goToMelody}>
                  가락 만들기로 <ArrowRight size={17} />
                </button>
              </div>
            ) : (
              <button type="button" disabled={busy} onClick={() => practice.setStep("rhythm")}>
                <ArrowLeft size={17} /> 리듬 만들기로
              </button>
            )}
          </div>
        </section>

        <PracticePlayback draft={draft} step={step} complete={complete} audio={audio} onConfigure={practice.configure} />
        <section className="practice-overview-tip" aria-label="연습 힌트">
          <Lightbulb size={21} />
          <p>{step === "rhythm"
            ? "4분음표는 1박, 8분음표는 반 박이에요. 쉼표도 박자를 채워요. 음표 아래 빈칸에 가사를 한 글자씩 넣어 보세요."
            : "가락을 만드는 중에도 리듬을 고칠 수 있어요. 박자가 부족하거나 넘치면 마디 아래 안내를 보고 다시 맞춰 주세요. 화음 힌트는 하나의 길잡이예요."}</p>
        </section>
      </main>
    </div>
  );
}

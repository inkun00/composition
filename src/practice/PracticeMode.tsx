import { useState, type CSSProperties } from "react";
import { ArrowLeft, ArrowRight, GraduationCap, Square, Volume2 } from "lucide-react";
import { meterKey, SUPPORTED_METERS } from "../music/meter";
import { useUnsavedWorkWarning } from "../hooks/useUnsavedWorkWarning";
import { PracticeNoteTools } from "./PracticeEditors";
import PracticeMeasureCard from "./PracticeMeasureCard";
import PracticePlayback from "./PracticePlayback";
import PracticeRhythmScores from "./PracticeRhythmScores";
import PracticeStages from "./PracticeStages";
import PracticeTutorial from "./PracticeTutorial";
import type { PracticeVideoMode } from "./practiceVideoTypes";
import { usePracticeAudio } from "./usePracticeAudio";
import { usePracticeState } from "./usePracticeState";
import "./PracticeMode.css";
import "./PracticeOverview.css";
import "./PracticeRhythmScores.css";
import "./PracticeSaving.css";

type PracticeModeProps = { onClose: () => void };

export default function PracticeMode({ onClose }: PracticeModeProps) {
  const practice = usePracticeState();
  const { draft, activeIndex, activeScoreIndex, scores, scoreValidations, step, inputMode, complete } = practice;
  const [appendDuration, setAppendDuration] = useState(1);
  const [appendRest, setAppendRest] = useState(false);
  const [saving, setSaving] = useState(false);
  const [videoMode, setVideoMode] = useState<PracticeVideoMode>("bars");
  const audio = usePracticeAudio({
    measures: draft.measures,
    bpm: draft.bpm,
    melodyInstrumentId: draft.melodyInstrumentId,
    rhythmInstrumentId: draft.rhythmInstrumentId,
    rhythmLayers: draft.rhythmLayers,
    meter: draft.meter,
    step,
    videoMode,
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
          {practice.saved ? "자동 저장됨" : "저장 공간을 확인해 주세요"}
        </span>
      </header>
      <main className="practice-main">
        <div className="practice-intro">
          <h1>음악 만들기</h1>
          <PracticeTutorial />
        </div>

        <fieldset className="practice-settings" disabled={busy} hidden={saving}>
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

        <PracticeStages step={step} saving={saving} busy={busy}
          onRhythm={() => { setSaving(false); practice.setStep("rhythm"); }}
          onMelody={() => { setSaving(false); practice.goToMelody(); }} onSave={() => setSaving(true)} />

        <section className="practice-workspace" id="practice-workspace" role="tabpanel" hidden={saving}
          aria-labelledby={`practice-${step}-tab`}>
          <h2 className="practice-sr-only">{step === "rhythm" ? "리듬" : "가락"}</h2>

          <PracticeRhythmScores practice={practice} audio={audio} />

          {scores.map((score, scoreIndex) => {
            const scorePreviewActive = audio.previewScoreIndex === scoreIndex && audio.previewMeasureIndex === null;
            const hasSound = score.measures.some((measure) => measure.notes.some((note) => note.pitch !== null));
            const scorePreviewLabel = `악보${scoreIndex + 1} ${scorePreviewActive
              ? audio.busy ? "준비 취소" : "멈추기"
              : "미리듣기"}`;
            return (
            <section key={score.id} className="practice-score-workspace" data-testid={`practice-score-workspace-${scoreIndex}`}>
              <div className="practice-score-workspace-heading">
                <h3>악보 {scoreIndex + 1} · {scoreIndex === 0 && step === "melody" ? "가락" : "리듬"}</h3>
                <div className="practice-score-workspace-actions">
                  <button type="button" className="practice-score-preview" data-testid={`practice-score-preview-${scoreIndex}`}
                    disabled={!hasSound || (busy && !scorePreviewActive)} aria-pressed={scorePreviewActive}
                    onClick={() => scorePreviewActive ? audio.stop() : void audio.previewScore(scoreIndex)}>
                    {scorePreviewActive ? <Square size={16} /> : <Volume2 size={17} />}
                    {scorePreviewLabel}
                  </button>
                  {scores.length > 1 && (
                    <button type="button" disabled={busy} onClick={() => practice.selectScore(scoreIndex)}>
                      {activeScoreIndex === scoreIndex ? "편집 중" : "이 악보 편집"}
                    </button>
                  )}
                </div>
              </div>
              <div className="practice-shared-tools" data-testid={`practice-score-tools-${scoreIndex}`}>
                <p className="practice-current-measure" role={activeScoreIndex === scoreIndex ? "status" : undefined}>
                  {scores.length > 1 ? `${scoreIndex + 1}번 악보 · ` : ""}{activeIndex + 1}마디에 넣기
                </p>
                {draft.meter.beatUnit === 8 && <p className="practice-editor-help">6/8박자 · 8분음표 6개가 한 마디예요.</p>}
                <PracticeNoteTools notes={score.measures[activeIndex].notes} meter={draft.meter}
                  step={scoreIndex === 0 ? step : "rhythm"} inputMode={inputMode}
                  selectedNoteId={practice.selectedNoteId} disabled={busy}
                  appendDuration={appendDuration} appendRest={appendRest}
                  onAppendDurationChange={setAppendDuration} onAppendRestChange={setAppendRest}
                  onSelectNote={practice.setSelectedNoteId} onPitch={practice.setPitch}
                  onDuration={practice.setDuration} onDelete={practice.deleteNote}
                  onAdd={(beats, pitch, dotted) => practice.addNote(beats, pitch, dotted, activeIndex, scoreIndex)} />
              </div>
              <div className="practice-input-toggle practice-measure-input-toggle" role="group"
                aria-label={scoreIndex === 0 ? "음표 입력 방식" : `${scoreIndex + 1}번 악보 음표 입력 방식`}>
                <button type="button" aria-pressed={inputMode === "grid"} disabled={busy}
                  onClick={() => practice.setInputMode("grid")}>칸 채우기</button>
                <button type="button" aria-pressed={inputMode === "score"} disabled={busy}
                  onClick={() => practice.setInputMode("score")}>악보에 넣기</button>
              </div>
              <div className="practice-measures-overview" style={{ "--practice-columns": Math.min(4, draft.measures.length) } as CSSProperties}>
                {score.measures.map((measure, index) => {
                  const previewActive = audio.previewMeasureIndex === index && audio.previewScoreIndex === scoreIndex;
                  const playingNoteId = audio.playingNoteIds.find((id) => measure.notes.some((note) => note.id === id)) ?? audio.playingNoteId;
                  const playbackActive = scorePreviewActive && measure.notes.some((note) => note.id === playingNoteId);
                  return (
                    <PracticeMeasureCard key={measure.id} measure={measure} index={index} scoreIndex={scoreIndex} meter={draft.meter}
                      validation={scoreValidations[scoreIndex][index]} practice={practice} disabled={busy}
                      playingNoteId={playingNoteId} appendDuration={appendDuration} appendRest={appendRest}
                      previewActive={previewActive} playbackActive={playbackActive} previewPreparing={audio.busy}
                      onPreviewRhythm={() => previewActive ? audio.stop() : void audio.previewMeasure(index, scoreIndex)} />
                  );
                })}
              </div>
            </section>
            );
          })}

          {practice.notice && <p className="practice-notice" role="status">{practice.notice}</p>}
          <div className="practice-workspace-footer">
            <span>{finishedCount} / {totalMeasures}마디 박자 완성</span>
            {step === "rhythm" ? (
              <div className="practice-stage-next">
                <button type="button" className="practice-primary" disabled={busy} onClick={practice.goToMelody}>
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

        <PracticePlayback draft={draft} step={step} complete={complete} audio={audio} onConfigure={practice.configure}
          saving={saving} videoMode={videoMode} onVideoMode={setVideoMode} onSaveSettings={() => setSaving(true)}
          onReturnToEditing={() => setSaving(false)} />
      </main>
    </div>
  );
}

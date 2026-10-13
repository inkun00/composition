import { ArrowLeft, Download, Headphones, Music2, SlidersHorizontal, Square, Video } from "lucide-react";
import { INSTRUMENTS } from "../music/instruments";
import { lyricSyllables } from "./practiceModel";
import type { PracticeDraft } from "./practiceStorage";
import type { usePracticeAudio } from "./usePracticeAudio";
import type { PracticeVideoMode } from "./practiceVideoTypes";
import PracticeVideoPreview from "./PracticeVideoPreview";

type PracticePlaybackProps = {
  draft: PracticeDraft;
  step: "rhythm" | "melody";
  complete: boolean;
  audio: ReturnType<typeof usePracticeAudio>;
  onConfigure: (change: Partial<Omit<PracticeDraft, "measures" | "rhythmLayers" | "version">>) => void;
  saving: boolean;
  videoMode: PracticeVideoMode;
  onVideoMode: (mode: PracticeVideoMode) => void;
  onSaveSettings: () => void;
  onReturnToEditing: () => void;
};

export default function PracticePlayback({ draft, step, complete, audio, onConfigure, saving, videoMode,
  onVideoMode, onSaveSettings, onReturnToEditing }: PracticePlaybackProps) {
  const busy = audio.busy || audio.playing;
  const separatePreviewActive = audio.previewMeasureIndex !== null || audio.previewRhythmMixing;
  const wholePlaying = audio.playing && !separatePreviewActive;
  const allMeasures = [draft.measures, ...draft.rhythmLayers.map((layer) => layer.measures)].flat();
  const hasLyrics = allMeasures.some((measure) => lyricSyllables(measure.lyric).length > 0);
  const allLyricsPlaced = allMeasures.every((measure) => {
    const entered = lyricSyllables(measure.lyric).length;
    const placed = measure.notes.reduce((sum, note) => sum + (note.pitch === null ? 0 : lyricSyllables(note.lyric ?? "").length), 0);
    return entered === placed;
  });

  return (
    <section className={`practice-listen-card${saving ? " practice-save-panel" : ""}`}
      id={saving ? "practice-save-panel" : undefined} role={saving ? "tabpanel" : undefined}
      aria-labelledby={saving ? "practice-save-tab" : undefined}
      aria-label={saving ? undefined : "리듬 입력 후 악기와 저장 설정"}>
      <div className="practice-listen-intro">
        <span className="practice-card-icon"><Headphones size={25} /></span>
        <div>
          <h2>{saving ? "음악 저장하기" : step === "rhythm" ? "리듬 듣고 저장하기" : "가락 듣고 저장하기"}</h2>
          <p>{saving ? `완성한 ${step === "rhythm" ? "리듬" : "가락과 리듬"}을 소리나 영상으로 간직해요. 가사는 선택이에요.`
            : "각 마디를 따로 듣거나, 위에서 고른 악기들의 리듬을 함께 들어 보세요."}</p>
        </div>
        {saving && <button type="button" className="practice-return-to-editor" disabled={busy} onClick={onReturnToEditing}>
          <ArrowLeft size={16} /> {step === "rhythm" ? "리듬" : "가락"} 편집으로
        </button>}
      </div>
      {saving && <>
        <fieldset className="practice-video-modes" disabled={busy}>
          <legend>MP4 저장 화면</legend>
          <div role="group" aria-label="MP4 저장 모드">
            <button type="button" aria-pressed={videoMode === "bars"} onClick={() => onVideoMode("bars")}>
              <span className="practice-bars-mode-icon" aria-hidden="true"><i /><i /><i /></span>
              <strong>막대 모드</strong><small>막대의 길이로 리듬을, 높이로 가락을 보여요.</small>
            </button>
            <button type="button" aria-pressed={videoMode === "score"} onClick={() => onVideoMode("score")}>
              <Music2 size={26} aria-hidden="true" />
              <strong>악보 모드</strong><small>내가 만든 음표와 쉼표를 악보 그대로 보여요.</small>
            </button>
          </div>
        </fieldset>
        <PracticeVideoPreview draft={draft} step={step} mode={videoMode} disabled={busy} />
      </>}
      <div className="practice-listen-controls">
        {step === "melody" ? <fieldset disabled={busy} className="practice-instrument-fields">
          <legend className="practice-sr-only">연습 악기 선택</legend>
          <label>가락 악기
            <select aria-label="가락 연주 악기" value={draft.melodyInstrumentId}
              onChange={(event) => onConfigure({ melodyInstrumentId: event.target.value })}>
              {INSTRUMENTS.map((instrument) => (
                <option key={instrument.id} value={instrument.id}>{instrument.name}</option>
              ))}
            </select>
          </label>
        </fieldset> : <p className="practice-rhythm-save-intro">
          <strong>리듬만 완성해도 저장할 수 있어요.</strong>
          모든 악보의 박자를 채우고 MP3 또는 MP4 저장을 눌러요. 가락 만들기는 원하는 때 선택해요.
        </p>}
        <div className="practice-listen-buttons">
          <button type="button" className="practice-preview" disabled={!complete || audio.busy || separatePreviewActive}
            onClick={() => wholePlaying ? audio.stop() : void audio.preview()}>
            {wholePlaying ? <Square size={18} /> : <Music2 size={20} />}
            {wholePlaying ? "연주 멈추기" : `${step === "rhythm" ? "리듬" : "가락"} 미리듣기`}
          </button>
          <div className="practice-export-actions">
            <button type="button" disabled={!complete || busy} onClick={() => void audio.save("mp3")}>
              <Download size={17} /> MP3 저장
            </button>
            <button type="button" disabled={!complete || busy || !allLyricsPlaced}
              onClick={() => void audio.save("mp4")}>
              <Video size={17} /> MP4 저장
            </button>
          </div>
        </div>
      </div>
      <small>MP3: 모든 악보를 함께 연주한 소리 · MP4: {videoMode === "bars" ? "리듬과 가락을 막대로 보여주는 화면" : "내가 만든 악보 화면"}과 연주 소리.
        가사가 있으면 해당 음표 아래에 함께 표시해요.</small>
      {!saving && <button type="button" className="practice-save-settings-shortcut" disabled={busy} onClick={onSaveSettings}>
        <SlidersHorizontal size={16} /> 음악 저장 설정
      </button>}
      {!complete && <p className="practice-export-help">마디별 리듬은 완성 전에도 들을 수 있어요. 전체 미리듣기와 저장은 모든 마디의 박자를 채우면 열려요.</p>}
      {complete && hasLyrics && !allLyricsPlaced && (
        <p className="practice-export-help">가사가 있는 MP4는 모든 가사 글자에 음표를 붙인 뒤 저장할 수 있어요.</p>
      )}
      {audio.busy && (
        <div className="practice-export-progress">
          <progress aria-label="연습 파일 준비 진행률" max={100} value={audio.progress} />
          <button type="button" onClick={audio.stop}>취소</button>
        </div>
      )}
      {audio.status && <p className="practice-audio-status" role="status" aria-live="polite">{audio.status}</p>}
    </section>
  );
}

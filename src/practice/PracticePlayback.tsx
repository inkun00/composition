import { useRef, useState } from "react";
import { ArrowLeft, Download, ExternalLink, Music2, SlidersHorizontal, Square, Video } from "../components/AppArtworkIcons";
import AppArtwork from "../components/AppArtwork";
import { BEAT_INSTRUMENTS } from "../music/beatInstruments";
import { findInstrument } from "../music/instruments";
import { lyricSyllables } from "./practiceModel";
import type { PracticeDraft } from "./practiceStorage";
import type { usePracticeAudio } from "./usePracticeAudio";
import type { PracticeVideoMode } from "./practiceVideoTypes";
import PracticeVideoPreview from "./PracticeVideoPreview";
import PracticeExportRecovery from "./PracticeExportRecovery";
import PracticeVideoChoiceDialog from "./PracticeVideoChoiceDialog";
import { PRACTICE_SHARE_URL } from "./PracticeStages";
import "./PracticePlayback.css";
import "../components/AppExperienceArtwork.css";

type PracticePlaybackProps = {
  draft: PracticeDraft;
  step: "rhythm" | "melody";
  complete: boolean;
  audio: ReturnType<typeof usePracticeAudio>;
  saving: boolean;
  videoMode: PracticeVideoMode;
  onVideoMode: (mode: PracticeVideoMode) => void;
  onSaveSettings: () => void;
  onReturnToEditing: () => void;
  onEditLyrics?: (scoreIndex: number, measureIndex: number) => void;
  onBeforeRefresh?: () => void;
};

export default function PracticePlayback({ draft, step, complete, audio, saving, videoMode,
  onVideoMode, onSaveSettings, onReturnToEditing, onEditLyrics, onBeforeRefresh }: PracticePlaybackProps) {
  const [videoChoiceOpen, setVideoChoiceOpen] = useState(false);
  const videoChoiceConfirmed = useRef(false);
  const busy = audio.busy || audio.playing;
  const separatePreviewActive = audio.previewScoreIndex !== null || audio.previewMeasureIndex !== null ||
    audio.previewRhythmMixing || audio.previewHarmonyIndex != null;
  const wholePlaying = audio.playing && !separatePreviewActive;
  const musicLabel = step === "rhythm" ? "리듬" : "가락";
  const scores = [draft.measures, ...(step === "melody" ? [] : draft.rhythmLayers.map((layer) => layer.measures))];
  const lyricIssues = scores.flatMap((measures, scoreIndex) => measures.flatMap((measure, measureIndex) => {
    const entered = lyricSyllables(measure.lyric).length;
    const placed = measure.notes.reduce((sum, note) => sum + (note.pitch === null ? 0 : lyricSyllables(note.lyric ?? "").length), 0);
    return entered === placed ? [] : [{ scoreIndex, measureIndex, missing: Math.max(0, entered - placed) }];
  }));
  const allLyricsPlaced = lyricIssues.length === 0;
  const firstLyricIssue = lyricIssues[0];
  const instrumentIds = step === "melody" ? [draft.melodyInstrumentId]
    : [draft.rhythmInstrumentId, ...draft.rhythmLayers.map((layer) => layer.instrumentId)];
  const instrumentNames = instrumentIds.map((id) => {
    const beat = BEAT_INSTRUMENTS.find((instrument) => instrument.id === id.replace(/^beat:/, ""));
    return beat?.name ?? findInstrument(id).name;
  });

  function openVideoChoice() {
    if (!complete || busy || !allLyricsPlaced) return;
    videoChoiceConfirmed.current = false;
    setVideoChoiceOpen(true);
  }

  function confirmVideoChoice(mode: PracticeVideoMode) {
    if (!videoChoiceOpen || videoChoiceConfirmed.current || !complete || busy || !allLyricsPlaced) return;
    videoChoiceConfirmed.current = true;
    setVideoChoiceOpen(false);
    void audio.save("mp4", { videoMode: mode });
  }

  return (
    <section className={`practice-listen-card${saving ? " practice-save-panel" : ""}`}
      id={saving ? "practice-save-panel" : undefined} role={saving ? "tabpanel" : undefined}
      aria-labelledby={saving ? "practice-save-tab" : undefined}
      aria-label={saving ? undefined : "음악 듣기와 저장 설정"}>
      <div className="practice-listen-intro">
        <AppArtwork name={saving ? "publishing-stage" : step === "rhythm" ? "rhythm-stage" : "melody-stage"}
          size={112} className="app-practice-output-art" />
        <div>
          <h2>{saving ? "음악 저장하기" : `${musicLabel} 듣고 저장하기`}</h2>
        </div>
        {saving && <button type="button" className="practice-return-to-editor" disabled={busy} onClick={onReturnToEditing}>
          <ArrowLeft size={16} /> {step === "rhythm" ? "리듬" : "가락"} 편집으로
        </button>}
      </div>
      <p className="practice-output-summary">
        저장할 소리: {step === "melody" ? "가락" : scores.length > 1 ? "리듬 합주" : "리듬"} · {instrumentNames.join(" + ")}
      </p>
      {saving && <>
        <fieldset className="practice-video-modes" disabled={busy}>
          <legend>MP4 저장 화면</legend>
          <div role="group" aria-label="MP4 저장 모드">
            <button type="button" aria-pressed={videoMode === "bars"} onClick={() => onVideoMode("bars")}>
              <AppArtwork name="layers" size={30} />
              <strong>막대 모드</strong>
            </button>
            <button type="button" aria-pressed={videoMode === "score"} onClick={() => onVideoMode("score")}>
              <Music2 size={26} aria-hidden="true" />
              <strong>악보 모드</strong>
            </button>
          </div>
        </fieldset>
        <PracticeVideoPreview draft={draft} step={step} mode={videoMode} disabled={busy} />
      </>}
      <div className="practice-listen-controls is-rhythm">
        <div className="practice-listen-buttons">
          <button type="button" className="practice-preview" disabled={!complete || audio.busy || separatePreviewActive}
            onClick={() => wholePlaying ? audio.stop() : void audio.preview()}>
            {wholePlaying ? <Square size={18} /> : <Music2 size={20} />}
            {wholePlaying ? "연주 멈추기" : `${musicLabel} 미리듣기`}
          </button>
          <div className="practice-export-actions">
            <button type="button" disabled={!complete || busy} onClick={() => void audio.save("mp3")}>
              <Download size={17} /> 소리 파일(MP3)
            </button>
            <button type="button" disabled={!complete || busy || !allLyricsPlaced}
              aria-haspopup="dialog" aria-expanded={videoChoiceOpen} onClick={openVideoChoice}>
              <Video size={17} /> 음악 영상(MP4)
            </button>
          </div>
        </div>
      </div>
      {saving && <a className="practice-save-share-link" href={PRACTICE_SHARE_URL} target="_blank" rel="noopener noreferrer">
        <ExternalLink size={16} aria-hidden="true" /> 저장한 파일을 게시판에 첨부
      </a>}
      {!saving && <button type="button" className="practice-save-settings-shortcut" disabled={busy} onClick={onSaveSettings}>
        <SlidersHorizontal size={16} /> 음악 저장 설정
      </button>}
      {!complete && <p className="practice-export-help">모든 마디의 박자를 채우면 전체 듣기와 저장이 열려요.</p>}
      {complete && firstLyricIssue && (
        <div className="practice-export-help practice-lyric-fix" role="status">
          <span>영상에 넣을 가사 {firstLyricIssue.missing > 0 ? `${firstLyricIssue.missing}글자가 남았어요.` : "배치를 확인해 주세요."}</span>
          {onEditLyrics && <button type="button" disabled={busy}
            onClick={() => onEditLyrics(firstLyricIssue.scoreIndex, firstLyricIssue.measureIndex)}>
            {scores.length > 1 ? `악보 ${firstLyricIssue.scoreIndex + 1} · ` : ""}{firstLyricIssue.measureIndex + 1}마디 가사 고치기
          </button>}
        </div>
      )}
      {audio.busy && (
        <div className="practice-export-progress">
          <progress aria-label="연습 파일 준비 진행률" max={100} value={audio.progress} />
          <button type="button" onClick={audio.stop}>취소</button>
        </div>
      )}
      {audio.status && <p className="practice-audio-status" role="status" aria-live="polite">{audio.status}</p>}
      {audio.exportNeedsRefresh && <PracticeExportRecovery draft={draft} onBeforeRefresh={onBeforeRefresh} />}
      {videoChoiceOpen && <PracticeVideoChoiceDialog draft={draft} step={step} mode={videoMode}
        disabled={busy} onConfirm={confirmVideoChoice} onClose={() => setVideoChoiceOpen(false)} />}
    </section>
  );
}

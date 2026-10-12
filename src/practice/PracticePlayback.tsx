import { Download, Headphones, Music2, Square, Video } from "lucide-react";
import { INSTRUMENTS } from "../music/instruments";
import { lyricSyllables } from "./practiceModel";
import type { PracticeDraft } from "./practiceStorage";
import type { usePracticeAudio } from "./usePracticeAudio";

type PracticePlaybackProps = {
  draft: PracticeDraft;
  step: "rhythm" | "melody";
  complete: boolean;
  audio: ReturnType<typeof usePracticeAudio>;
  onConfigure: (change: Partial<Omit<PracticeDraft, "measures" | "rhythmLayers" | "version">>) => void;
};

export default function PracticePlayback({ draft, step, complete, audio, onConfigure }: PracticePlaybackProps) {
  const busy = audio.busy || audio.playing;
  const separatePreviewActive = audio.previewMeasureIndex !== null || audio.previewRhythmMixing;
  const wholePlaying = audio.playing && !separatePreviewActive;
  const hasLyrics = draft.measures.some((measure) => lyricSyllables(measure.lyric).length > 0);
  const allLyricsPlaced = draft.measures.every((measure) => {
    const entered = lyricSyllables(measure.lyric).length;
    const placed = measure.notes.reduce((sum, note) => sum + (note.pitch === null ? 0 : lyricSyllables(note.lyric ?? "").length), 0);
    return entered === placed;
  });

  return (
    <section className="practice-listen-card" aria-label="리듬 입력 후 악기와 저장 설정">
      <div className="practice-listen-intro">
        <span className="practice-card-icon"><Headphones size={25} /></span>
        <div>
          <h2>내가 만든 소리 듣기</h2>
          <p>각 마디를 따로 듣거나, 위에서 고른 악기들의 리듬을 함께 들어 보세요.</p>
        </div>
      </div>
      <div className="practice-listen-controls">
        <fieldset disabled={busy} className="practice-instrument-fields">
          <legend className="practice-sr-only">연습 악기 선택</legend>
          <label>가락 악기
            <select aria-label="가락 연주 악기" value={draft.melodyInstrumentId}
              onChange={(event) => onConfigure({ melodyInstrumentId: event.target.value })}>
              {INSTRUMENTS.map((instrument) => (
                <option key={instrument.id} value={instrument.id}>{instrument.name}</option>
              ))}
            </select>
          </label>
        </fieldset>
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
            <button type="button" disabled={!complete || busy || !hasLyrics || !allLyricsPlaced}
              onClick={() => void audio.save("mp4")}>
              <Video size={17} /> MP4 저장
            </button>
          </div>
        </div>
      </div>
      <small>MP3: 모든 악보를 함께 연주한 소리 · MP4: 검은 화면 + 첫 악보 가사 + 함께 연주한 소리</small>
      {!complete && <p className="practice-export-help">마디별 리듬은 완성 전에도 들을 수 있어요. 전체 미리듣기와 저장은 모든 마디의 박자를 채우면 열려요.</p>}
      {complete && (!hasLyrics || !allLyricsPlaced) && (
        <p className="practice-export-help">MP4는 가사를 적고 각 글자에 음표를 붙인 뒤 저장할 수 있어요.</p>
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

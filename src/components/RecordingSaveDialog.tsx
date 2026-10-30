import { useId } from "react";
import { createPortal } from "react-dom";
import { useDialogFocus } from "../hooks/useDialogFocus";
import { FileVideo, Headphones, X } from "./AppArtworkIcons";
import SceneArt from "../musicVideo/SceneArt";
import type { MusicVideoScene } from "../video/musicVideoModel";
import "./RecordingSaveDialog.css";

export type RecordingSaveDialogProps = Readonly<{
  scenes: readonly MusicVideoScene[];
  videoUnavailableReason: string | null;
  busy: boolean;
  progress: number;
  status: string;
  onSaveMp3: () => void;
  onSaveMp4: () => void;
  onClose: () => void;
  onCancel: () => void;
}>;

export default function RecordingSaveDialog({ scenes, videoUnavailableReason, busy, progress, status,
  onSaveMp3, onSaveMp4, onClose, onCancel }: RecordingSaveDialogProps) {
  const id = useId();
  const ref = useDialogFocus<HTMLElement>();
  const drawing = scenes.find((scene) => scene.section !== "intro" && scene.elements.length > 0) ??
    scenes.find((scene) => scene.elements.length > 0);
  return createPortal(
    <div className="recording-save-overlay" role="presentation"
      onMouseDown={(event) => { if (!busy && event.target === event.currentTarget) onClose(); }}>
      <section ref={ref} className="recording-save-dialog" role="dialog" aria-modal="true" tabIndex={-1}
        aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          event.stopPropagation();
          if (!busy) onClose();
        }}>
        <header>
          <h2 id={`${id}-title`}>녹음 파일로 저장</h2>
          <button type="button" className="recording-save-close" aria-label="녹음 파일 저장 닫기"
            disabled={busy} onClick={onClose}><X size={26} /></button>
        </header>
        <p id={`${id}-description`}>어떤 파일로 저장할까요?</p>
        <div className="recording-save-options">
          <button type="button" className="recording-save-option" aria-label="MP3로 저장"
            disabled={busy} onClick={onSaveMp3}>
            <span className="recording-save-art" aria-hidden="true"><Headphones size={48} /></span>
            <strong>MP3로 저장</strong>
            <span>녹음한 노래를 소리 파일로</span>
          </button>
          <button type="button" className="recording-save-option" aria-label="내 그림 뮤직비디오 MP4로 저장"
            data-testid="recording-save-mp4"
            disabled={busy || Boolean(videoUnavailableReason)} onClick={onSaveMp4}
            aria-describedby={videoUnavailableReason ? `${id}-video-reason` : undefined}>
            <span className={`recording-save-art recording-save-video-art${drawing ? " has-drawing" : ""}`}
              data-testid="recording-save-drawing-preview" role={drawing ? "img" : undefined}
              aria-label={drawing ? "장면 그리기에서 만든 그림 미리보기" : undefined} aria-hidden={!drawing || undefined}>
              {drawing ? <SceneArt scene={drawing} /> : <FileVideo size={48} />}
            </span>
            <strong>내 그림 뮤직비디오 MP4로 저장</strong>
            <span>직접 그린 그림·움직임 + 녹음한 노래</span>
          </button>
        </div>
        {videoUnavailableReason && <p className="recording-save-help" id={`${id}-video-reason`}>
          {videoUnavailableReason}
        </p>}
        {busy && <div className="recording-save-progress">
          <progress max={100} value={Math.max(0, Math.min(100, progress))} aria-label="녹음 뮤직비디오 만들기 진행률" />
          <span>{Math.round(Math.max(0, Math.min(100, progress)))}%</span>
        </div>}
        {status && <p className="recording-save-status" role="status">{status}</p>}
        <footer>
          {busy ? <button type="button" onClick={onCancel}>만들기 취소</button>
            : <button type="button" onClick={onClose}>취소</button>}
        </footer>
      </section>
    </div>, document.body
  );
}

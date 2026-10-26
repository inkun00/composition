import { CheckCircle2, X } from "./AppArtworkIcons";
import type { CompositionMediaExportController } from "../hooks/useCompositionMediaExport";
import { useDialogFocus } from "../hooks/useDialogFocus";
import ComposerChildArtwork from "./ComposerChildArtwork";
import "./CompositionFileExports.css";

export default function CompositionMediaExportDialog({ media }: Readonly<{ media: CompositionMediaExportController }>) {
  const ref = useDialogFocus();
  const video = media.format === "mp4";
  const working = media.phase === "working";
  const label = video ? "가사 영상" : "반주 파일";
  return <div ref={ref} className="backing-export-overlay" role="dialog" aria-modal="true" tabIndex={-1}
    aria-labelledby="backing-export-title" aria-describedby="backing-export-description">
    <section className={`backing-export-dialog ${media.phase}`} aria-busy={working}>
      <header className="backing-export-header" role="status" aria-live="polite">
        <span>{media.phase === "done" ? "저장 완료" : media.phase === "error" ? "다시 확인해요" : video ? "가사 영상 제작실" : "반주 제작실"}</span>
        <h2 id="backing-export-title">{media.phase === "done" ? `${label}을 저장했어요!`
          : media.phase === "error" ? `${label}을 완성하지 못했어요` : `${label} 만드는 중`}</h2>
        <p id="backing-export-description">{media.status}</p>
      </header>
      <div className="backing-export-studio composer-export-children" aria-hidden="true">
        <ComposerChildArtwork kind="exportKeyboard" />
        <ComposerChildArtwork kind="exportRhythm" />
        <ComposerChildArtwork kind="exportMix" />
        <div className="backing-export-note note-one">♪</div>
        <div className="backing-export-note note-two">♫</div>
        <div className="backing-export-note note-three">♪</div>
        {media.phase === "done" && <div className="backing-export-complete-mark"><CheckCircle2 /></div>}
        {media.phase === "error" && <div className="backing-export-complete-mark error"><X /></div>}
      </div>
      <div className="backing-export-progress">
        {video ? <progress className="composition-video-progress" data-testid="composition-video-progress"
          aria-label="가사 영상 만들기 진행률" max={100} value={media.progress} />
          : <div className="backing-export-progress-track"><i /></div>}
        <div className="backing-export-steps">{video ? <>
          <span>반주 만들기</span><span>가사 맞추기</span><span>영상으로 저장하기</span>
        </> : <><span>건반 연주하기</span><span>리듬 녹음하기</span><span>소리 섞어 저장하기</span></>}</div>
      </div>
      {video && working && <button type="button" className="action-button composition-video-cancel"
        data-testid="cancel-composition-video" onClick={media.cancel}>영상 만들기 취소</button>}
    </section>
  </div>;
}

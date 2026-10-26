import StudioArtwork from "./StudioArtwork";
import { useDialogFocus } from "../hooks/useDialogFocus";
import "./StudioResultPreview.css";

type Props = Readonly<{
  result: Readonly<{ url: string; name: string }>;
  onClose: () => void;
}>;

export default function StudioResultPreview({ result, onClose }: Props) {
  const ref = useDialogFocus<HTMLElement>();

  return <div className="mv-result-backdrop" onClick={(event) => {
    if (event.target === event.currentTarget) onClose();
  }}>
    <section ref={ref} className="mv-result-dialog" role="dialog" aria-modal="true"
      aria-labelledby="mv-result-title" data-testid="music-video-result-dialog" tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}>
      <header className="mv-result-header">
        <span className="mv-result-symbol" aria-hidden="true"><StudioArtwork name="video" size={32} /></span>
        <div><span>PREVIEW</span><h2 id="mv-result-title">완성된 뮤직비디오</h2></div>
        <button type="button" className="mv-icon-button" aria-label="완성 영상 닫기"
          data-testid="music-video-result-close" onClick={onClose}><StudioArtwork name="close" size={23} /></button>
      </header>
      <div className="mv-result-screen">
        <video controls playsInline src={result.url} aria-label="완성된 뮤직비디오"
          data-testid="music-video-result-video" />
      </div>
      <footer className="mv-result-footer">
        <p>그림을 수정했다면 영상을 다시 만들어 주세요.</p>
        <a href={result.url} download={result.name} className="mv-primary" data-testid="music-video-result-download">
          <StudioArtwork name="download" size={25} /> 뮤직비디오 MP4 다시 저장</a>
      </footer>
    </section>
  </div>;
}

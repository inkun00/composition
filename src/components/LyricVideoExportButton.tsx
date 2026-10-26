import { FileVideo } from "./AppArtworkIcons";
import "./LyricVideoExportButton.css";

type Props = Readonly<{
  hasLyrics: boolean;
  busy: boolean;
  exporting: boolean;
  progress: number;
  status: string;
  onSave: () => void;
}>;

export default function LyricVideoExportButton({ hasLyrics, busy, exporting, progress, status, onSave }: Props) {
  return <div className="lyric-video-export">
    <button type="button" className="karaoke-download lyric-video-button" data-testid="export-lyric-mp4"
      disabled={!hasLyrics || busy || exporting} onClick={onSave}>
      <FileVideo size={18} /> {exporting ? "가사 영상 만드는 중..." : "가사 영상 MP4 저장"}
    </button>
    {!hasLyrics && <small>가사를 적고 녹음하면 영상을 만들 수 있어요.</small>}
    {exporting && <progress max={100} value={progress} aria-label="가사 영상 만들기 진행률" />}
    {status && <p role="status">{status}</p>}
  </div>;
}

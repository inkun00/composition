import { ExternalLink, Mic2, Music2, QrCode } from "./AppArtworkIcons";
import ComposerChildArtwork from "./ComposerChildArtwork";

type Props = Readonly<{
  complete: boolean;
  playing: boolean;
  practicing: boolean;
  recording: boolean;
  onMobileLink: () => void;
  onPractice: () => void;
  onRecord: () => void;
}>;

export default function CompositionPerformActions({
  complete, playing, practicing, recording, onMobileLink, onPractice, onRecord,
}: Props) {
  return <div className="publish-action-group publish-action-group-perform">
    <h3>듣고 노래하기</h3>
    <div className="composition-perform-content">
      <div className="publish-action-group-buttons">
        <button type="button" className="mobile-record-link-button action-button" data-testid="create-mobile-recording-link"
          disabled={!complete} onClick={onMobileLink}>
          <QrCode size={18} /> 스마트폰 녹음 링크
        </button>
        <div className="publish-share-pair">
          <button type="button" className="practice-song-button action-button" data-testid="practice-song"
            disabled={playing || !complete} onClick={onPractice}>
            <Music2 size={18} /> {practicing ? "연습 중..." : "노래 연습하기"}
          </button>
          <button type="button" className="record-mp3-button action-button" data-testid="record-song-mp3"
            disabled={playing || !complete} onClick={onRecord}>
            <Mic2 size={18} /> {recording ? "녹음 중..." : "노래 녹음"}
          </button>
          <a className="samboard-share-button action-button" data-testid="open-samboard-share"
            href="https://samboard.vivasam.com/studentEntry/?brdId=brd-0QZ60VWZ56TNW"
            target="_blank" rel="noopener noreferrer">
            <ExternalLink size={18} /> 공유 게시판 열기
          </a>
        </div>
        <p className="publish-board-help">파일을 먼저 저장하고, 게시판에서 첨부해 주세요.</p>
      </div>
      <ComposerChildArtwork kind="listening" />
    </div>
  </div>;
}

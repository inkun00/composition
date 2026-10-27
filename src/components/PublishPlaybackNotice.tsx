import "./PublishPlaybackNotice.css";

type Props = Readonly<{
  isAnyPlaying: boolean;
  onStop: () => void;
}>;

export default function PublishPlaybackNotice({ isAnyPlaying, onStop }: Props) {
  if (!isAnyPlaying) return null;

  return (
    <div className="publish-playback-notice" role="status" aria-live="polite">
      <div className="publish-playback-notice-content">
        <span className="publish-playback-notice-icon" aria-hidden="true">💡</span>
        <div className="publish-playback-notice-text">
          <strong>음악이 재생 중이어서 저장 및 뮤직비디오 기능이 잠시 비활성화되어 있어요.</strong>
          <p>화면 상단의 <strong>■ 정지 버튼</strong>을 누르거나, 아래 버튼을 누르면 모든 기능이 즉시 활성화돼요.</p>
        </div>
      </div>
      <button type="button" className="publish-stop-shortcut-button" onClick={onStop}>
        <span className="stop-square-icon" aria-hidden="true">■</span>
        <span>음악 정지하고 활성화하기</span>
      </button>
    </div>
  );
}

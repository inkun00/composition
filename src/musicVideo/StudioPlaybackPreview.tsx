import { useEffect, useRef, type KeyboardEvent } from "react";
import StudioArtwork from "./StudioArtwork";
import { useDialogFocus } from "../hooks/useDialogFocus";
import type { MusicVideoExportOptions } from "../video/exportMusicVideoMp4";
import { drawMusicVideoFrame } from "../video/musicVideoRenderer";
import SceneArt from "./SceneArt";
import { useStudioPlayback } from "./useStudioPlayback";
import { isIntroScene } from "../video/musicVideoModel";
import StudioIntroTitleCard from "./StudioIntroTitleCard";
import "./StudioPlaybackPreview.css";

type Props = Readonly<{
  options: MusicVideoExportOptions;
  onBusyChange: (busy: boolean) => void;
  onClose: () => void;
}>;

function clockText(seconds: number) {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}

export default function StudioPlaybackPreview({ options, onBusyChange, onClose }: Props) {
  const ref = useDialogFocus<HTMLElement>();
  const canvas = useRef<HTMLCanvasElement>(null);
  const playback = useStudioPlayback(options, onBusyChange);
  const { plan, duration, time, playing, loading, error, play, pause, seek, restart, getCurrentTime } = playback;
  const length = Number.isFinite(duration) ? Math.max(0, duration) : 0;
  const position = Math.max(0, Math.min(length, Number.isFinite(time) ? time : 0));
  const activeScene = plan?.scenes.findIndex((entry) => position + 1e-7 >= entry.startSeconds &&
    position + 1e-7 < entry.endSeconds) ?? -1;
  const sceneIndex = activeScene >= 0 ? activeScene : (plan?.scenes.length ?? 0) - 1;
  const introScene = options.scenes.find(isIntroScene);
  const sceneLabel = plan && position < plan.introSeconds ? "전주"
    : plan ? `장면 ${sceneIndex + 1} / ${plan.scenes.length}` : `장면 1 / ${options.scenes.length}`;

  useEffect(() => {
    if (!plan || !playing || loading) return;
    const context = canvas.current?.getContext("2d");
    if (!context) return;
    let frame = 0;
    let disposed = false;
    function draw() {
      if (disposed) return;
      drawMusicVideoFrame(context!, plan!, getCurrentTime(), true);
      frame = requestAnimationFrame(draw);
    }
    draw();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
    };
  }, [plan, playing, loading, getCurrentTime]);

  useEffect(() => {
    if (!plan || playing || loading) return;
    const context = canvas.current?.getContext("2d");
    if (context) drawMusicVideoFrame(context, plan, getCurrentTime(), true);
  }, [plan, playing, loading, time, getCurrentTime]);

  function close() {
    pause();
    onClose();
  }

  function keyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Tab") return;
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  }

  return <div className="mv-playback-backdrop" onClick={(event) => {
    if (event.target === event.currentTarget) close();
  }}>
    <section ref={ref} className="mv-playback-dialog" role="dialog" aria-modal="true"
      aria-labelledby="mv-playback-title" data-testid="music-video-preview-dialog" tabIndex={-1} onKeyDown={keyDown}>
      <header className="mv-playback-header">
        <span className="mv-playback-symbol" aria-hidden="true"><StudioArtwork name="headphones" size={32} /></span>
        <div><span>LIVE PREVIEW</span><h2 id="mv-playback-title">뮤직비디오 미리보기</h2></div>
        <button type="button" className="mv-icon-button" aria-label="뮤직비디오 미리보기 닫기"
          data-testid="music-video-preview-close" onClick={close}><StudioArtwork name="close" size={23} /></button>
      </header>
      <div className="mv-playback-screen" aria-busy={loading}>
        <canvas ref={canvas} width={1280} height={720} data-testid="music-video-preview-canvas"
          aria-label="음악과 가사가 함께 재생되는 뮤직비디오 미리보기" />
        {!plan && <div className="mv-playback-placeholder" aria-hidden="true">
          {introScene?.elements.length ? <SceneArt scene={introScene} />
            : <StudioIntroTitleCard title={options.title} composer={options.composer} />}
          <span><StudioArtwork name="music" size={23} /> {loading ? "노래와 장면을 준비하고 있어요…" : "재생을 누르면 노래와 장면이 함께 시작돼요"}</span>
        </div>}
      </div>
      <footer className="mv-playback-footer">
        <div className="mv-playback-meta">
          <span className="mv-playback-scene" data-testid="music-video-preview-scene">{sceneLabel}</span>
          <output data-testid="music-video-preview-time" data-time={position} aria-label="미리보기 재생 시간">
            {clockText(position)} <span>/ {clockText(length)}</span>
          </output>
        </div>
        <input className="mv-playback-seek" type="range" data-testid="music-video-preview-seek"
          aria-label="뮤직비디오 미리보기 시간" min={0} max={length || 1} step={.01} value={position}
          aria-valuetext={`${clockText(position)} / ${clockText(length)}`} disabled={!plan || loading || length <= 0 || Boolean(error)}
          onChange={(event) => seek(Number(event.target.value))} />
        <div className="mv-playback-controls">
          <button type="button" className="mv-playback-restart" data-testid="music-video-preview-restart"
            aria-label="처음부터 다시 재생" disabled={loading || Boolean(error)} onClick={() => { void restart(); }}>
            <StudioArtwork name="rotate-back" size={24} /> 처음부터</button>
          <button type="button" className="mv-primary mv-playback-play" data-testid="music-video-preview-play"
            aria-label={playing ? "뮤직비디오 미리보기 일시정지" : "뮤직비디오 미리보기 재생"}
            aria-pressed={playing} disabled={loading || Boolean(error)}
            onClick={() => { if (playing) pause(); else void play(); }}>
            <StudioArtwork name={loading ? "loading" : playing ? "pause" : "play"} size={24}
              className={loading ? "mv-playback-spinner" : undefined} />
            {loading ? "음악 준비 중…" : playing ? "일시정지" : "함께 재생"}
          </button>
        </div>
        {error ? <div className="mv-playback-error">
          <p role="alert">{error}</p>
          <button type="button" data-testid="music-video-preview-retry" disabled={loading}
            onClick={() => { void play(); }}>다시 시도</button>
        </div> : <p className="mv-playback-help" data-testid={options.recording ? "music-video-preview-recording" : undefined}>
          <StudioArtwork name="music" size={18} />
          {options.recording ? "녹음한 목소리와 음악, 가사, 모든 장면의 움직임을 함께 확인해요."
            : "음악과 가사, 모든 장면의 움직임을 함께 확인해요."}
        </p>}
      </footer>
    </section>
  </div>;
}

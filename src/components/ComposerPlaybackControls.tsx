import { Square } from "./AppArtworkIcons";
import PlayIcon from "./PlayIcon";

type Props = Readonly<{
  bpm: number;
  onTempoChange: (bpm: number) => void;
  songLength: number;
  completedCount: number;
  tempoDisabled: boolean;
  canStart: boolean;
  canToggle: boolean;
  canStop: boolean;
  state: "idle" | "playing" | "paused";
  playingIndex: number | null;
  onStart: () => void;
  onToggle: () => void;
  onStop: () => void;
}>;

export default function ComposerPlaybackControls(props: Props) {
  return <div className="compact-heading timeline-heading composer-transport">
    <div><h2>내 노래 <small>{props.completedCount}/{props.songLength}마디</small></h2></div>
    <div className="timeline-actions">
      <label className="tempo-control">
        <span>빠르기</span>
        <input type="range" min="40" max="200" step="2" value={props.bpm}
          data-testid="tempo-slider" disabled={props.tempoDisabled}
          onChange={(event) => props.onTempoChange(Number(event.target.value))} />
        <span className="tempo-number-wrap">
          <input type="number" min="40" max="200" step="2" value={props.bpm} data-testid="tempo-number"
            aria-label="빠르기 BPM 숫자 입력" disabled={props.tempoDisabled}
            onChange={(event) => props.onTempoChange(Math.max(40, Math.min(200, Number(event.target.value) || 40)))} />
          <strong>BPM</strong>
        </span>
      </label>
      <button type="button" className="ghost-button action-button" data-testid="play-song-from-start"
        disabled={!props.canStart} onClick={props.onStart}><PlayIcon /> 처음부터 듣기</button>
      <button type="button" className="song-play action-button" data-testid="toggle-song-playback"
        disabled={!props.canToggle} onClick={props.onToggle}>
        <PlayIcon playing={props.state === "playing"} />
        {props.state === "paused" ? "다시 재생" : props.state === "playing"
          ? `일시정지${props.playingIndex !== null ? ` · ${props.playingIndex + 1}마디` : ""}` : "이어 듣기"}
      </button>
      {props.canStop && <button type="button" className="song-stop action-button" data-testid="stop-song-playback"
        onClick={props.onStop}><Square size={14} fill="currentColor" aria-hidden="true" /> 중지</button>}
    </div>
  </div>;
}

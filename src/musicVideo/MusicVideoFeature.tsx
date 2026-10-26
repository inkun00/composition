import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import StudioArtwork from "./StudioArtwork";
import type { AccompanimentOptions, PlaybackMeasure } from "../audio/accompanimentScore";
import type { InstrumentId } from "../music/instruments";
import type { LyricVideoPlan } from "../video/lyricVideoPlan";
import { createMusicVideoScene, getMusicVideoMeasures, type MusicVideoScene } from "../video/musicVideoModel";
import MusicVideoStudio from "./MusicVideoStudio";
import { useMusicVideoExport } from "./useMusicVideoExport";
import "./MusicVideoStudio.css";
import "./MusicVideoStudio.responsive.css";
import "./StudioArtDirection.css";

export type MusicVideoFeatureProps = Readonly<{
  scenes: readonly MusicVideoScene[];
  onScenesChange: (scenes: readonly MusicVideoScene[]) => void;
  measures: readonly PlaybackMeasure[];
  title: string;
  composer?: string;
  instrumentId: InstrumentId;
  bpm: number;
  accompaniment: AccompanimentOptions;
  complete: boolean;
  busy: boolean;
  recording?: Readonly<{ audioUrl: string; plan: LyricVideoPlan }>;
  onBusyChange: (busy: boolean) => void;
  saveStatus?: string;
  projectSaveStatus?: string;
  saveError?: string;
  openRequest?: number;
  onFindLostDrawings?: () => void;
}>;

export default function MusicVideoFeature(props: MusicVideoFeatureProps) {
  const [open, setOpen] = useState(false);
  const video = useMusicVideoExport(props.onBusyChange);
  useEffect(() => { if (props.openRequest) setOpen(true); }, [props.openRequest]);
  function enter() {
    if (props.scenes.length === 0) {
      const scene = createMusicVideoScene(null, getMusicVideoMeasures(props.measures, props.bpm).at(-1)?.measureIndex);
      props.onScenesChange([{ ...scene, motion: "still" }]);
    }
    setOpen(true);
  }
  return <div className="mv-feature">
    <div className="mv-entry">
      <span className="mv-entry-icon" aria-hidden="true"><StudioArtwork name="video" size={44} /></span>
      <div><strong>내 그림으로 뮤직비디오</strong><small>장면을 그리고, 가사와 음악을 이어 붙여요.</small></div>
      <button type="button" className="action-button mv-open-button" data-testid="draw-music-video-scene"
        disabled={props.busy || video.working} onClick={enter}><StudioArtwork name="brush" size={25} /> 장면 그리기</button>
    </div>
    {open && createPortal(<MusicVideoStudio {...props} video={video} onClose={() => setOpen(false)} />, document.body)}
  </div>;
}

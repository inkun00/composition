import { useMemo } from "react";
import StudioArtwork from "./StudioArtwork";
import { buildMusicVideoLyricPlan, isIntroScene, resolveSceneEndMeasure,
  type MusicVideoMeasureCue, type MusicVideoScene } from "../video/musicVideoModel";
import type { MusicVideoMeasure } from "../video/musicVideoMeasures";
import { getSceneBeatSeconds, normalizeSceneBpm } from "../video/sceneMotionClock";
import SceneMotionSelector from "./SceneMotionSelector";
import type { SceneSelectionControls } from "./sceneSelection";
import SceneAutoMotionSummary from "./SceneAutoMotionSummary";
import type { AutoSceneMotionPlan } from "./autoSceneMotions";
import { getSceneMeasureRanges } from "../video/musicVideoSceneRanges";
import "./SceneRangeWarnings.css";

type Props = Readonly<{
  scene: MusicVideoScene;
  scenes: readonly MusicVideoScene[];
  measures: readonly MusicVideoMeasureCue[];
  selected: number;
  bpm: number;
  title: string;
  composer?: string;
  introSeconds?: number;
  disabled: boolean;
  drawing?: boolean;
  onChange: (scene: MusicVideoScene) => void;
  onRangeChange?: (side: "start" | "end", measureIndex: number) => void;
  onDelete: () => void;
  deleteReason?: string;
  sourceMeasures: readonly MusicVideoMeasure[];
  onStatus: (message: string) => void;
  selection?: SceneSelectionControls;
  autoMotions?: Pick<AutoSceneMotionPlan, "assignments" | "issue">;
}>;
const PAPERS = [
  { color: "#ffffff", label: "흰 도화지" }, { color: "#fff8ed", label: "크림 도화지" },
  { color: "#fce8e6", label: "분홍 도화지" }, { color: "#eaf2ff", label: "하늘 도화지" },
  { color: "#e7f3ec", label: "초록 도화지" }
];

export default function SceneSettings({ scene, scenes, measures, selected, bpm, title, disabled, onChange, onDelete,
  sourceMeasures, onStatus, selection, autoMotions, composer, introSeconds = 0, deleteReason, onRangeChange, drawing = false }: Props) {
  const intro = isIntroScene(scene);
  const canChooseIntro = selected === 0 && !scenes.some((item) => item.id !== scene.id && isIntroScene(item));
  const end = resolveSceneEndMeasure(scene, measures);
  const range = getSceneMeasureRanges(scenes, measures).find((item) => item.sceneIndex === selected);
  const startIndex = range?.startIndex ?? 0;
  const startMeasure = measures[startIndex]?.measureIndex;
  const endIndex = end ? measures.indexOf(end) : -1;
  const validRange = intro || Boolean(end && startIndex >= 0 && endIndex >= startIndex);
  const lyricText = intro ? "" : measures.slice(startIndex, endIndex + 1).map((measure) => measure.lyricText).join("");
  const beatSeconds = getSceneBeatSeconds(bpm);
  const previewBpm = normalizeSceneBpm(bpm);
  const introDuration = Number.isFinite(introSeconds) && introSeconds > 0 ? introSeconds : 8 * beatSeconds;
  const previewStart = intro ? 0 : measures[startIndex]?.startSeconds ?? 0;
  const previewEnd = intro ? introDuration : validRange ? end!.endSeconds : previewStart + 8 * beatSeconds;
  const previewPlan = useMemo(() => ({ title, composer, bpm: previewBpm, introSeconds: intro ? introDuration : 0,
    lyrics: intro ? { title, hasLyrics: false, frames: [] }
      : buildMusicVideoLyricPlan(title, sourceMeasures, previewBpm, 0, Math.max(previewEnd, measures.at(-1)?.endSeconds ?? previewEnd)),
    scenes: [{ scene, startSeconds: previewStart, endSeconds: previewEnd, lyricText }] }),
    [title, composer, intro, introDuration, previewBpm, sourceMeasures, measures, previewStart, previewEnd, scene, lyricText]);

  return <aside className="mv-scene-settings" aria-label="장면 설정">
    <div className="mv-inspector-heading">
      <div><span>SCENE SETTINGS</span><h3>{intro ? "전주" : `장면 ${String(selected + 1).padStart(2, "0")}`}</h3></div>
      <StudioArtwork name="settings" size={25} />
    </div>
    {autoMotions && <SceneAutoMotionSummary assignments={autoMotions.assignments} scenes={scenes} issue={autoMotions.issue} />}
    <section className="mv-settings-section mv-timing-section">
      <div className="mv-section-heading"><h4><StudioArtwork name="video" size={20} /> 장면 구간</h4>
        <span className="mv-inspector-badge">{intro ? `전주 · ${introSeconds.toFixed(1)}초`
          : validRange ? `${endIndex - startIndex + 1}마디` : "구간 미지정"}</span></div>
      <div className="mv-range-summary">
        <div><span>시작</span><strong>{intro ? "0.0" : startMeasure === undefined ? "—" : String(startMeasure + 1).padStart(2, "0")}<small>{intro ? "초" : "마디"}</small></strong></div>
        <StudioArtwork name="arrow-right" size={21} />
        <div><span>끝</span><strong>{intro ? introSeconds.toFixed(1) : end ? String(end.measureIndex + 1).padStart(2, "0") : "—"}
          <small>{intro ? "초" : "마디"}</small></strong></div>
      </div>
      <div className="mv-range-fields">
      {!intro && <label className="mv-field"><span>시작 마디</span>
        <div className="mv-select-wrap"><select aria-label="장면 시작 마디" data-testid="scene-start-measure"
          value={measures[startIndex]?.key ?? ""} disabled={disabled || !measures.length} onChange={(event) => {
            const measure = measures.find((item) => item.key === event.target.value);
            if (!measure) return;
            if (onRangeChange) onRangeChange("start", measure.measureIndex);
            else onChange({ ...scene, startMeasureIndex: measure.measureIndex });
          }}>
          {!measures[startIndex] && <option value="" disabled>시작 마디를 골라 주세요</option>}
          {measures.map((measure) => <option key={measure.key} value={measure.key}>{measure.label}</option>)}
        </select><StudioArtwork name="chevron-down" size={17} /></div>
      </label>}
      <label className="mv-field"><span>마지막 마디</span>
        <div className="mv-select-wrap"><select aria-label="장면 마지막 마디" data-testid="scene-end-measure"
          value={intro ? "intro" : end?.key ?? ""} disabled={disabled || !measures.length} onChange={(event) => {
            if (event.target.value === "intro") {
              if (!canChooseIntro) return;
              const { endMeasureIndex: _end, startMeasureIndex: _start, ...rest } = scene;
              onChange({ ...rest, section: "intro", endLyric: null });
              return;
            }
            const measure = measures.find((item) => item.key === event.target.value);
            if (measure) {
              if (onRangeChange) {
                onRangeChange("end", measure.measureIndex);
                return;
              }
              const { section: _section, ...rest } = scene;
              onChange({ ...rest, endLyric: null, endMeasureIndex: measure.measureIndex });
            }
          }}>{canChooseIntro && <option value="intro">전주</option>}
          {!end && !intro && <option value="" disabled>마지막 마디를 골라 주세요</option>}
          {measures.map((measure) => <option key={measure.key} value={measure.key}>
            {measure.label}</option>)}
        </select><StudioArtwork name="chevron-down" size={17} /></div>
      </label>
      </div>
      <p className="mv-help">{intro ? "전주가 끝나면 본곡 1마디부터 이어져요. 비워 두면 제목과 작곡가가 나와요."
        : "시작과 끝을 자유롭게 고르세요. 다른 장면과 겹치면 안내에 따라 구간을 조정할 수 있어요."}</p>
      {end?.lyricText && <blockquote className="mv-scene-lyric"><span>마지막 가사</span>{end.lyricText}</blockquote>}
    </section>
    <section className="mv-settings-section mv-paper-section">
      <div className="mv-section-heading"><h4><StudioArtwork name="palette" size={21} /> 도화지 색</h4>
        <output className="mv-paper-value" aria-label="도화지 색상 값">{scene.background.toUpperCase()}</output></div>
      <div className="mv-paper-colors">{PAPERS.map(({ color, label }) => <button type="button" key={color} title={label}
        aria-label={label} aria-pressed={scene.background === color} style={{ background: color }} disabled={disabled}
        onClick={() => onChange({ ...scene, background: color })} />)}
        <label className="mv-paper-custom" title="직접 색 고르기"><input type="color" aria-label="도화지 색"
          value={scene.background} disabled={disabled} onChange={(event) => onChange({ ...scene, background: event.target.value })} /></label>
      </div>
    </section>
    <section className="mv-settings-section mv-motion-section">
      {!validRange && <p className="mv-help">움직임을 고르고, 영상에 사용할 마지막 마디도 정해 주세요.</p>}
      <SceneMotionSelector scene={scene} disabled={disabled} plan={previewPlan}
        onApply={onChange} onStatus={onStatus} selection={selection} previewSuspended={drawing} />
    </section>
    <button type="button" className="mv-delete-scene" data-testid={intro ? "delete-music-video-intro" : undefined}
      disabled={scenes.length < 2 && !intro || disabled || Boolean(deleteReason)} title={deleteReason} onClick={onDelete}>
      <StudioArtwork name="delete" size={19} /> 이 장면 삭제</button>
  </aside>;
}

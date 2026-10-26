import { useEffect, useRef } from "react";
import StudioArtwork from "./StudioArtwork";
import { isIntroScene, MAX_SCENES, type MusicVideoMeasureCue, type MusicVideoScene } from "../video/musicVideoModel";
import { findSceneRangeConflicts, getSceneMeasureRanges } from "../video/musicVideoSceneRanges";
import SceneArt from "./SceneArt";
import { getSceneMotionLabel } from "./sceneMotionPresets";
import StudioIntroTitleCard from "./StudioIntroTitleCard";
import "./SceneRangeWarnings.css";

type Props = Readonly<{
  scenes: readonly MusicVideoScene[];
  measures: readonly MusicVideoMeasureCue[];
  selected: number;
  disabled: boolean;
  onSelect: (index: number) => void;
  onAdd: () => void;
  onAddIntro?: () => void;
  onInsertBefore?: () => void;
  onInsertAfter?: () => void;
  onDelete?: () => void;
  insertBeforeReason?: string;
  insertAfterReason?: string;
  deleteReason?: string;
  introSeconds?: number;
  title?: string;
  composer?: string;
}>;

export default function SceneStoryboard({ scenes, measures, selected, disabled, onSelect, onAdd,
  onAddIntro, onInsertBefore, onInsertAfter, onDelete, insertBeforeReason, insertAfterReason,
  deleteReason, introSeconds = 0, title = "", composer }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const hasIntro = scenes.some(isIntroScene);
  const normalCount = scenes.filter((scene) => !isIntroScene(scene)).length;
  const ranges = getSceneMeasureRanges(scenes, measures);
  const conflictIndices = new Set(findSceneRangeConflicts(scenes, measures).flatMap((conflict) => conflict.sceneIndices));
  const selectedScene = scenes[selected];
  const selectedLabel = selectedScene && isIntroScene(selectedScene) ? "전주" : `장면 ${selected + 1}`;
  const unavailable = !selectedScene ? "장면을 먼저 선택해 주세요."
    : disabled ? "현재 작업을 마친 후 사용할 수 있어요." : undefined;
  useEffect(() => {
    const list = listRef.current;
    const active = list?.querySelector<HTMLElement>(".mv-scene-card.selected");
    if (!list || !active) return;
    const viewport = list.getBoundingClientRect();
    const clip = active.getBoundingClientRect();
    if (clip.left < viewport.left) list.scrollLeft -= viewport.left - clip.left + 4;
    if (clip.right > viewport.right) list.scrollLeft += clip.right - viewport.right + 4;
  }, [selected, scenes.length]);

  return <section className="mv-storyboard mv-timeline" aria-label="뮤직비디오 장면 목록">
    <div className="mv-storyboard-heading">
      <span className="mv-timeline-title"><StudioArtwork name="video" size={18} /> 장면 타임라인
        <b>{scenes.length}</b></span>
      {(onInsertBefore || onInsertAfter || onDelete) && <div className="mv-storyboard-actions"
        role="group" aria-label={`선택한 ${selectedLabel} 편집`}>
        <span className="mv-storyboard-selection">{selectedScene ? `${selectedLabel} 선택` : "선택한 장면 없음"}</span>
        {onInsertBefore && <button type="button" data-testid="insert-music-video-scene-before"
          disabled={Boolean(unavailable || insertBeforeReason)} onClick={onInsertBefore}
          title={unavailable || insertBeforeReason || "선택한 장면 앞에 새 장면을 삽입합니다."}>
          <StudioArtwork name="plus" size={16} />앞에 삽입</button>}
        {onInsertAfter && <button type="button" data-testid="insert-music-video-scene-after"
          disabled={Boolean(unavailable || insertAfterReason)} onClick={onInsertAfter}
          title={unavailable || insertAfterReason || "선택한 장면 뒤에 새 장면을 삽입합니다."}>
          <StudioArtwork name="plus" size={16} />뒤에 삽입</button>}
        {onDelete && <button type="button" className="mv-storyboard-delete" data-testid="delete-storyboard-scene"
          disabled={Boolean(unavailable || deleteReason)} onClick={onDelete}
          title={unavailable || deleteReason || "선택한 장면을 삭제합니다. 되돌리기로 복원할 수 있어요."}>
          <StudioArtwork name="delete" size={16} />장면 삭제</button>}
      </div>}
      <small className="mv-timeline-meta"><strong>{measures.length}마디</strong><span>순서대로 재생</span><StudioArtwork name="arrow-right" size={18} /></small>
    </div>
    <div className="mv-scene-list" ref={listRef}>
      {onAddIntro && !hasIntro && <button type="button" className="mv-add-scene" data-testid="add-music-video-intro"
        aria-label="전주 장면 추가" disabled={disabled || scenes.length >= MAX_SCENES} onClick={onAddIntro}>
        <span><StudioArtwork name="plus" size={28} /></span><strong>전주 장면 추가</strong>
      </button>}
      {scenes.map((scene, index) => {
        const intro = isIntroScene(scene);
        const timing = ranges.find((item) => item.sceneIndex === index);
        const end = timing ? measures[timing.endIndex] : undefined;
        const start = timing ? measures[timing.startIndex]?.measureIndex : undefined;
        const hasConflict = conflictIndices.has(index);
        const validRange = start !== undefined && end && timing!.startIndex <= timing!.endIndex;
        const range = intro ? `전주 · ${introSeconds.toFixed(1)}초`
          : validRange ? `${start + 1}–${end.measureIndex + 1}마디` : "구간을 골라 주세요";
        const motionLabel = getSceneMotionLabel(scene);
        const description = `${range} · ${motionLabel}${hasConflict ? " · 마디 겹침" : ""}`;
        return <button type="button" key={scene.id} className={`mv-scene-card${index === selected ? " selected" : ""}${hasConflict ? " has-range-conflict" : ""}`}
          data-testid={intro ? "music-video-intro-scene" : undefined} data-section={intro ? "intro" : "score"}
          data-range-conflict={hasConflict || undefined}
          aria-label={`${index + 1}번 장면 선택`} aria-description={description}
          aria-pressed={index === selected} title={description} disabled={disabled} onClick={() => onSelect(index)}>
          <div className="mv-clip-ruler" aria-hidden="true"><span>{intro ? "전주" : start === undefined ? "—" : `${start + 1}마디`}</span><i />
            <span>{intro ? `${introSeconds.toFixed(1)}초` : end ? end.measureIndex + 1 : "—"}</span></div>
          <div className="mv-scene-thumbnail"><SceneArt scene={scene} /><span>{intro ? "전주" : String(index + 1).padStart(2, "0")}</span>
            {!scene.elements.length && (intro ? <StudioIntroTitleCard title={title} composer={composer} />
              : <span className="mv-empty-thumbnail">그림 그리기</span>)}</div>
          <div className="mv-scene-card-caption"><strong>{intro ? "전주" : `장면 ${index + 1}`}</strong><small>{range}</small></div>
          {hasConflict && <span className="mv-scene-conflict-badge">마디 겹침</span>}
          <span className="mv-scene-motion-label">{motionLabel}</span>
        </button>;
      })}
      <button type="button" className="mv-add-scene" data-testid="add-music-video-scene"
        disabled={disabled || scenes.length >= MAX_SCENES || normalCount >= (measures.length || 1)} onClick={onAdd}>
        <span><StudioArtwork name="plus" size={28} /></span><strong>장면 추가</strong>
      </button>
    </div>
  </section>;
}

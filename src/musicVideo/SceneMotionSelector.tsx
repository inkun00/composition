import { useId, useState, type KeyboardEvent } from "react";
import StudioArtwork from "./StudioArtwork";
import type { MusicVideoPlan, MusicVideoScene } from "../video/musicVideoModel";
import SceneMotionPreview from "./SceneMotionPreview";
import { normalizeSceneBpm } from "../video/sceneMotionClock";
import { SCENE_MOTION_CATEGORIES, SCENE_MOTION_PRESETS,
  type SceneMotionCategory, type SceneMotionPreset } from "./sceneMotionPresets";
import { applyScopedSceneMotion, getScopedSceneMotion } from "./sceneMotionScope";
import type { SceneSelectionControls } from "./sceneSelection";
import SceneMotionScopeControl from "./SceneMotionScopeControl";
import SceneAssignedMotions from "./SceneAssignedMotions";
import { removeAssignedElementMotions } from "./sceneMotionAssignments";
import "./SceneMotionSelector.css";

type Props = Readonly<{
  scene: MusicVideoScene;
  plan: MusicVideoPlan;
  disabled: boolean;
  onApply: (scene: MusicVideoScene) => void;
  onStatus: (message: string) => void;
  selection?: SceneSelectionControls;
  previewSuspended?: boolean;
}>;

export default function SceneMotionSelector({ scene, plan, disabled, onApply, onStatus, selection, previewSuspended = false }: Props) {
  const [preview, setPreview] = useState({ sceneId: scene.id, revision: 0 });
  const revision = preview.sceneId === scene.id ? preview.revision : 0;
  const scope = selection?.scope ?? "whole";
  const selectedIds = selection?.selectedIds ?? [];
  const scoped = getScopedSceneMotion(scene, scope, selectedIds);
  const legacy = scoped.legacy;
  const selected = scoped.motion;
  const selectedPreset = SCENE_MOTION_PRESETS.find((preset) => preset.id === selected);
  const sourceKey = JSON.stringify([scene.id, scope, selectedIds, selected, scoped.label, legacy]);
  const [categoryState, setCategoryState] = useState({ sourceKey, category: selectedPreset?.category ?? "entrance" });
  const sameCategorySource = categoryState.sourceKey === sourceKey;
  const category = sameCategorySource ? categoryState.category : selectedPreset?.category ?? "entrance";
  if (!sameCategorySource) {
    setCategoryState({ sourceKey, category });
  }
  const categoryId = useId();
  const lyricText = plan.scenes.find((entry) => entry.scene.id === scene.id)?.lyricText ?? "";
  const categoryLabel = SCENE_MOTION_CATEGORIES.find((item) => item.id === category)!.label;
  const visiblePresets = SCENE_MOTION_PRESETS.filter((preset) => preset.category === category);

  function setCategory(next: SceneMotionCategory) {
    setCategoryState({ sourceKey, category: next });
  }

  function choose(preset: SceneMotionPreset) {
    if (disabled || scoped.empty) return;
    const next = applyScopedSceneMotion(scene, preset.id, scope, selectedIds);
    if (!next) return;
    if (next !== scene) onApply(next);
    setPreview({ sceneId: scene.id, revision: revision + 1 });
    onStatus(`${preset.label} 효과를 ${scope === "selection" ? "선택한 개체에" : "전체 그림에"} 적용했어요.`);
  }

  function removeAssignedMotions(ids: readonly string[]) {
    if (disabled) return;
    const next = removeAssignedElementMotions(scene, ids);
    if (next === scene) return;
    onApply(next);
    setPreview({ sceneId: scene.id, revision: revision + 1 });
    onStatus(ids.length > 1 ? `선택한 개체 ${ids.length}개의 동작을 삭제했어요. 그림은 그대로 유지돼요.`
      : "개체의 동작을 삭제했어요. 그림은 그대로 유지돼요.");
  }

  function changeCategoryWithKeyboard(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const count = SCENE_MOTION_CATEGORIES.length;
    const next = event.key === "ArrowRight" ? (index + 1) % count
      : event.key === "ArrowLeft" ? (index + count - 1) % count
        : event.key === "Home" ? 0 : event.key === "End" ? count - 1 : null;
    if (next === null) return;
    event.preventDefault();
    setCategory(SCENE_MOTION_CATEGORIES[next].id);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role='tab']")[next]?.focus();
  }

  return <section className="mv-motion-selector" aria-label="장면 모션그래픽">
    <div className="mv-motion-heading"><span><StudioArtwork name="play" size={24} /></span>
      <div><h4>모션그래픽</h4><p>효과를 선택하면 바로 미리 볼 수 있어요.</p></div></div>
    {selection && <SceneMotionScopeControl selection={selection} disabled={disabled} />}
    <SceneAssignedMotions scene={scene} selectedIds={selectedIds} disabled={disabled}
      onSelectElement={selection?.onSelectElement} onSelectElements={selection?.onSelectElements} onRemove={removeAssignedMotions} />
    {legacy && <p className="mv-motion-legacy" role="status">이전에 저장한 움직임이 있어요. 아래에서 새로 골라 주세요.</p>}
    <div className="mv-selected-preview">
      <span className="mv-preview-heading">미리보기
        <strong data-testid="scene-motion-selected-label">{scoped.label}</strong></span>
      <p className="mv-motion-tempo" data-testid="scene-motion-tempo">BPM {normalizeSceneBpm(plan.bpm)} · 박자에 맞춰 자동 조절</p>
      <SceneMotionPreview scene={scene} bpm={plan.bpm} title={plan.title} lyricText={lyricText} plan={plan}
        suspended={previewSuspended}
        playRequest={revision ? `${scene.id}:${revision}` : undefined} />
    </div>
    <div className="mv-motion-library-heading"><span>모션 라이브러리</span><small>{SCENE_MOTION_PRESETS.length}가지 효과</small></div>
    <div className="mv-motion-categories" role="tablist" aria-label="움직임 종류">
      {SCENE_MOTION_CATEGORIES.map((item, index) => <button key={item.id} type="button" role="tab"
        id={`${categoryId}-${item.id}`} aria-selected={category === item.id} aria-controls={`${categoryId}-panel`}
        tabIndex={category === item.id ? 0 : -1} data-testid={`scene-motion-category-${item.id}`}
        onClick={() => setCategory(item.id)} onKeyDown={(event) => changeCategoryWithKeyboard(event, index)}>
        {item.label}</button>)}
    </div>
    <div role="tabpanel" id={`${categoryId}-panel`} aria-label={`${categoryLabel} 움직임`}>
      <div className="mv-preset-grid" role="group" aria-label="장면 움직임 선택">
        {visiblePresets.map((preset) => <button type="button" key={preset.id}
          className={`mv-preset-card mv-preset-${preset.id}`} data-testid={`scene-motion-preset-${preset.id}`}
          data-motion-category={preset.category}
          aria-label={preset.label} aria-pressed={selected === preset.id} disabled={disabled || scoped.empty}
          onClick={() => choose(preset)}>
          <span className="mv-preset-artwork-stage" aria-hidden="true">
            <StudioArtwork name={`motion-${preset.id}`} size={116} className="mv-preset-artwork" lazy />
          </span>
          <span className="mv-preset-copy"><strong>{preset.label}</strong><small>{preset.description}</small></span>
          {selected === preset.id && <StudioArtwork name="check" size={18} className="mv-preset-check" />}
        </button>)}
      </div>
    </div>
    <p className="mv-motion-help">{scope === "selection" ? "선택한 개체에만 적용돼요." : "그림 전체에 적용돼요."}
      {" "}하단 미리보기에서 음악과 함께 확인해요.</p>
  </section>;
}

import { memo, useId, useLayoutEffect, useMemo, useRef } from "react";
import StudioArtwork from "./StudioArtwork";
import type { MusicVideoScene, SceneElement } from "../video/musicVideoModel";
import { elementBounds } from "../video/sceneDrawing";
import { ScenePath } from "./SceneArt";
import { SCENE_MOTION_PRESETS } from "./sceneMotionPresets";
import { isAssignedElementMotion } from "./sceneMotionAssignments";
import { getAssignedMotionGroups } from "./sceneMotionGroups";
import "./SceneAssignedMotions.css";

type Props = Readonly<{
  scene: MusicVideoScene;
  selectedIds: readonly string[];
  disabled: boolean;
  onSelectElement?: (id: string, additive?: boolean) => void;
  onSelectElements?: (ids: readonly string[], additive?: boolean) => void;
  onRemove: (ids: readonly string[]) => void;
}>;

type PendingFocus = Readonly<{
  sceneId: string;
  removedIds: readonly string[];
  nextElementId: string | undefined;
}>;

const ElementPreview = memo(function ElementPreview({ elements, background }: Readonly<{
  elements: readonly SceneElement[];
  background: string;
}>) {
  const boxes = elements.map(elementBounds);
  const bounds = { left: Math.min(...boxes.map((box) => box.left)), top: Math.min(...boxes.map((box) => box.top)),
    right: Math.max(...boxes.map((box) => box.right)), bottom: Math.max(...boxes.map((box) => box.bottom)) };
  const size = Math.max(1, bounds.right - bounds.left, bounds.bottom - bounds.top);
  const padding = size * .14 + 1;
  const centerX = (bounds.left + bounds.right) / 2;
  const centerY = (bounds.top + bounds.bottom) / 2;
  const frame = size + padding * 2;

  return <span className="mv-assigned-preview" style={{ backgroundColor: background }} aria-hidden="true">
    <svg viewBox={`${centerX - frame / 2} ${centerY - frame / 2} ${frame} ${frame}`}>
      {elements.map((element) => <ScenePath key={element.id} element={element} />)}
    </svg>
  </span>;
});

export default function SceneAssignedMotions({ scene, selectedIds, disabled, onSelectElement, onSelectElements, onRemove }: Props) {
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const removeButtons = useRef(new Map<string, HTMLButtonElement>());
  const pendingFocus = useRef<PendingFocus | null>(null);
  const assigned = useMemo(() => getAssignedMotionGroups(scene), [scene]);
  const selected = assigned.flatMap((group) => group.elements.filter((element) => selectedIds.includes(element.id)))
    .map((element) => element.id);

  useLayoutEffect(() => {
    const pending = pendingFocus.current;
    if (!pending) return;
    if (pending.sceneId !== scene.id) {
      pendingFocus.current = null;
      return;
    }
    if (scene.elements.some((element) => pending.removedIds.includes(element.id) && isAssignedElementMotion(element.motion))) return;
    pendingFocus.current = null;
    const nextGroup = assigned.find((group) => group.elements.some((element) => element.id === pending.nextElementId));
    const next = nextGroup ? removeButtons.current.get(nextGroup.id) : undefined;
    (next ?? heading.current)?.focus({ preventScroll: true });
  }, [scene, assigned]);

  function remove(ids: readonly string[]) {
    if (disabled || !ids.length) return;
    const removed = new Set(ids);
    const start = assigned.findIndex((group) => group.elements.some((element) => removed.has(element.id)));
    const candidates = [...assigned.slice(start, start + 1), ...assigned.slice(start + 1), ...assigned.slice(0, start).reverse()];
    const next = candidates.find((group) => group.elements.some((element) => !removed.has(element.id)));
    const nextElementId = next?.elements.find((element) => !removed.has(element.id))?.id;
    pendingFocus.current = { sceneId: scene.id, removedIds: ids, nextElementId };
    onRemove(ids);
  }

  return <section className="mv-assigned-motions" data-testid="scene-assigned-motions" aria-labelledby={headingId}>
    <div className="mv-assigned-heading">
      <h5 ref={heading} id={headingId} tabIndex={-1}>적용한 개체 동작 <span>{assigned.length}</span></h5>
      {selected.length > 1 && <button type="button" className="mv-assigned-remove-selected"
        data-testid="scene-remove-selected-motions" disabled={disabled} onClick={() => remove(selected)}>
        <StudioArtwork name="delete" size={18} /> 선택한 동작 삭제</button>}
    </div>
    {assigned.length ? <div className="mv-assigned-scroll" data-testid="scene-assigned-motion-list"
      role="region" aria-label="적용한 개체 동작 목록" tabIndex={0}>
      <ul>
        {assigned.map(({ id, elements, motion, name }) => {
          const label = SCENE_MOTION_PRESETS.find((preset) => preset.id === motion)?.label ?? "살랑살랑";
          const elementIds = elements.map((element) => element.id);
          const selectedCount = elements.filter((element) => selectedIds.includes(element.id)).length;
          const active = selectedCount === elements.length;
          const partial = selectedCount > 0 && !active;
          const canSelect = Boolean(onSelectElements || elements.length === 1 && onSelectElement);
          return <li key={id} className={active ? "is-selected" : partial ? "is-partially-selected" : ""}
            data-testid="scene-assigned-motion-row" data-motion-group-id={id} data-element-ids={JSON.stringify(elementIds)}>
            <button type="button" className="mv-assigned-select" data-testid={`scene-assigned-motion-select-${id}`}
              aria-label={`${name} 선택, ${label}${partial ? `, ${selectedCount}개 선택됨` : ""}`} aria-pressed={active}
              data-partially-selected={partial} disabled={disabled || !canSelect}
              onClick={(event) => {
                const additive = event.shiftKey || event.ctrlKey || event.metaKey;
                if (onSelectElements) onSelectElements(elementIds, additive);
                else if (elements.length === 1) onSelectElement?.(elements[0].id, additive);
              }}>
              <ElementPreview elements={elements} background={scene.background} />
              <span className="mv-assigned-copy"><strong>{name}</strong><small>{label}</small></span>
              {partial && <span className="mv-assigned-partial" aria-hidden="true">일부 선택</span>}
            </button>
            <button type="button" className="mv-assigned-remove" data-testid={`scene-remove-element-motion-${id}`}
              aria-label={`${name} 동작 삭제`} title={`${name}의 ${label} 동작 삭제`} disabled={disabled}
              ref={(button) => {
                if (button) removeButtons.current.set(id, button);
                else removeButtons.current.delete(id);
              }} onClick={() => remove(elementIds)}><StudioArtwork name="delete" size={21} /></button>
          </li>;
        })}
      </ul>
    </div> : <p className="mv-assigned-empty" data-testid="scene-assigned-motions-empty">
      개체에 동작을 적용하면 여기에 표시돼요.</p>}
  </section>;
}

import { useEffect, useId, useImperativeHandle, useRef, useState, type PointerEvent, type Ref } from "react";
import { flushSync } from "react-dom";
import { MAX_ELEMENTS, MAX_POINTS, MAX_TOTAL_POINTS, SCENE_HEIGHT, SCENE_WIDTH,
  type MusicVideoScene, type SceneElement, type ScenePoint } from "../video/musicVideoModel";
import { elementHit } from "../video/sceneDrawing";
import { ScenePath } from "./SceneArt";
import { hitSceneElement, type SceneEditorTool } from "./sceneSelection";
import SceneSelectionOverlay from "./SceneSelectionOverlay";
import "./SceneSelection.css";

type Props = Readonly<{
  ref?: Ref<SceneCanvasHandle>;
  scene: MusicVideoScene;
  tool: SceneEditorTool;
  color: string;
  width: number;
  disabled: boolean;
  onChange: (scene: MusicVideoScene) => void;
  onGestureChange?: (scene: MusicVideoScene, gestureId: string) => void;
  onDrawingChange?: (drawing: boolean) => void;
  remainingPoints?: number;
  onStatus: (message: string) => void;
  selectedIds?: readonly string[];
  onSelectElement?: (id: string | null, additive?: boolean) => void;
}>;
export type SceneCanvasHandle = Readonly<{ flush: () => void }>;
type Gesture = {
  pointerId: number;
  element: SceneElement;
  erasing: boolean;
  elements: readonly SceneElement[];
  scene: MusicVideoScene;
  sourceElements: readonly SceneElement[];
  publishedElements?: readonly SceneElement[];
  pointLimit: number;
  limited: boolean;
  limitReported: boolean;
  tool: SceneEditorTool;
  points: ScenePoint[];
  dirty: boolean;
};
type Preview = Pick<Gesture, "element" | "elements" | "erasing">;
const CHECKPOINT_INTERVAL_MS = 120;

export default function SceneCanvas({ ref, scene, tool, color, width, disabled, onChange, onStatus,
  selectedIds = [], onSelectElement, onGestureChange, onDrawingChange, remainingPoints }: Props) {
  const [draft, setDraft] = useState<Preview | null>(null);
  const gridId = useId().replace(/:/g, "");
  const gesture = useRef<Gesture | null>(null);
  const previewFrame = useRef<number | null>(null);
  const checkpointTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ scene, onChange, onGestureChange, onDrawingChange, onStatus });
  latest.current = { scene, onChange, onGestureChange, onDrawingChange, onStatus };

  function snapshotElement(current: Gesture): SceneElement {
    if (current.dirty) {
      // The mutable input buffer never escapes the gesture. Rendered/saved points stay immutable.
      current.element = { ...current.element, points: current.points.slice() };
      current.dirty = false;
    }
    return current.element;
  }

  function preview(current: Gesture): Preview {
    return { element: snapshotElement(current), elements: current.elements, erasing: current.erasing };
  }

  function cancelScheduled() {
    if (previewFrame.current !== null) cancelAnimationFrame(previewFrame.current);
    if (checkpointTimer.current !== null) clearTimeout(checkpointTimer.current);
    previewFrame.current = null;
    checkpointTimer.current = null;
  }

  function drawing(current: Gesture): MusicVideoScene | null {
    const source = latest.current.scene;
    if (source.id === current.scene.id) {
      // A reset/import or another edit owns its new elements. Never resurrect an older gesture over it.
      if (source.elements !== current.sourceElements && source.elements !== current.publishedElements) return null;
      current.scene = source;
      current.sourceElements = source.elements;
    }
    return { ...current.scene, elements: current.erasing ? current.elements
      : [...current.elements, snapshotElement(current)] };
  }

  function checkpoint(current: Gesture, complete = false) {
    const next = drawing(current);
    if (!next) return;
    current.scene = next;
    current.publishedElements = next.elements;
    if (latest.current.onGestureChange) latest.current.onGestureChange(next, current.element.id);
    else if (complete) latest.current.onChange(next);
    if (current.limited && (!current.limitReported || complete)) {
      current.limitReported = true;
      latest.current.onStatus("그림의 저장 한도에 가까워 마지막 점까지 보존했어요. 선을 줄이면 계속 그릴 수 있어요.");
    }
  }

  function scheduleUpdate() {
    if (previewFrame.current === null) {
      previewFrame.current = requestAnimationFrame(() => {
        previewFrame.current = null;
        if (gesture.current) setDraft(preview(gesture.current));
      });
    }
    if (latest.current.onGestureChange && checkpointTimer.current === null) {
      checkpointTimer.current = setTimeout(() => {
        checkpointTimer.current = null;
        if (gesture.current) checkpoint(gesture.current);
      }, CHECKPOINT_INTERVAL_MS);
    }
  }

  function preserveGesture(updatePreview = true) {
    const current = gesture.current;
    if (!current) return;
    cancelScheduled();
    gesture.current = null;
    checkpoint(current, true);
    latest.current.onDrawingChange?.(false);
    if (updatePreview) setDraft(null);
  }
  const preserve = useRef(preserveGesture);
  preserve.current = preserveGesture;
  useImperativeHandle(ref, () => ({ flush: () => preserve.current() }), []);

  useEffect(() => {
    const current = gesture.current;
    if (!current) return;
    if (current.scene.id !== scene.id || current.tool !== tool || disabled) preserve.current();
    else if (scene.elements !== current.sourceElements && scene.elements !== current.publishedElements) {
      cancelScheduled();
      gesture.current = null;
      setDraft(null);
      latest.current.onDrawingChange?.(false);
    }
  }, [tool, scene.id, scene.elements, disabled]);

  useEffect(() => {
    function leaving() {
      // Finish the React commit before the application's later storage-flush listeners run.
      if (gesture.current) flushSync(() => preserve.current());
    }
    function hidden() { if (document.visibilityState === "hidden") leaving(); }
    document.addEventListener("visibilitychange", hidden, true);
    window.addEventListener("pagehide", leaving, true);
    window.addEventListener("beforeunload", leaving, true);
    return () => {
      document.removeEventListener("visibilitychange", hidden, true);
      window.removeEventListener("pagehide", leaving, true);
      window.removeEventListener("beforeunload", leaving, true);
      preserve.current(false);
      cancelScheduled();
    };
  }, []);

  function point(event: Readonly<{ clientX: number; clientY: number; pointerType: string; pressure: number }>,
    rect: DOMRect): ScenePoint {
    return [Math.round(Math.max(0, Math.min(SCENE_WIDTH, (event.clientX - rect.left) / rect.width * SCENE_WIDTH)) * 10) / 10,
      Math.round(Math.max(0, Math.min(SCENE_HEIGHT, (event.clientY - rect.top) / rect.height * SCENE_HEIGHT)) * 10) / 10,
      event.pointerType === "pen" && event.pressure > 0 ? Math.round(event.pressure * 100) / 100 : .5];
  }

  function start(event: PointerEvent<SVGSVGElement>) {
    if (disabled || event.button !== 0 || gesture.current) return;
    if (tool === "select") {
      event.preventDefault();
      event.currentTarget.focus();
      const p = point(event, event.currentTarget.getBoundingClientRect());
      onSelectElement?.(hitSceneElement(scene, p[0], p[1]), event.shiftKey || event.ctrlKey || event.metaKey);
      return;
    }
    if (scene.elements.length >= MAX_ELEMENTS && tool !== "eraser") {
      onStatus("이 장면의 선이 많아요. 새 장면을 추가하거나 지우개로 선을 지워 주세요.");
      return;
    }
    const pointLimit = Math.min(MAX_POINTS, remainingPoints ?? MAX_TOTAL_POINTS -
      scene.elements.reduce((total, element) => total + element.points.length, 0));
    if (tool !== "eraser" && pointLimit < 1) {
      onStatus("그림의 저장 한도에 도달했어요. 기존 선을 줄이면 계속 그릴 수 있어요.");
      return;
    }
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    const p = point(event, event.currentTarget.getBoundingClientRect());
    const next: Gesture = { pointerId: event.pointerId, erasing: tool === "eraser",
      element: { id: crypto.randomUUID(), tool: tool === "eraser" ? "brush" : tool, color, width, points: [p] },
      elements: tool === "eraser" ? scene.elements.filter((element) => !elementHit(element, p[0], p[1], width)) : scene.elements,
      scene, sourceElements: scene.elements, pointLimit, limited: false, limitReported: false, tool,
      points: [p], dirty: false };
    gesture.current = next;
    setDraft(preview(next));
    latest.current.onDrawingChange?.(true);
    checkpoint(next);
  }

  function move(event: PointerEvent<SVGSVGElement>) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const samples = event.nativeEvent.getCoalescedEvents?.() ?? [];
    let changed = false;
    for (const sample of [...samples, event]) {
      const p = point(sample, rect);
      const element = current.element;
      if (current.erasing) {
        const remaining = current.elements.filter((item) => !elementHit(item, p[0], p[1], element.width));
        if (remaining.length === current.elements.length) continue;
        current.elements = remaining;
      } else {
        const previous = current.points.at(-1)!;
        if (Math.hypot(previous[0] - p[0], previous[1] - p[1]) < 1) continue;
        const full = current.points.length >= current.pointLimit;
        current.limited ||= element.tool === "brush" && full || current.pointLimit < 2;
        if (current.pointLimit === 1) continue;
        if (element.tool === "brush" && !full) current.points.push(p);
        else if (current.points.length === 1) current.points.push(p);
        else current.points[current.points.length - 1] = p;
        current.dirty = true;
      }
      changed = true;
    }
    if (changed) scheduleUpdate();
  }

  function finish(event: PointerEvent<SVGSVGElement>, canceled = false) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (!canceled) move(event);
    preserveGesture();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return <svg className={`mv-paint-canvas tool-${tool}`} viewBox="0 0 960 540" role="img" tabIndex={0}
    data-testid="scene-paint-canvas" aria-label="장면 그림판. 마우스나 펜, 손가락으로 그림을 그리세요."
    style={{ background: scene.background }} onPointerDown={start} onPointerMove={move}
    onBlur={() => preserveGesture()}
    onPointerUp={(event) => finish(event)} onPointerCancel={(event) => finish(event, true)}
    onLostPointerCapture={(event) => finish(event, true)}>
    <defs><pattern id={gridId} width="60" height="60" patternUnits="userSpaceOnUse">
      <path d="M 60 0 L 0 0 0 60" fill="none" stroke="#c8e5fa" strokeWidth="1" />
    </pattern></defs>
    <rect width="960" height="540" fill={`url(#${gridId})`} pointerEvents="none" aria-hidden="true" />
    {(draft ? draft.elements : scene.elements).map((element) => <ScenePath key={element.id} element={element} />)}
    {draft && !draft.erasing && <ScenePath element={draft.element} />}
    {tool === "select" && <SceneSelectionOverlay elements={scene.elements} selectedIds={selectedIds} />}
  </svg>;
}

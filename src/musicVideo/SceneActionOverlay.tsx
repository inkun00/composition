import { useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { SCENE_HEIGHT, SCENE_WIDTH, type MusicVideoScene } from "../video/musicVideoModel";
import type { SceneActor } from "../video/sceneActionTypes";
import { elementBounds, elementHit, elementPath } from "../video/sceneDrawing";
import { ScenePath } from "./SceneArt";
import { assignActorElements, changeSceneActor, sceneChoreography } from "./sceneActionEditing";
import "./SceneActionOverlay.css";

type Props = Readonly<{
  scene: MusicVideoScene;
  selectedActorId: string | null;
  disabled: boolean;
  onChange: (scene: MusicVideoScene) => void;
  onStatus: (message: string) => void;
}>;
type Point = readonly [number, number];
type Handle = "fixedPoint" | "movingPoint" | "endPoint";
type Gesture = { pointerId: number; start: Point; end: Point; handle?: Handle; actor: SceneActor };
const HANDLES: readonly { key: Handle; label: string; color: string }[] = [
  { key: "fixedPoint", label: "고정점", color: "#3d9e94" },
  { key: "movingPoint", label: "움직일 점", color: "#a17bc7" },
  { key: "endPoint", label: "도착점", color: "#e09156" }
];

export default function SceneActionOverlay({ scene, selectedActorId, disabled, onChange, onStatus }: Props) {
  const choreography = sceneChoreography(scene);
  const selectedActor = choreography.actors.find((actor) => actor.id === selectedActorId);
  const svgRef = useRef<SVGSVGElement>(null);
  const active = useRef<Gesture | null>(null);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const arrowId = `mv-action-arrow-${useId().replace(/:/g, "")}`;
  const actor = selectedActor && gesture?.handle ? { ...selectedActor, [gesture.handle]: gesture.end } : selectedActor;

  function point(event: PointerEvent): Point {
    const rect = svgRef.current!.getBoundingClientRect();
    return [Math.round(Math.max(0, Math.min(SCENE_WIDTH, (event.clientX - rect.left) / rect.width * SCENE_WIDTH))),
      Math.round(Math.max(0, Math.min(SCENE_HEIGHT, (event.clientY - rect.top) / rect.height * SCENE_HEIGHT)))];
  }

  function start(event: PointerEvent, handle?: Handle) {
    if (disabled || event.button !== 0 || active.current) return;
    event.preventDefault();
    event.stopPropagation();
    if (!selectedActor) {
      onStatus("먼저 오른쪽 동작 연출에서 손·전등 등 대상을 추가해 주세요.");
      return;
    }
    const p = point(event);
    const next = { pointerId: event.pointerId, start: p, end: p, handle, actor: selectedActor };
    active.current = next;
    setGesture(next);
    svgRef.current?.setPointerCapture(event.pointerId);
  }

  function move(event: PointerEvent) {
    if (!active.current || active.current.pointerId !== event.pointerId) return;
    const next = { ...active.current, end: point(event) };
    active.current = next;
    setGesture(next);
  }

  function finish(event: PointerEvent, canceled = false) {
    const current = active.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (!canceled) {
      const end = point(event);
      if (current.handle) {
        onChange(changeSceneActor(scene, current.actor.id, { [current.handle]: end }));
      } else {
        const distance = Math.hypot(current.start[0] - end[0], current.start[1] - end[1]);
        if (distance < 7) {
          const hit = [...scene.elements].reverse().find((element) => elementHit(element, end[0], end[1], 10));
          if (hit) {
            const ids = current.actor.elementIds;
            onChange(assignActorElements(scene, current.actor.id,
              ids.includes(hit.id) ? ids.filter((id) => id !== hit.id) : [...ids, hit.id]));
          } else onStatus("선 위를 누르거나 선을 둘러싸도록 드래그해 주세요.");
        } else {
          const left = Math.min(current.start[0], end[0]);
          const top = Math.min(current.start[1], end[1]);
          const right = Math.max(current.start[0], end[0]);
          const bottom = Math.max(current.start[1], end[1]);
          const picked = scene.elements.filter((element) => {
            const bounds = elementBounds(element);
            return bounds.left <= right && bounds.right >= left && bounds.top <= bottom && bounds.bottom >= top;
          });
          if (picked.length) onChange(assignActorElements(scene, current.actor.id,
            [...current.actor.elementIds, ...picked.map((element) => element.id)]));
          else onStatus("선이 있는 영역을 드래그해 주세요.");
        }
      }
    }
    active.current = null;
    setGesture(null);
    if (svgRef.current?.hasPointerCapture(event.pointerId)) svgRef.current.releasePointerCapture(event.pointerId);
  }

  function moveHandle(event: KeyboardEvent, handle: Handle) {
    if (!actor || disabled) return;
    const delta: Record<string, Point> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (!delta[event.key]) return;
    event.preventDefault();
    event.stopPropagation();
    const step = event.shiftKey ? 10 : 1;
    const [x, y] = actor[handle];
    onChange(changeSceneActor(scene, actor.id, { [handle]: [
      Math.max(0, Math.min(SCENE_WIDTH, x + delta[event.key][0] * step)),
      Math.max(0, Math.min(SCENE_HEIGHT, y + delta[event.key][1] * step))
    ] }));
  }

  return <svg ref={svgRef} className="mv-action-canvas" viewBox="0 0 960 540" role="group" tabIndex={0}
    data-testid="scene-action-canvas" aria-label="동작 대상 편집. 선을 누르거나 영역을 드래그해 선택하고 점을 옮겨 주세요."
    style={{ background: scene.background }} onPointerDown={(event) => start(event)} onPointerMove={move}
    onPointerUp={(event) => finish(event)} onPointerCancel={(event) => finish(event, true)}
    onLostPointerCapture={() => { active.current = null; setGesture(null); }}>
    <defs><marker id={arrowId} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#e09156" /></marker></defs>
    <g pointerEvents="none">{scene.elements.map((element) => <g key={element.id}
      opacity={!actor || actor.elementIds.includes(element.id) ? 1 : .42}>
      {actor?.elementIds.includes(element.id) && <path d={elementPath(element)} fill="none" stroke="#c4a2e4"
        strokeWidth={element.width + 7} opacity={.45} strokeLinecap="round" strokeLinejoin="round" />}
      <ScenePath element={element} />
    </g>)}</g>
    {actor && actor.elementIds.length > 0 && <g className="mv-action-guide">
      <path d={`M ${actor.fixedPoint.join(" ")} L ${actor.movingPoint.join(" ")}`} stroke="#a17bc7" strokeWidth={2}
        strokeDasharray="6 5" vectorEffect="non-scaling-stroke" fill="none" pointerEvents="none" />
      <path d={`M ${actor.movingPoint.join(" ")} L ${actor.endPoint.join(" ")}`} stroke="#e09156" strokeWidth={2}
        vectorEffect="non-scaling-stroke" fill="none" markerEnd={`url(#${arrowId})`} pointerEvents="none" />
      {HANDLES.map(({ key, label, color }) => <g key={key} className="mv-action-handle" role="button" tabIndex={disabled ? -1 : 0}
        data-testid={`scene-handle-${key}`} aria-label={`${label}. 방향키로 이동`} aria-disabled={disabled}
        onPointerDown={(event) => start(event, key)} onKeyDown={(event) => moveHandle(event, key)}>
        <circle className="mv-action-handle-hit" cx={actor[key][0]} cy={actor[key][1]} r={25} fill="transparent" />
        <circle cx={actor[key][0]} cy={actor[key][1]} r={12} fill={color} stroke="#fff" strokeWidth={2}
          vectorEffect="non-scaling-stroke" />
        <text x={actor[key][0]} y={Math.max(20, actor[key][1] - 21)} textAnchor="middle" fill={color}
          stroke="#fff" strokeWidth={4} paintOrder="stroke" pointerEvents="none">{label}</text>
      </g>)}
    </g>}
    {gesture && !gesture.handle && <rect x={Math.min(gesture.start[0], gesture.end[0])}
      y={Math.min(gesture.start[1], gesture.end[1])} width={Math.abs(gesture.end[0] - gesture.start[0])}
      height={Math.abs(gesture.end[1] - gesture.start[1])} fill="#b393db25" stroke="#a17bc7"
      strokeDasharray="6 4" vectorEffect="non-scaling-stroke" pointerEvents="none" />}
  </svg>;
}

import {
  MAX_ELEMENTS, MAX_TOTAL_POINTS, SCENE_HEIGHT, SCENE_WIDTH,
  type MusicVideoScene, type SceneElement, type ScenePoint
} from "../video/musicVideoModel";
import { getAssignedMotionGroups } from "./sceneMotionGroups";

export type SceneClipboard = Readonly<{ elements: readonly SceneElement[] }>;
export type ScenePasteResult = Readonly<
  { ok: true; scene: MusicVideoScene; selectedIds: readonly string[]; status: string } |
  { ok: false; status: string }
>;

/** Snapshot authored objects in paint order; the clipboard never retains live point arrays. */
export function copySceneElements(scene: MusicVideoScene, selectedIds: readonly string[]): SceneClipboard | null {
  const selected = new Set(selectedIds);
  const elements = scene.elements.filter((element) => selected.has(element.id)).map((element) => ({
    ...element,
    points: element.points.map(([x, y, pressure]) => [x, y, pressure] as ScenePoint)
  }));
  return elements.length ? { elements } : null;
}

function boundedOffset(minimum: number, maximum: number, boundary: number, desired: number): number {
  const positiveRoom = boundary - maximum;
  const negativeRoom = minimum;
  if (positiveRoom >= desired) return desired;
  if (negativeRoom >= desired) return -desired;
  return positiveRoom >= negativeRoom ? positiveRoom : -negativeRoom;
}

/** Prepare one atomic paste. The caller commits it through the normal scene undo/autosave path. */
export function pasteSceneElements(scene: MusicVideoScene, clipboard: SceneClipboard | null,
  remainingPoints: number, pasteIndex = 0): ScenePasteResult {
  if (!clipboard?.elements.length) return { ok: false, status: "먼저 복사할 선이나 도형을 선택해 주세요." };
  if (scene.elements.length + clipboard.elements.length > MAX_ELEMENTS) {
    return { ok: false, status: `한 장면에는 개체를 ${MAX_ELEMENTS}개까지 넣을 수 있어요. 일부 개체를 지운 뒤 붙여넣어 주세요.` };
  }
  const pointCount = clipboard.elements.reduce((sum, element) => sum + element.points.length, 0);
  const scenePointCount = scene.elements.reduce((sum, element) => sum + element.points.length, 0);
  if (!Number.isFinite(remainingPoints) || pointCount > Math.max(0, Math.min(remainingPoints, MAX_TOTAL_POINTS - scenePointCount))) {
    return { ok: false, status: "그림의 전체 용량을 넘어서 붙여넣지 못했어요. 다른 선이나 장면을 줄인 뒤 다시 시도해 주세요." };
  }

  const points = clipboard.elements.flatMap((element) => element.points);
  const desired = 16 * ((Math.max(0, Math.floor(pasteIndex)) % 8) + 1);
  const dx = boundedOffset(Math.min(...points.map((point) => point[0])),
    Math.max(...points.map((point) => point[0])), SCENE_WIDTH, desired);
  const dy = boundedOffset(Math.min(...points.map((point) => point[1])),
    Math.max(...points.map((point) => point[1])), SCENE_HEIGHT, desired);
  const occupiedIds = new Set([...scene.elements, ...clipboard.elements].map((element) => element.id));
  const occupiedGroups = new Set([...scene.elements, ...clipboard.elements]
    .flatMap((element) => element.motionGroupId ? [element.motionGroupId] : []));
  const freshId = (occupied: Set<string>) => {
    let id = crypto.randomUUID();
    while (occupied.has(id)) id = crypto.randomUUID();
    occupied.add(id);
    return id;
  };
  const copiedGroups = getAssignedMotionGroups({ ...scene, elements: clipboard.elements, choreography: undefined });
  const groupByElement = new Map<string, string>();
  for (const group of copiedGroups) {
    const id = freshId(occupiedGroups);
    for (const element of group.elements) groupByElement.set(element.id, id);
  }
  const pasted = clipboard.elements.map((element): SceneElement => {
    const { motionGroupId: _originalGroup, ...drawing } = element;
    const motionGroupId = groupByElement.get(element.id);
    return { ...drawing, id: freshId(occupiedIds),
      points: element.points.map(([x, y, pressure]) => [x + dx, y + dy, pressure] as ScenePoint),
      ...(motionGroupId ? { motionGroupId } : {}) };
  });
  return { ok: true, scene: { ...scene, elements: [...scene.elements, ...pasted] },
    selectedIds: pasted.map((element) => element.id),
    status: `개체 ${pasted.length}개를 붙여넣었어요. 다른 장면에도 붙여넣을 수 있어요.` };
}

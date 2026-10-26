import type { DrawingTool, MusicVideoScene, SceneElement } from "../video/musicVideoModel";
import { elementHit, elementPath } from "../video/sceneDrawing";

export type SceneEditorTool = DrawingTool | "eraser" | "select";
export type SceneMotionScope = "whole" | "selection";
export type SceneSelectionControls = Readonly<{
  scope: SceneMotionScope;
  selectedIds: readonly string[];
  onScopeChange: (scope: SceneMotionScope) => void;
  onClear: () => void;
  onSelectElement?: (id: string, additive?: boolean) => void;
  onSelectElements?: (ids: readonly string[], additive?: boolean) => void;
}>;

const outlines = new WeakMap<SceneElement, readonly number[]>();

function brushContains(element: SceneElement, x: number, y: number): boolean {
  let outline = outlines.get(element);
  if (!outline) {
    outline = elementPath(element).match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
    outlines.set(element, outline);
  }
  let winding = 0;
  for (let index = 0, previous = outline.length - 2; index < outline.length; previous = index, index += 2) {
    const ax = outline[previous];
    const ay = outline[previous + 1];
    const bx = outline[index];
    const by = outline[index + 1];
    const cross = (bx - ax) * (y - ay) - (x - ax) * (by - ay);
    if (ay <= y && by > y && cross > 0) winding++;
    else if (ay > y && by <= y && cross < 0) winding--;
  }
  return winding !== 0;
}

export function sceneElementContains(element: SceneElement, x: number, y: number): boolean {
  const first = element.points[0];
  const last = element.points.at(-1)!;
  if (element.tool === "rectangle" && x >= Math.min(first[0], last[0]) && x <= Math.max(first[0], last[0]) &&
    y >= Math.min(first[1], last[1]) && y <= Math.max(first[1], last[1])) return true;
  if (element.tool === "ellipse") {
    const rx = Math.abs(last[0] - first[0]) / 2;
    const ry = Math.abs(last[1] - first[1]) / 2;
    if (rx > 0 && ry > 0 && Math.hypot((x - (first[0] + last[0]) / 2) / rx,
      (y - (first[1] + last[1]) / 2) / ry) <= 1) return true;
  }
  return element.tool === "brush" && brushContains(element, x, y) || elementHit(element, x, y, 5);
}

/** Hit testing follows paint order and returns the complete authored element. */
export function hitSceneElement(scene: MusicVideoScene, x: number, y: number): string | null {
  for (let index = scene.elements.length - 1; index >= 0; index--) {
    const element = scene.elements[index];
    if (sceneElementContains(element, x, y)) return element.id;
  }
  return null;
}

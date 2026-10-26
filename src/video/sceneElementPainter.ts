import type { SceneElement } from "./musicVideoModel";
import { elementPath } from "./sceneDrawing";

const paths = new WeakMap<SceneElement, Path2D>();

export function paintSceneElement(context: CanvasRenderingContext2D, element: SceneElement,
  pathData?: string, color = element.color): void {
  let path = pathData ? new Path2D(pathData) : paths.get(element);
  if (!path) { path = new Path2D(elementPath(element)); paths.set(element, path); }
  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = color;
  context.lineWidth = element.width;
  if (element.tool === "brush") { context.fillStyle = color; context.fill(path); }
  else context.stroke(path);
}

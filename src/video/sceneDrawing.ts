import { getStroke } from "perfect-freehand";
import type { SceneElement } from "./musicVideoModel";

export function elementBounds(element: SceneElement) {
  const xs = element.points.map((point) => point[0]);
  const ys = element.points.map((point) => point[1]);
  return { left: Math.min(...xs) - element.width / 2, top: Math.min(...ys) - element.width / 2,
    right: Math.max(...xs) + element.width / 2, bottom: Math.max(...ys) + element.width / 2 };
}

/** Shared paths keep the painting surface and exported video visually identical. */
export function elementPath(element: SceneElement): string {
  const first = element.points[0];
  if (!first) return "";
  const last = element.points.at(-1)!;
  if (element.tool === "line") return `M ${first[0]} ${first[1]} L ${last[0]} ${last[1]}`;
  const left = Math.min(first[0], last[0]);
  const top = Math.min(first[1], last[1]);
  const width = Math.abs(first[0] - last[0]);
  const height = Math.abs(first[1] - last[1]);
  if (element.tool === "rectangle") return `M ${left} ${top} h ${width} v ${height} h ${-width} Z`;
  if (element.tool === "ellipse") {
    const rx = Math.max(.1, width / 2);
    const ry = Math.max(.1, height / 2);
    const cx = left + rx;
    const cy = top + ry;
    return `M ${cx - rx} ${cy} a ${rx} ${ry} 0 1 0 ${2 * rx} 0 a ${rx} ${ry} 0 1 0 ${-2 * rx} 0`;
  }
  const outline = getStroke(element.points.map((point) => [...point]), {
    size: element.width, thinning: .45, smoothing: .6, streamline: .4, simulatePressure: false
  });
  return outline.length > 0 ? `M ${outline.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(" L ")} Z` : "";
}

function segmentDistance(x: number, y: number, a: readonly number[], b: readonly number[]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
}

export function elementHit(element: SceneElement, x: number, y: number, radius: number): boolean {
  const points = element.points;
  const a = points[0];
  const b = points.at(-1)!;
  const tolerance = radius + element.width / 2;
  if (element.tool === "ellipse") {
    const rx = Math.max(.1, Math.abs(a[0] - b[0]) / 2);
    const ry = Math.max(.1, Math.abs(a[1] - b[1]) / 2);
    return Math.abs(Math.hypot((x - (a[0] + b[0]) / 2) / rx, (y - (a[1] + b[1]) / 2) / ry) - 1) *
      Math.min(rx, ry) <= tolerance;
  }
  if (element.tool === "rectangle") {
    const corners = [a, [b[0], a[1]], b, [a[0], b[1]], a];
    return corners.slice(1).some((corner, index) => segmentDistance(x, y, corners[index], corner) <= tolerance);
  }
  if (points.length === 1) return Math.hypot(x - a[0], y - a[1]) <= tolerance;
  return points.slice(1).some((point, index) => segmentDistance(x, y, points[index], point) <= tolerance);
}

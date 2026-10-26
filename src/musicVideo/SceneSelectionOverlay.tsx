import type { SceneElement } from "../video/musicVideoModel";
import { elementBounds, elementPath } from "../video/sceneDrawing";

export default function SceneSelectionOverlay({ elements, selectedIds }: Readonly<{
  elements: readonly SceneElement[];
  selectedIds: readonly string[];
}>) {
  const selected = elements.filter((element) => selectedIds.includes(element.id));
  if (!selected.length) return null;
  return <g className="mv-selection-overlay" data-testid="scene-selection-outline" pointerEvents="none" aria-hidden="true">
    {selected.map((element) => {
      const bounds = elementBounds(element);
      return <g key={element.id} data-element-id={element.id}>
        <path d={elementPath(element)} fill="none" stroke="#1a73e8" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        <rect x={bounds.left - 4} y={bounds.top - 4} width={bounds.right - bounds.left + 8}
          height={bounds.bottom - bounds.top + 8} fill="none" stroke="#1a73e8" strokeWidth={1.5}
          strokeDasharray="5 3" vectorEffect="non-scaling-stroke" />
      </g>;
    })}
  </g>;
}

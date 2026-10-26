import type { SceneSelectionControls } from "./sceneSelection";
import "./SceneSelection.css";

export default function SceneMotionScopeControl({ selection, disabled }: Readonly<{
  selection: SceneSelectionControls;
  disabled: boolean;
}>) {
  return <div className="mv-motion-scope">
    <div role="group" aria-label="움직임 적용 범위">
      <button type="button" data-testid="scene-motion-scope-whole" aria-pressed={selection.scope === "whole"}
        disabled={disabled} onClick={() => selection.onScopeChange("whole")}>전체 그림</button>
      <button type="button" data-testid="scene-motion-scope-selection" aria-pressed={selection.scope === "selection"}
        disabled={disabled} onClick={() => selection.onScopeChange("selection")}>선택한 개체 {selection.selectedIds.length}개</button>
    </div>
    {selection.scope === "selection" && <p>{selection.selectedIds.length
      ? "선택한 개체에만 움직임을 적용해요. 다른 개체의 효과는 유지돼요."
      : "그림판에서 움직일 개체를 눌러 선택해 주세요."}</p>}
  </div>;
}

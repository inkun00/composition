import "./SceneSelection.css";

export default function SceneSelectionStatus({ count, disabled, onClear }: Readonly<{
  count: number;
  disabled: boolean;
  onClear: () => void;
}>) {
  return <span className="mv-selection-status" data-testid="scene-selection-status" role="status">
    <span>{count ? `선택한 개체 ${count}개` : "움직일 개체를 눌러 선택해 주세요"}</span>
    {count > 0 && <button type="button" data-testid="scene-clear-selection" aria-label="개체 선택 해제"
      disabled={disabled} onClick={onClear}>선택 해제</button>}
  </span>;
}

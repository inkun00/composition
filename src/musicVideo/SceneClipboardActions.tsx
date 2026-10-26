import "./SceneClipboardActions.css";

type Props = Readonly<{
  disabled: boolean;
  selectedCount: number;
  clipboardCount: number;
  onCopy: () => void;
  onPaste: () => void;
}>;

export default function SceneClipboardActions(props: Props) {
  return <div className="mv-clipboard-actions" role="group" aria-label="선택한 그림 복사와 붙여넣기">
    <button type="button" data-testid="scene-copy-elements" aria-label="선택한 개체 복사"
      aria-keyshortcuts="Control+C Meta+C" disabled={props.disabled || props.selectedCount === 0}
      title="선택한 선과 도형 복사 (Ctrl+C / ⌘C)" onClick={props.onCopy}>
      <span>복사</span><kbd aria-hidden="true">C</kbd>
    </button>
    <button type="button" data-testid="scene-paste-elements" aria-label="복사한 개체 붙여넣기"
      aria-keyshortcuts="Control+V Meta+V" disabled={props.disabled || props.clipboardCount === 0}
      title="복사한 개체를 현재 장면에 붙여넣기 (Ctrl+V / ⌘V)" onClick={props.onPaste}>
      <span>붙여넣기</span>
      {props.clipboardCount > 0 && <span className="mv-clipboard-count" aria-hidden="true">{props.clipboardCount}</span>}
      <kbd aria-hidden="true">V</kbd>
    </button>
  </div>;
}

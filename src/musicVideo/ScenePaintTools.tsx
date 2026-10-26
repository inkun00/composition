import StudioArtwork from "./StudioArtwork";
import type { SceneEditorTool } from "./sceneSelection";
import "./ScenePaintTools.css";

type Props = Readonly<{
  tool: SceneEditorTool;
  onToolChange: (tool: SceneEditorTool) => void;
  color: string;
  onColorChange: (color: string) => void;
  width: number;
  onWidthChange: (width: number) => void;
  disabled: boolean;
  canUndo: boolean;
  canRedo: boolean;
  hasDrawing: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
}>;

const TOOLS = [
  { id: "select", label: "선택", hint: "움직일 개체 선택", shortcut: "V" },
  { id: "brush", label: "붓", hint: "자유롭게 그리기", shortcut: "B" },
  { id: "eraser", label: "지우개", hint: "선과 도형 지우기", shortcut: "E" },
  { id: "line", label: "직선", hint: "반듯한 선 그리기", shortcut: "L" },
  { id: "rectangle", label: "네모", hint: "네모 그리기", shortcut: "R" },
  { id: "ellipse", label: "동그라미", hint: "동그라미 그리기", shortcut: "O" }
] as const;

const COLORS = [
  { value: "#1e293b", name: "잉크" },
  { value: "#ef4444", name: "빨강" },
  { value: "#f97316", name: "귤빛" },
  { value: "#facc15", name: "햇살" },
  { value: "#22c55e", name: "풀잎" },
  { value: "#14b8a6", name: "민트" },
  { value: "#3b82f6", name: "파랑" },
  { value: "#8b5cf6", name: "보라" },
  { value: "#ec4899", name: "분홍" },
  { value: "#ffffff", name: "흰색" }
] as const;

const WIDTHS = [
  { value: 4, label: "가는 선" },
  { value: 8, label: "보통 선" },
  { value: 16, label: "굵은 선" },
  { value: 32, label: "아주 굵은 선" }
] as const;

export default function ScenePaintTools(props: Props) {
  const inactive = props.tool === "eraser" || props.tool === "select";

  return <div className="mv-paint-tools">
    <div className="mv-tool-dock" role="toolbar" aria-label="그림판 도구">
      <div className="mv-drawing-tools">
        {TOOLS.map(({ id, label, hint, shortcut }) => <button
          key={id}
          type="button"
          className={`mv-dock-button${props.tool === id ? " is-selected" : ""}`}
          aria-label={label}
          data-testid={id === "select" ? "scene-select-tool" : undefined}
          aria-pressed={props.tool === id}
          aria-keyshortcuts={shortcut}
          title={`${hint} (${shortcut})`}
          disabled={props.disabled}
          onClick={() => props.onToolChange(id)}
        >
          <StudioArtwork name={id} size={34} />
          <span>{label}</span>
        </button>)}
      </div>
      <span className="mv-dock-divider" aria-hidden="true" />
      <div className="mv-dock-history">
        <button type="button" className="mv-dock-button" aria-label="그림 되돌리기"
          title="되돌리기 (Ctrl+Z)" disabled={props.disabled || !props.canUndo} onClick={props.onUndo}>
          <StudioArtwork name="rotate-back" size={26} />
        </button>
        <button type="button" className="mv-dock-button" aria-label="그림 다시 실행"
          title="다시 실행 (Ctrl+Shift+Z)" disabled={props.disabled || !props.canRedo} onClick={props.onRedo}>
          <StudioArtwork name="redo" size={26} />
        </button>
        <button type="button" className="mv-dock-button mv-dock-clear" aria-label="현재 장면 비우기"
          title="현재 장면 비우기" disabled={props.disabled || !props.hasDrawing} onClick={props.onClear}>
          <StudioArtwork name="delete" size={26} />
        </button>
      </div>
    </div>

    <section className={`mv-brush-controls${inactive ? " is-erasing" : ""}`} aria-label="그리기 설정">
      <div className="mv-color-controls">
        <span className="mv-control-label">색</span>
        <div className="mv-color-grid">
          {COLORS.map(({ value, name }) => <button type="button" key={value}
            className={`mv-color-chip${props.color.toLowerCase() === value ? " is-selected" : ""}`}
            aria-label={`색상 ${value}`} aria-pressed={props.color.toLowerCase() === value}
            title={name} disabled={props.disabled || inactive} onClick={() => props.onColorChange(value)}>
            <span style={{ backgroundColor: value }} />
          </button>)}
        </div>
        <label className="mv-color-picker">
          <StudioArtwork name="palette" size={23} />
          <span className="mv-sr-only">나만의 색</span>
          <input aria-label="붓 색상" type="color" value={props.color}
            disabled={props.disabled || inactive} onChange={(event) => props.onColorChange(event.target.value)} />
        </label>
      </div>
      <div className="mv-width-controls">
        <span className="mv-control-label">굵기</span>
        <div className="mv-width-presets">
          {WIDTHS.map(({ value, label }) => <button type="button" key={value}
            className={props.width === value ? "is-selected" : ""} aria-label={label}
            aria-pressed={props.width === value} title={label} disabled={props.disabled || inactive}
            onClick={() => props.onWidthChange(value)}>
            <span style={{ height: Math.max(2, value / 3) }} />
          </button>)}
        </div>
        <input aria-label="붓 굵기" type="range" min={2} max={48} value={props.width}
          disabled={props.disabled || inactive} onChange={(event) => props.onWidthChange(Number(event.target.value))} />
        <output>{props.width}</output>
      </div>
    </section>
  </div>;
}

import { useRef, type KeyboardEvent } from "react";
import "./ComposerWorkspaceTabs.css";

export type ComposerWorkspaceView = "melody" | "arrange" | "publish";

type Props = Readonly<{
  value: ComposerWorkspaceView;
  onChange: (view: ComposerWorkspaceView) => void;
  arrangementAvailable: boolean;
}>;

const WORKSPACES: readonly Readonly<{ value: ComposerWorkspaceView; label: string }>[] = [
  { value: "melody", label: "가락 만들기" },
  { value: "arrange", label: "반주·가사" },
  { value: "publish", label: "저장·발표" }
];

export default function ComposerWorkspaceTabs({ value, onChange, arrangementAvailable }: Props) {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function navigate(event: KeyboardEvent<HTMLButtonElement>, current: number) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    let next: number;
    switch (event.key) {
      case "ArrowRight":
        next = (current + 1) % WORKSPACES.length;
        break;
      case "ArrowLeft":
        next = (current - 1 + WORKSPACES.length) % WORKSPACES.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = WORKSPACES.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    onChange(WORKSPACES[next].value);
    tabRefs.current[next]?.focus();
  }

  return <div className="composer-workspace-tabs" role="tablist" aria-label="노래 만들기 작업">
    {WORKSPACES.map((workspace, index) => {
      const selected = value === workspace.value;
      const preview = workspace.value !== "melody" && !arrangementAvailable;
      const hintId = `composer-tab-${workspace.value}-hint`;
      return <button key={workspace.value} ref={(element) => { tabRefs.current[index] = element; }}
        type="button" role="tab" id={`composer-tab-${workspace.value}`}
        aria-controls={`composer-panel-${workspace.value}`} aria-selected={selected}
        aria-label={workspace.label} aria-describedby={preview ? hintId : undefined}
        tabIndex={selected ? 0 : -1} className="composer-workspace-tab"
        onClick={() => onChange(workspace.value)} onKeyDown={(event) => navigate(event, index)}>
        <span className="composer-workspace-tab-number" aria-hidden="true">{index + 1}</span>
        <span className="composer-workspace-tab-copy">
          <strong>{workspace.label}</strong>
          {preview && <small id={hintId}>미리 살펴보기</small>}
        </span>
      </button>;
    })}
  </div>;
}

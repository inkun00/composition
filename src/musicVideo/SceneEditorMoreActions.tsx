import { useEffect, useRef, useState, type ReactNode } from "react";
import StudioArtwork from "./StudioArtwork";
import "./SceneEditorMoreActions.css";

/** Keep infrequent file actions available without shrinking the mobile canvas. */
export default function SceneEditorMoreActions({ children, disabled }: Readonly<{ children: ReactNode; disabled: boolean }>) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  return <div ref={root} className="mv-editor-more-actions" data-open={open} onKeyDown={(event) => {
    if (open && event.key === "Escape" && !event.defaultPrevented) {
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    }
  }}>
    <button ref={trigger} type="button" className="mv-editor-more-trigger" aria-label="장면 옵션"
      aria-expanded={open} disabled={disabled} onClick={() => setOpen((value) => !value)}>
      <StudioArtwork name="settings" size={22} />
    </button>
    <div className="mv-editor-more-content">{children}</div>
  </div>;
}

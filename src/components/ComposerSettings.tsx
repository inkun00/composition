import type { ReactNode } from "react";
import { Minus, Plus, SlidersHorizontal } from "./AppArtworkIcons";
import "./ComposerSimplification.css";

type Props = Readonly<{
  summary: string;
  children: ReactNode;
}>;

export default function ComposerSettings({ summary, children }: Props) {
  return <details className="composer-settings" data-save-target="settings">
    <summary>
      <SlidersHorizontal size={18} aria-hidden="true" />
      <strong>곡 설정</strong>
      <span className="composer-settings-description">{summary}</span>
      <span className="app-settings-indicator" aria-hidden="true"><Plus size={20} /><Minus size={20} /></span>
    </summary>
    <div className="composer-settings-content">{children}</div>
  </details>;
}

import type { ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
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
      <span>{summary}</span>
    </summary>
    <div className="composer-settings-content">{children}</div>
  </details>;
}

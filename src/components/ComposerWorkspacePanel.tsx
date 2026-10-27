import type { ReactNode } from "react";
import type { ComposerWorkspaceView } from "./ComposerWorkspaceTabs";

export default function ComposerWorkspacePanel({ view, active, children }: Readonly<{
  view: ComposerWorkspaceView;
  active: ComposerWorkspaceView;
  children: ReactNode;
}>) {
  // Keep playback/export owners mounted when the user changes workspaces.
  return <div id={`composer-panel-${view}`} role="tabpanel" tabIndex={0}
    aria-labelledby={`composer-tab-${view}`} hidden={active !== view}
    className={`composer-workspace-panel workspace-${view}`}>
    {children}
  </div>;
}

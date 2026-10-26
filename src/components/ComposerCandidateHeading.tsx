import type { HarmonyStory } from "../music/types";
import type { ReactNode } from "react";

export default function ComposerCandidateHeading({ current, total, story, children }: Readonly<{
  current: number;
  total: number;
  story: HarmonyStory;
  children?: ReactNode;
}>) {
  return <div className="candidate-selection-header">
    <div className="section-heading app-candidate-heading">
      <div className="app-candidate-heading-copy">
        <div><span className={`dot ${story}`} /><h2>가락</h2></div>
        <span className="count-pill">{current}/{total} 마디</span>
      </div>
    </div>
    {children}
  </div>;
}

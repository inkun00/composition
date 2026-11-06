import { lazy, Suspense } from "react";
import { BookOpen, Music2 } from "../components/AppArtworkIcons";

const MusicLearning = lazy(() => import("./MusicLearning"));
const PracticeMode = lazy(() => import("../practice/PracticeMode"));
export type MusicActivity = "practice" | "learning";

export default function MusicActivityScreen({ activity, onClose, onChange }: {
  activity: MusicActivity; onClose: () => void; onChange: (activity: MusicActivity) => void;
}) {
  return <Suspense fallback={<div role="status" style={{ padding: 40 }}>음악 놀이터를 준비하고 있어요…</div>}>
    {activity === "learning" ? <MusicLearning onClose={onClose} onCreate={() => onChange("practice")} /> : <PracticeMode onClose={onClose} />}
  </Suspense>;
}

export function MusicActivityMenuItems({ disabled, onOpen }: { disabled: boolean; onOpen: (activity: MusicActivity) => void }) {
  return <>
    <button type="button" role="menuitem" disabled={disabled} onClick={() => onOpen("learning")}><BookOpen size={16} /> 음악 학습하기</button>
    <button type="button" role="menuitem" disabled={disabled} onClick={() => onOpen("practice")}><Music2 size={16} /> 기능 연습하기</button>
  </>;
}

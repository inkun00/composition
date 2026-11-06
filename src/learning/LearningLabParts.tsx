import { Play, Square } from "lucide-react";
import type { CSSProperties } from "react";
import type { LearningPlayback } from "./useLearningPlayback";

export function ListenButton({ audio, onPlay, label = "소리로 들어보기", disabled = false }: {
  audio: LearningPlayback; onPlay: () => void; label?: string; disabled?: boolean;
}) {
  return <button className="learn-primary" disabled={disabled} onClick={audio.playing ? audio.stop : onPlay}>
    {audio.playing ? <Square size={17} aria-hidden="true" /> : <Play size={17} aria-hidden="true" />}
    {audio.playing ? "멈추기" : label}
  </button>;
}

export function BeatRail({ total, active = -1, filled = total }: { total: number; active?: number; filled?: number }) {
  return <div className="learn-beat-rail" style={{ "--beat-count": total } as CSSProperties}
    aria-label={`${total}박 중 ${Math.min(filled, total)}박 채움`}>
    {Array.from({ length: total }, (_, index) => <div key={index}
      style={{ "--beat-fill": `${Math.min(1, Math.max(0, filled - index)) * 100}%` } as CSSProperties}
      className={`learn-beat${index < filled ? " is-filled" : ""}${Math.floor(active) === index ? " is-active" : ""}`}>
      <span>{index + 1}</span><small>{filled > index && filled < index + 1 ? "박의 ½" : Math.floor(active) === index ? "지금!" : "박"}</small>
    </div>)}
  </div>;
}

export function LabNote({ children }: { children: React.ReactNode }) {
  return <p className="learn-lab-note">{children}</p>;
}

import { ExternalLink } from "lucide-react";
import type { KeyboardEvent } from "react";
import type { PracticeCreationMode } from "./practiceCreationMode";

export const PRACTICE_SHARE_URL = "https://samboard.vivasam.com/studentEntry/?brdId=brd-0RXAMP8AGEZ2B";

type PracticeStagesProps = {
  mode: PracticeCreationMode;
  step: "rhythm" | "melody";
  saving: boolean;
  busy: boolean;
  canGoToMelody: boolean;
  onRhythm: () => void;
  onMelody: () => void;
  onSave: () => void;
};

export default function PracticeStages({ mode, step, saving, busy, canGoToMelody, onRhythm, onMelody, onSave }: PracticeStagesProps) {
  const combined = mode === "rhythm-melody";
  const saveNumber = combined ? 3 : 2;
  function navigateTabs(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
      .filter((tab) => !tab.disabled);
    const current = tabs.indexOf(event.target as HTMLButtonElement);
    if (current < 0 || !tabs.length) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
      : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next].focus();
    tabs[next].click();
  }

  return (
    <nav className={`practice-step-tabs practice-composition-stages${combined ? "" : " is-single-mode"}`} aria-label="음악 만들기 순서">
      <div className="practice-stage-tablist" role="tablist" aria-label="연습 단계" onKeyDown={navigateTabs}>
        {mode !== "melody" && <button type="button" role="tab" id="practice-rhythm-tab" aria-controls="practice-workspace"
          aria-selected={!saving && step === "rhythm"} tabIndex={!saving && step === "rhythm" ? 0 : -1}
          disabled={busy} onClick={onRhythm}>
          <span>1</span><strong>리듬 만들기</strong>
        </button>}
        {mode !== "rhythm" && <button type="button" role="tab" id="practice-melody-tab" aria-controls="practice-workspace"
          aria-selected={!saving && step === "melody"} tabIndex={!saving && step === "melody" ? 0 : -1}
          disabled={busy || !canGoToMelody} onClick={onMelody}>
          <span>{combined ? 2 : 1}</span><strong>가락 만들기</strong>
        </button>}
        <button type="button" role="tab" id="practice-save-tab" aria-controls="practice-save-panel"
          aria-selected={saving} tabIndex={saving ? 0 : -1} disabled={busy} onClick={onSave}>
          <span>{saveNumber}</span><strong>음악 저장하기</strong>
        </button>
      </div>
      <a className="practice-share-stage" href={PRACTICE_SHARE_URL} target="_blank" rel="noopener noreferrer"
        aria-label={`${saveNumber + 1} 음악 공유하기: 샘보드 새 창 열기`}>
        <span>{saveNumber + 1}</span><strong>음악 공유하기 <ExternalLink size={14} aria-hidden="true" /></strong>
      </a>
    </nav>
  );
}

import { ExternalLink } from "lucide-react";
import type { KeyboardEvent } from "react";

export const PRACTICE_SHARE_URL = "https://samboard.vivasam.com/studentEntry/?brdId=brd-0RXAMP8AGEZ2B";

type PracticeStagesProps = {
  step: "rhythm" | "melody";
  saving: boolean;
  busy: boolean;
  complete: boolean;
  onRhythm: () => void;
  onMelody: () => void;
  onSave: () => void;
};

export default function PracticeStages({ step, saving, busy, complete, onRhythm, onMelody, onSave }: PracticeStagesProps) {
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
    <nav className="practice-step-tabs practice-composition-stages" aria-label="음악 만들기 순서">
      <div className="practice-stage-tablist" role="tablist" aria-label="연습 단계" onKeyDown={navigateTabs}>
        <button type="button" role="tab" id="practice-rhythm-tab" aria-controls="practice-workspace"
          aria-selected={!saving && step === "rhythm"} tabIndex={!saving && step === "rhythm" ? 0 : -1}
          disabled={busy} onClick={onRhythm}>
          <span>1</span><div><strong>리듬 만들기</strong><small>모든 마디의 박자 채우기</small></div>
        </button>
        <button type="button" role="tab" id="practice-melody-tab" aria-controls="practice-workspace"
          aria-selected={!saving && step === "melody"} tabIndex={!saving && step === "melody" ? 0 : -1}
          disabled={busy || (step !== "melody" && !complete)} onClick={onMelody}>
          <span>2</span><div><strong>가락 만들기</strong><small>선택 · 음높이와 리듬 다듬기</small></div>
        </button>
        <button type="button" role="tab" id="practice-save-tab" aria-controls="practice-save-panel"
          aria-selected={saving} tabIndex={saving ? 0 : -1} disabled={busy} onClick={onSave}>
          <span>3</span><div><strong>음악 저장하기</strong><small>MP3 · 막대나 악보로 MP4 저장</small></div>
        </button>
      </div>
      <a className="practice-share-stage" href={PRACTICE_SHARE_URL} target="_blank" rel="noopener noreferrer"
        aria-label="4 음악 공유하기: 샘보드 새 창 열기">
        <span>4</span><div><strong>음악 공유하기 <ExternalLink size={14} aria-hidden="true" /></strong><small>저장한 음악을 샘보드에 올리기</small></div>
      </a>
    </nav>
  );
}

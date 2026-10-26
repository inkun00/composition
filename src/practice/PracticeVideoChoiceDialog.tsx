import { useId } from "react";
import { createPortal } from "react-dom";
import { Music2, Type, X } from "../components/AppArtworkIcons";
import { useDialogFocus } from "../hooks/useDialogFocus";
import type { PracticeDraft } from "./practiceStorage";
import type { PracticeVideoMode } from "./practiceVideoTypes";
import "./PracticeVideoChoiceDialog.css";

type PracticeVideoChoiceDialogProps = {
  draft: PracticeDraft;
  step: "rhythm" | "melody";
  mode: PracticeVideoMode;
  disabled?: boolean;
  onConfirm: (mode: PracticeVideoMode) => void;
  onClose: () => void;
};

export default function PracticeVideoChoiceDialog({ draft, step, mode, disabled = false,
  onConfirm, onClose }: PracticeVideoChoiceDialogProps) {
  const dialogRef = useDialogFocus();
  const id = useId();
  const musicLabel = step === "rhythm" ? "리듬" : "가락";
  const scores = step === "melody" ? [draft.measures]
    : [draft.measures, ...draft.rhythmLayers.map((layer) => layer.measures)];
  const firstLyric = scores.flatMap((measures) => measures.map((measure) => measure.lyric.trim())).find(Boolean);
  const screenLabel = mode === "score" ? "악보" : "막대";

  return createPortal(
    <div ref={dialogRef} className="practice-video-choice-overlay"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}>
      <section className="practice-video-choice-dialog" role="dialog" aria-modal="true" tabIndex={-1}
        aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}>
        <header>
          <h2 id={`${id}-title`}>음악 영상 화면 선택</h2>
          <button type="button" className="practice-video-choice-close" aria-label="음악 영상 선택 닫기" onClick={onClose}>
            <X size={22} aria-hidden="true" />
          </button>
        </header>
        <p id={`${id}-description`}>두 영상 모두 만든 {musicLabel} 소리와 가사를 재생해요. 영상에 보여 줄 화면을 골라 주세요.</p>
        <div className="practice-video-choice-options">
          <button type="button" className="practice-video-choice-option" aria-label="가사만 재생"
            disabled={disabled || !firstLyric} aria-describedby={!firstLyric ? `${id}-no-lyrics` : undefined}
            onClick={() => onConfirm("lyrics")}>
            <span className="practice-video-choice-lyrics-sample" aria-hidden="true">{firstLyric || "가사를 넣어 주세요"}</span>
            <strong><Type size={19} aria-hidden="true" /> 가사만 재생</strong>
            <span>검은 화면에 흰색 가사</span>
          </button>
          <button type="button" className="practice-video-choice-option" aria-label={`${musicLabel}과 함께 재생`}
            disabled={disabled} onClick={() => onConfirm(mode)}>
            <span className="practice-video-choice-music-sample" aria-hidden="true"><Music2 size={43} />{screenLabel} 화면 + 가사</span>
            <strong><Music2 size={19} aria-hidden="true" /> {musicLabel}과 함께 재생</strong>
            <span>선택한 {screenLabel} 화면에 음악과 가사</span>
          </button>
        </div>
        {!firstLyric && <p className="practice-video-choice-help" id={`${id}-no-lyrics`}>
          가사만 재생하려면 먼저 가사를 입력해 주세요. {musicLabel} 화면 영상은 그대로 저장할 수 있어요.
        </p>}
        <footer><button type="button" className="practice-video-choice-cancel" onClick={onClose}>취소</button></footer>
      </section>
    </div>, document.body
  );
}

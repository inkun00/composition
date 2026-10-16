import { useEffect, useState } from "react";
import type { KaraokeGuideMode } from "../audio/karaokeGuide";
import type { RecordingCaptureMode } from "../audio/vocalCapture";
import RecordingGuideSelector from "./RecordingGuideSelector";
import "./RecordingGuideDialog.css";
import { useDialogFocus } from "../hooks/useDialogFocus";

type Props = Readonly<{
  value: KaraokeGuideMode;
  onChange: (mode: KaraokeGuideMode) => void;
  onCancel: () => void;
  onStart: (recordingMode: RecordingCaptureMode, guideMode: KaraokeGuideMode) => void;
}>;

export default function RecordingGuideDialog({ value, onChange, onCancel, onStart }: Props) {
  const dialogRef = useDialogFocus<HTMLElement>();
  const [step, setStep] = useState<"mode" | RecordingCaptureMode>("mode");
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onCancel]);

  return (
    <div className="recording-guide-overlay" role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <section ref={dialogRef} tabIndex={-1} className="recording-guide-dialog" role="dialog" aria-modal="true"
        aria-labelledby="recording-guide-title">
        <header>
          <span>🎤 노래 녹음 준비</span>
          <h2 id="recording-guide-title">
            {step === "mode" ? "누가 함께 녹음하나요?"
              : step === "personal" ? "어떤 도움을 들으며 부를까요?" : "합창 녹음을 준비해요"}
          </h2>
        </header>
        {step === "mode" && (
          <div className="recording-mode-options" aria-label="녹음 방법 선택">
            <button type="button" onClick={() => setStep("personal")}>
              <span>🎧</span><strong>개인 녹음</strong>
              <small>이어폰을 끼고 한 명이 노래해요</small>
            </button>
            <button type="button" onClick={() => setStep("choir")}>
              <span>👥</span><strong>합창 녹음</strong>
              <small>스피커 반주를 들으며 함께 불러요</small>
            </button>
          </div>
        )}
        {step === "personal" && <RecordingGuideSelector value={value} onChange={onChange} />}
        {step === "choir" && (
          <div className="choir-recording-guide">
            <div><span>🔊</span><strong>스피커는 학생 쪽으로</strong><small>마이크와 떨어뜨려 주세요.</small></div>
            <div><span>🎙️</span><strong>마이크는 합창단 앞 가운데에</strong></div>
            <div><span>🎵</span><strong>가락 도움은 자동으로 꺼져요</strong></div>
          </div>
        )}
        <footer>
          <button type="button" className="recording-guide-cancel" onClick={onCancel}>취소</button>
          {step !== "mode" && (
            <button type="button" className="recording-guide-back" onClick={() => setStep("mode")}>이전</button>
          )}
          {step === "personal" && (
            <button type="button" className="recording-guide-start" onClick={() => onStart("personal", value)}>
              개인 녹음 시작
            </button>
          )}
          {step === "choir" && (
            <button type="button" className="recording-guide-start" onClick={() => onStart("choir", "off")}>
              합창 녹음 시작
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}

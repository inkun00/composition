import { useEffect, useState } from "react";
import type { KaraokeGuideMode } from "../audio/karaokeGuide";
import type { RecordingCaptureMode } from "../audio/vocalCapture";
import RecordingGuideSelector from "./RecordingGuideSelector";
import "./RecordingGuideDialog.css";

type Props = Readonly<{
  value: KaraokeGuideMode;
  onChange: (mode: KaraokeGuideMode) => void;
  onCancel: () => void;
  onStart: (recordingMode: RecordingCaptureMode, guideMode: KaraokeGuideMode) => void;
}>;

export default function RecordingGuideDialog({ value, onChange, onCancel, onStart }: Props) {
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
      <section className="recording-guide-dialog" role="dialog" aria-modal="true"
        aria-labelledby="recording-guide-title">
        <header>
          <span>🎤 노래 녹음 준비</span>
          <h2 id="recording-guide-title">
            {step === "mode" ? "누가 함께 녹음하나요?"
              : step === "personal" ? "어떤 도움을 들으며 부를까요?" : "합창 녹음을 준비해요"}
          </h2>
          <p>{step === "mode" ? "녹음하는 사람과 듣는 방법에 맞춰 소리를 다르게 담아요."
            : step === "personal" ? "이어폰으로 반주를 들으며 가락 도움을 골라요."
              : "스피커 반주를 들으며 여러 사람의 목소리를 함께 담아요."}</p>
        </header>
        {step === "mode" && (
          <div className="recording-mode-options" aria-label="녹음 방법 선택">
            <button type="button" onClick={() => setStep("personal")}>
              <span>🎧</span><strong>개인 녹음</strong>
              <small>이어폰을 끼고 한 명이 노래해요</small>
              <em>가락 도움을 선택할 수 있어요</em>
            </button>
            <button type="button" onClick={() => setStep("choir")}>
              <span>👥</span><strong>합창 녹음</strong>
              <small>스피커 반주를 들으며 함께 불러요</small>
              <em>여러 목소리가 잘 들리게 녹음해요</em>
            </button>
          </div>
        )}
        {step === "personal" && <RecordingGuideSelector value={value} onChange={onChange} />}
        {step === "choir" && (
          <div className="choir-recording-guide">
            <div><span>🔊</span><strong>스피커는 학생 쪽으로</strong><small>마이크 바로 옆은 피해주세요.</small></div>
            <div><span>🎙️</span><strong>마이크는 합창단 앞 가운데에</strong><small>모두의 목소리가 비슷하게 들려요.</small></div>
            <div><span>🎵</span><strong>가락 도움은 자동으로 꺼져요</strong><small>반주만 나오고 합창 목소리를 넓게 담아요.</small></div>
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

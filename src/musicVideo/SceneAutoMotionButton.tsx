import { useId } from "react";
import StudioArtwork from "./StudioArtwork";
import "./SceneAutoMotions.css";

type Props = Readonly<{
  disabled: boolean;
  reason?: string;
  onApply: () => void;
}>;

export default function SceneAutoMotionButton({ disabled, reason, onApply }: Props) {
  const hintId = useId();
  const hint = reason?.trim() || "음악의 박자·가락을 보고 모든 장면의 기존 동작을 바꿔요. 실행 취소로 되돌릴 수 있어요.";

  return <div className="mv-auto-motion-control">
    <button type="button" className="mv-auto-motion-button" data-testid="scene-auto-motions"
      aria-label="전체 장면 자동 모션" aria-describedby={hintId} title={hint}
      disabled={disabled} onClick={onApply}>
      <StudioArtwork name="sparkles" size={23} />
      <span className="mv-auto-motion-label-full" aria-hidden="true">전체 장면 자동 모션</span>
      <span className="mv-auto-motion-label-compact" aria-hidden="true">자동 모션</span>
    </button>
    <span id={hintId} className="mv-auto-motion-hint" data-testid="scene-auto-motions-hint">{hint}</span>
  </div>;
}

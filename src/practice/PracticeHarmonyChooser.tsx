import { getAvailablePracticeChords } from "./practiceHarmony";
import "./PracticeHarmonyChooser.css";

type PracticeHarmonyChooserProps = {
  chord: string;
  previousChord?: string;
  index: number;
  disabled: boolean;
  onChange: (chord: string) => void;
  onPreview: () => void;
  previewActive?: boolean;
  previewPreparing?: boolean;
};

export default function PracticeHarmonyChooser({
  chord, previousChord, index, disabled, onChange, onPreview, previewActive = false, previewPreparing = false
}: PracticeHarmonyChooserProps) {
  const options = getAvailablePracticeChords(previousChord);

  return (
    <div className="practice-harmony-chooser">
      <label>화음
        <select aria-label={`${index + 1}마디 가락 연습 화음`} disabled={disabled} value={chord}
          aria-description={previousChord ? `이전 화음 ${previousChord}의 연결 후보` : "첫 화음 선택"}
          onChange={(event) => onChange(event.target.value)}>
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <button type="button" className="practice-harmony-preview" onClick={onPreview}
        disabled={disabled && !previewActive} aria-pressed={previewActive}
        aria-label={`${index + 1}마디 ${chord} 화음 ${previewActive ? previewPreparing ? "준비 취소" : "멈추기" : "듣기"}`}
        title="연습용 화음 듣기 · 저장 파일에는 포함되지 않아요">
        {previewActive ? <Square size={16} aria-hidden="true" /> : <Volume2 size={17} aria-hidden="true" />}
        {previewActive ? previewPreparing ? "준비 취소" : "멈추기" : "화음 듣기"}
      </button>
    </div>
  );
}
import { Square, Volume2 } from "lucide-react";

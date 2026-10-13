import { getAvailablePracticeChords } from "./practiceHarmony";
import "./PracticeHarmonyChooser.css";

type PracticeHarmonyChooserProps = {
  chord: string;
  previousChord?: string;
  index: number;
  disabled: boolean;
  onChange: (chord: string) => void;
};

export default function PracticeHarmonyChooser({
  chord, previousChord, index, disabled, onChange
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
    </div>
  );
}

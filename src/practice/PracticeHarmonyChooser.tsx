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
  const selected = options.find((option) => option.value === chord);
  const helpId = `practice-harmony-help-${index}`;
  const descriptionId = `practice-harmony-description-${index}`;

  return (
    <div className="practice-harmony-chooser">
      <label>어울리는 화음
        <select aria-label={`${index + 1}마디 가락 연습 화음`} disabled={disabled} value={chord}
          aria-describedby={`${helpId} ${descriptionId}`} onChange={(event) => onChange(event.target.value)}>
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <p className="practice-harmony-connection" id={helpId}>
        {previousChord
          ? `${index}마디의 ${previousChord} 화음에 자연스럽게 이어지는 화음만 보여요.`
          : "첫 화음은 자유롭게 골라요. 다음 마디부터 어울리는 화음만 보여 드려요."}
      </p>
      <p className="practice-harmony-description" id={descriptionId}>{selected?.description}</p>
    </div>
  );
}

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
          ? `${index}마디의 ${previousChord} 화음 뒤에 자주 쓰는 화음 연결 후보예요. 가락과 함께 들어 보세요.`
          : "첫 화음은 자유롭게 골라요. 다음 마디부터 자주 쓰는 화음 연결 후보를 보여 드려요."}
      </p>
      <p className="practice-harmony-description" id={descriptionId}>{selected?.description}</p>
    </div>
  );
}

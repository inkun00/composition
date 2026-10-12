import { BEAT_INSTRUMENTS } from "../music/beatInstruments";
import { INSTRUMENTS } from "../music/instruments";

type PracticeRhythmInstrumentProps = {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (instrumentId: string) => void;
};

export default function PracticeRhythmInstrument({ label, value, disabled, onChange }: PracticeRhythmInstrumentProps) {
  return (
    <label>리듬 악기
      <select aria-label={label} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        <optgroup label="타악기">
          {BEAT_INSTRUMENTS.map((instrument) => (
            <option key={instrument.id} value={`beat:${instrument.id}`}>{instrument.name}</option>
          ))}
        </optgroup>
        <optgroup label="음높이가 있는 악기">
          {INSTRUMENTS.map((instrument) => (
            <option key={instrument.id} value={instrument.id}>{instrument.name}</option>
          ))}
        </optgroup>
      </select>
    </label>
  );
}

import { INSTRUMENTS, type InstrumentId } from "../music/instruments";
import ComposerChildArtwork from "./ComposerChildArtwork";

const QUICK_INSTRUMENTS = INSTRUMENTS.slice(0, 12);
const MORE_INSTRUMENTS = INSTRUMENTS.slice(12);

export default function ComposerInstrumentPicker({ value, onChange, context = "measure" }: Readonly<{
  value: InstrumentId;
  onChange: (id: InstrumentId) => void;
  context?: "measure" | "candidate";
}>) {
  const prefix = context === "candidate" ? "candidate-" : "";
  return <div className={`preview-instrument-picker ${context}-instrument-picker`} aria-label="가락 미리듣기 악기 선택">
    <div className="preview-instrument-intro">
      <div className="preview-instrument-copy"><strong>가락 악기</strong></div>
    </div>
    <div className="preview-instrument-options">
      {QUICK_INSTRUMENTS.map((instrument) => (
        <button key={instrument.id} type="button" data-testid={`${prefix}preview-instrument-${instrument.id}`}
          className={value === instrument.id ? "active" : ""} aria-pressed={value === instrument.id}
          onClick={() => onChange(instrument.id)}>
          <span>{instrument.icon}</span><strong>{instrument.name}</strong>
        </button>
      ))}
      <label className="preview-instrument-more">
        <span>더 많은 악기</span>
        <select data-testid={`${prefix}preview-instrument-more-select`} aria-label="더 많은 악기 중에서 선택"
          value={MORE_INSTRUMENTS.some((instrument) => instrument.id === value) ? value : ""}
          onChange={(event) => event.target.value && onChange(event.target.value as InstrumentId)}>
          <option value="">악기를 골라 보세요.</option>
          {MORE_INSTRUMENTS.map((instrument) => (
            <option key={instrument.id} value={instrument.id}>{instrument.icon} {instrument.name}</option>
          ))}
        </select>
      </label>
    </div>
    {context === "measure" && <ComposerChildArtwork kind="keyboard" />}
  </div>;
}

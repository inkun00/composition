import { findInstrument, INSTRUMENTS, type InstrumentId } from "../music/instruments";
import { Music2 } from "./AppArtworkIcons";

type ComposerInstrumentLibraryProps = Readonly<{
  value: InstrumentId;
  onChange: (id: InstrumentId) => void;
}>;

export default function ComposerInstrumentLibrary({ value, onChange }: ComposerInstrumentLibraryProps) {
  const selectedInstrument = findInstrument(value);

  return (
    <details className="workspace-disclosure composer-instrument-library">
      <summary>
        <span><Music2 size={18} aria-hidden="true" /><strong>가락 악기</strong></span>
        <small>{selectedInstrument.name}</small>
      </summary>
      <div className="instrument-grid" aria-label="악기 선택">
        {INSTRUMENTS.map((instrument) => (
          <button
            key={instrument.id}
            type="button"
            data-testid={`instrument-${instrument.id}`}
            className={value === instrument.id ? "instrument-card active" : "instrument-card"}
            aria-pressed={value === instrument.id}
            onClick={() => onChange(instrument.id)}
          >
            <span className="instrument-icon">{instrument.icon}</span>
            <span><strong>{instrument.name}</strong></span>
          </button>
        ))}
      </div>
    </details>
  );
}

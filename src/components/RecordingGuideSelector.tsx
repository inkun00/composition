import type { KaraokeGuideMode } from "../audio/karaokeGuide";
import { Headphones, Mic2, Music2, type LucideIcon } from "./AppArtworkIcons";
import "./RecordingGuideSelector.css";

type Props = Readonly<{
  value: KaraokeGuideMode;
  disabled?: boolean;
  onChange: (mode: KaraokeGuideMode) => void;
}>;

const OPTIONS: readonly Readonly<{ id: KaraokeGuideMode; Icon: LucideIcon; label: string }>[] = [
  { id: "first-note", Icon: Headphones, label: "마디 첫 음" },
  { id: "off", Icon: Mic2, label: "도움 없이" },
  { id: "soft", Icon: Music2, label: "가락 작게" }
];

export default function RecordingGuideSelector({ value, disabled, onChange }: Props) {
  return (
    <section className="recording-guide-selector" aria-label="노래 녹음 가락 도움">
      <div>
        <strong>녹음할 때 가락 도움</strong>
        <small>가락 도움은 녹음에 포함되지 않아요.</small>
      </div>
      <div className="recording-guide-options" role="group" aria-label="가락 도움 선택">
        {OPTIONS.map((option) => (
          <button key={option.id} type="button" disabled={disabled}
            className={value === option.id ? "selected" : ""}
            aria-pressed={value === option.id} onClick={() => onChange(option.id)}>
            <span><option.Icon size={22} /></span>{option.label}
          </button>
        ))}
      </div>
    </section>
  );
}

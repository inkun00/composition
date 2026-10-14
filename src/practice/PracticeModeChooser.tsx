import { ArrowRight, Drum, Layers3, Music2 } from "lucide-react";
import { PRACTICE_CREATION_MODES, type PracticeCreationMode } from "./practiceCreationMode";
import "./PracticeModeChooser.css";

type PracticeModeChooserProps = {
  currentMode: PracticeCreationMode | null;
  onSelect: (mode: PracticeCreationMode) => void;
};

const modeIcons = { rhythm: Drum, "rhythm-melody": Layers3, melody: Music2 };

export default function PracticeModeChooser({ currentMode, onSelect }: PracticeModeChooserProps) {
  return (
    <section className="practice-mode-chooser" aria-labelledby="practice-mode-choice-title">
      <h2 id="practice-mode-choice-title">어떻게 만들까요?</h2>
      <p>하고 싶은 활동을 골라 시작해 보세요.</p>
      <div className="practice-mode-choices">
        {PRACTICE_CREATION_MODES.map((mode) => {
          const Icon = modeIcons[mode.id];
          return (
            <button type="button" key={mode.id} className={`practice-mode-choice is-${mode.id}`}
              aria-label={mode.label} aria-pressed={currentMode === mode.id}
              onClick={() => onSelect(mode.id)}>
              <span className="practice-mode-choice-icon"><Icon size={30} aria-hidden="true" /></span>
              <strong>{mode.label}</strong>
              <span>{mode.description}</span>
              <span className="practice-mode-choice-start">시작하기 <ArrowRight size={17} aria-hidden="true" /></span>
            </button>
          );
        })}
      </div>
      {currentMode && <p className="practice-mode-preserve">모드를 바꿔도 만든 음표와 가사는 그대로 남아요.</p>}
    </section>
  );
}

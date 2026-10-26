import { ArrowRight, Check, Drum, Heart, Layers3, Music2, Sparkles, X } from "../components/AppArtworkIcons";
import type { RefObject } from "react";
import { publicAssetUrl } from "../platform/portable";
import { PRACTICE_CREATION_MODES, type PracticeCreationMode } from "./practiceCreationMode";
import { usePracticeModeDialog } from "./usePracticeModeDialog";
import "./PracticeModeChooser.css";
import "../components/AppExperienceArtwork.css";

type PracticeModeChooserProps = {
  currentMode: PracticeCreationMode | null;
  onSelect: (mode: PracticeCreationMode) => void;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLButtonElement | null>;
};

const modeIcons = { rhythm: Drum, "rhythm-melody": Layers3, melody: Music2 };
const modeArtwork: Record<PracticeCreationMode, string> = {
  rhythm: "/illustrations/character-rhythm-shaker-girl-v1.webp",
  "rhythm-melody": "/illustrations/backing-export-mixing-girl-v2.webp",
  melody: "/illustrations/character-instrument-keyboard-boy-v1.webp"
};

export default function PracticeModeChooser({ currentMode, onSelect, onClose, returnFocusRef }: PracticeModeChooserProps) {
  const dialogRef = usePracticeModeDialog(onClose, returnFocusRef);
  return (
    <div className="practice-mode-overlay" role="presentation" onClick={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section ref={dialogRef} className="practice-mode-chooser" role="dialog" aria-modal="true"
        aria-labelledby="practice-mode-choice-title" aria-describedby="practice-mode-choice-help">
        <button type="button" className="practice-mode-close" aria-label="모드 선택 창 닫기" onClick={onClose}>
          <X size={21} aria-hidden="true" />
        </button>
        <header className="practice-mode-hero">
          <img className="practice-mode-hero-art" src={publicAssetUrl("/illustrations/opening-studio-desktop-v2.webp")}
            alt="" aria-hidden="true" width={1600} height={900} />
          <div className="practice-mode-hero-copy">
            <span className="practice-mode-eyebrow"><Music2 size={16} aria-hidden="true" /> 마음멜로디 음악 놀이터</span>
            <h2 id="practice-mode-choice-title">어떻게 만들까요?</h2>
            <p id="practice-mode-choice-help">마음에 드는 활동을 골라 나만의 음악을 시작해요.</p>
          </div>
        </header>
        <div className="practice-mode-choices">
          {PRACTICE_CREATION_MODES.map((mode) => {
            const Icon = modeIcons[mode.id];
            const selected = currentMode === mode.id;
            return (
              <button type="button" key={mode.id} className={`practice-mode-choice is-${mode.id}`}
                aria-label={mode.label} aria-pressed={selected}
                onClick={() => onSelect(mode.id)}>
                <span className="practice-mode-choice-art" aria-hidden="true">
                  <span className="practice-mode-art-orbit" />
                  <img className="practice-mode-character" src={publicAssetUrl(modeArtwork[mode.id])}
                    alt="" width={500} height={750} />
                  <span className="practice-mode-art-note"><Music2 size={23} /></span>
                  <span className="practice-mode-art-spark"><Sparkles size={20} /></span>
                </span>
                {selected && <span className="practice-mode-selected"><Check size={13} aria-hidden="true" /> 선택 중</span>}
                <span className="practice-mode-choice-copy">
                  <span className="practice-mode-choice-heading">
                    <span className="practice-mode-choice-mark"><Icon size={19} aria-hidden="true" /></span>
                    <strong>{mode.label}</strong>
                  </span>
                  <span className="practice-mode-choice-description">{mode.description}</span>
                  <span className="practice-mode-choice-start">시작하기 <ArrowRight size={17} aria-hidden="true" /></span>
                </span>
              </button>
            );
          })}
        </div>
        <footer className="practice-mode-footer">
          <Heart size={15} aria-hidden="true" />
          <p className="practice-mode-preserve">{currentMode
            ? "모드를 바꿔도 만든 음표와 가사는 그대로 남아요."
            : "정답은 없어요. 내 마음에 드는 소리를 만들어 봐요!"}</p>
        </footer>
      </section>
    </div>
  );
}

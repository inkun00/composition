import { ArrowRight, Music2 } from "lucide-react";
import OpeningExperimentArt from "./OpeningExperimentArt";

type OpeningScreenProps = {
  hasDraft: boolean;
  onStart: () => void;
  onContinue: () => void;
  onPractice: () => void;
};

export default function OpeningScreen({ hasDraft, onStart, onContinue, onPractice }: OpeningScreenProps) {
  return (
    <section className="opening-screen" aria-label="마음멜로디 시작 화면">
      <header className="lab-opening-header">
        <Music2 size={26} aria-hidden="true" />
        <h1>마음멜로디</h1>
      </header>
      <div className="lab-experiments">
        <button type="button" className="lab-experiment lab-experiment-compose" onClick={onStart}>
          <OpeningExperimentArt kind="compose" />
          <span className="lab-experiment-label"><strong>시작하기</strong><ArrowRight size={22} aria-hidden="true" /></span>
        </button>
        <button type="button" className="lab-experiment lab-experiment-resume" disabled={!hasDraft} onClick={onContinue}>
          <OpeningExperimentArt kind="resume" />
          <span className="lab-experiment-label"><strong>이어하기</strong><ArrowRight size={22} aria-hidden="true" /></span>
        </button>
        <button type="button" className="lab-experiment lab-experiment-practice" onClick={onPractice}>
          <OpeningExperimentArt kind="practice" />
          <span className="lab-experiment-label"><strong>기능 연습하기</strong><ArrowRight size={22} aria-hidden="true" /></span>
        </button>
      </div>
    </section>
  );
}

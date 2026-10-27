import type { MeasureDraft } from "../music/composerDraft";
import type { Meter } from "../music/meter";
import ScoreMeasure from "./ScoreMeasure";

type ComposerMeasureNavigatorProps = Readonly<{
  measures: readonly MeasureDraft[];
  activeIndex: number;
  playingIndex: number | null;
  onSelect: (index: number) => void;
  meter?: Meter;
}>;

export default function ComposerMeasureNavigator({
  measures, activeIndex, playingIndex, onSelect, meter = { beats: 4, beatUnit: 4 }
}: ComposerMeasureNavigatorProps) {
  const completedCount = measures.filter((measure) => measure.notes !== null).length;

  return (
    <nav className="composer-measure-nav" aria-label="마디 고르기">
      <div className="composer-measure-nav-header">
        <h3>마디 고르기</h3>
        <span>{completedCount}/{measures.length} 완료</span>
      </div>
      <div className="composer-measure-nav-buttons">
        {measures.map((measure, index) => {
          const completed = measure.notes !== null;
          const active = activeIndex === index;
          return (
            <button
              key={index}
              type="button"
              className={`composer-measure-nav-item${active ? " active" : ""}${completed ? " is-complete" : ""}`}
              aria-label={`${index + 1}마디 선택, 가락 선택 ${completed ? "완료" : "전"}`}
              aria-pressed={active}
              data-playing={playingIndex === index}
              data-testid={`select-measure-${index + 1}`}
              onClick={() => onSelect(index)}
            >
              <span className="composer-measure-nav-label">
                <span className="composer-measure-nav-number">{index + 1}</span>
                <span className="composer-measure-nav-status" aria-hidden="true">{completed ? "✓" : "·"}</span>
              </span>
              <span className="composer-measure-nav-score" aria-hidden="true">
                {measure.notes
                  ? <ScoreMeasure notes={measure.notes} meter={meter} keyFifths={measure.keyFifths}
                      compact showSignature={false} />
                  : <span className="composer-measure-nav-empty">가락 고르기 전</span>}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

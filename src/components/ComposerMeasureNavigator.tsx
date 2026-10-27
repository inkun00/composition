import type { MeasureDraft } from "../music/composerDraft";

type ComposerMeasureNavigatorProps = Readonly<{
  measures: readonly MeasureDraft[];
  activeIndex: number;
  playingIndex: number | null;
  onSelect: (index: number) => void;
}>;

export default function ComposerMeasureNavigator({
  measures, activeIndex, playingIndex, onSelect
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
              <span className="composer-measure-nav-number">{index + 1}</span>
              <span className="composer-measure-nav-status" aria-hidden="true">{completed ? "✓" : "·"}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

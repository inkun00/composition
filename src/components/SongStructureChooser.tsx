import { useState } from "react";
import { availableSongStructures, songStructurePlan, type SongStructureId } from "../music/songStructure";

type Props = Readonly<{
  length: number;
  selectedId: SongStructureId | null;
  onSelect: (id: SongStructureId | null) => void;
}>;

export default function SongStructureChooser({ length, selectedId, onSelect }: Props) {
  const [showMore, setShowMore] = useState(false);
  const structures = availableSongStructures(length);
  const selectedInMore = selectedId !== null && !structures.slice(0, 3).some((item) => item.id === selectedId);
  const expanded = showMore || selectedInMore;
  return <section className="song-structure-chooser" aria-labelledby="structure-heading">
    <div className="compact-heading">
      <span className="number-badge">5</span>
      <div>
        <h2 id="structure-heading">노래 모양을 골라요 <small>선택 사항</small></h2>
        <p>먼저 노래의 흐름을 정해도 좋고, 고르지 않고 바로 만들어도 좋아요.</p>
      </div>
    </div>
    <div className="song-structure-options">
      <button type="button" className={`song-structure-option${selectedId === null ? " active" : ""}`}
        aria-pressed={selectedId === null} onClick={() => onSelect(null)} data-testid="structure-free">
        <strong>자유롭게 만들기</strong>
        <span>정해진 모양 없이 내 마음대로 만들어요.</span>
      </button>
      {(expanded ? structures : structures.slice(0, 3)).map((structure) => (
        <button type="button" key={structure.id} data-testid={`structure-${structure.id}`}
          className={`song-structure-option${selectedId === structure.id ? " active" : ""}`}
          aria-pressed={selectedId === structure.id} onClick={() => onSelect(structure.id)}>
          <strong>{structure.title}</strong>
          <span>{structure.description}</span>
          <small>{structure.pattern}</small>
        </button>
      ))}
    </div>
    {structures.length > 3 && !selectedInMore && <button type="button" className="song-structure-more"
      onClick={() => setShowMore((value) => !value)}>
      {showMore ? "다른 모양 접기" : `다른 모양 보기 +${structures.length - 3}`}
    </button>}
    {selectedId && <p className="song-structure-help" role="status">
      {songStructurePlan(selectedId, length)?.blocks.some((block) => block.reuse !== "new")
        ? "앞부분의 가락을 고르면 다시 나오는 부분은 자동으로 채워져요. 언제든 직접 바꿀 수 있어요."
        : "각 부분에 새로운 가락을 골라 보세요. 언제든 다른 가락으로 바꿀 수 있어요."}
    </p>}
  </section>;
}

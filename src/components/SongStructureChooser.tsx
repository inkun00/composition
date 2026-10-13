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
        <h2 id="structure-heading">노래 구조 <small>선택 사항</small></h2>
      </div>
    </div>
    <div className="song-structure-options">
      <button type="button" className={`song-structure-option${selectedId === null ? " active" : ""}`}
        aria-pressed={selectedId === null} onClick={() => onSelect(null)} data-testid="structure-free">
        <strong>자유롭게 만들기</strong>
      </button>
      {(expanded ? structures : structures.slice(0, 3)).map((structure) => (
        <button type="button" key={structure.id} data-testid={`structure-${structure.id}`}
          className={`song-structure-option${selectedId === structure.id ? " active" : ""}`}
          aria-pressed={selectedId === structure.id} onClick={() => onSelect(structure.id)}>
          <strong>{structure.title}</strong>
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
        ? "반복 부분은 자동으로 채워져요. 직접 수정할 수 있어요."
        : "각 부분에 새 가락을 넣어요."}
    </p>}
  </section>;
}

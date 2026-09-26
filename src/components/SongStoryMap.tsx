import type { SongStructurePlan } from "../music/songStructure";

type Props = Readonly<{
  plan: SongStructurePlan;
  activeIndex: number;
  completed: readonly boolean[];
  onSelect: (index: number) => void;
}>;

export default function SongStoryMap({ plan, activeIndex, completed, onSelect }: Props) {
  return <nav className="song-story-map" aria-label="선택한 노래 모양">
    {plan.blocks.map((block) => (
      <button key={block.start} type="button"
        className={`song-story-part${activeIndex >= block.start && activeIndex < block.start + block.bars ? " active" : ""}`}
        style={{ flexGrow: block.bars }}
        aria-current={activeIndex >= block.start && activeIndex < block.start + block.bars ? "step" : undefined}
        onClick={() => onSelect(block.start)}>
        <strong>{block.label}</strong>
        <span>{block.start + 1}~{block.start + block.bars}마디 · {
          completed.slice(block.start, block.start + block.bars).filter(Boolean).length}/{block.bars}</span>
      </button>
    ))}
  </nav>;
}

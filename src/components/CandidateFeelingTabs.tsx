import { MELODY_FEELING_GROUPS, type MelodyFeelingId } from "../music/melodyFeelings";

type FeelingTab = typeof MELODY_FEELING_GROUPS[number] & { count: number };

type Props = {
  groups: readonly FeelingTab[];
  activeId: MelodyFeelingId;
  onChange: (id: MelodyFeelingId) => void;
};

export default function CandidateFeelingTabs({ groups, activeId, onChange }: Props) {
  const active = groups.find((group) => group.id === activeId) ?? groups[0];

  function moveFocus(currentIndex: number, direction: number) {
    const next = groups[(currentIndex + direction + groups.length) % groups.length];
    onChange(next.id);
    document.getElementById(`melody-feeling-${next.id}`)?.focus();
  }

  return (
    <div className="candidate-feeling-selector">
      <div className="candidate-feeling-tabs" role="tablist" aria-label="가락 느낌 고르기">
        {groups.map((group, index) => (
          <button key={group.id} id={`melody-feeling-${group.id}`} type="button"
            role="tab" aria-selected={active.id === group.id}
            aria-controls="melody-feeling-panel" tabIndex={active.id === group.id ? 0 : -1}
            className={active.id === group.id ? "active" : ""}
            onClick={() => onChange(group.id)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") { event.preventDefault(); moveFocus(index, 1); }
              if (event.key === "ArrowLeft") { event.preventDefault(); moveFocus(index, -1); }
            }}>
            {group.label}<span>{group.count}</span>
          </button>
        ))}
      </div>
      <p>{active.description}</p>
    </div>
  );
}

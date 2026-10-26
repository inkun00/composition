import type { CSSProperties } from "react";
import { toNumber } from "../music/rational";
import type { PositionedNote } from "../music/score";

export function beatText(beats: number): string {
  return Number.isInteger(beats) ? String(beats) : beats.toFixed(2).replace(/0$/, "");
}

export function positionStyle(note: PositionedNote, slots: number, slotsPerBeat: number): CSSProperties {
  return {
    left: `${note.onset * slotsPerBeat / slots * 100}%`,
    width: `${toNumber(note.duration) * slotsPerBeat / slots * 100}%`
  };
}

export function TimelineBase({ slots, capacity, slotsPerBeat }: {
  slots: number;
  capacity: number;
  slotsPerBeat: number;
}) {
  return (
    <div className="practice-timeline-base" aria-hidden="true"
      style={{ gridTemplateColumns: `repeat(${slots}, minmax(0, 1fr))` }}>
      {Array.from({ length: slots }, (_, index) => (
        <span key={index} className={[
          "practice-half-beat",
          index % slotsPerBeat === 0 ? "practice-beat-start" : "",
          index / slotsPerBeat >= capacity ? "practice-overflow-slot" : ""
        ].filter(Boolean).join(" ")} />
      ))}
      <span className="practice-capacity-line" style={{ left: `${capacity * slotsPerBeat / slots * 100}%` }} />
    </div>
  );
}

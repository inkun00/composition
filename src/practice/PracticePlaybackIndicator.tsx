import { Volume2 } from "../components/AppArtworkIcons";
import { toNumber } from "../music/rational";
import { positionNotes } from "../music/score";
import type { NoteEvent } from "../music/types";
import "./PracticePlaybackIndicator.css";

type PracticePlaybackIndicatorProps = {
  notes: readonly NoteEvent[];
  playingNoteId: string | null;
  active: boolean;
  preparing?: boolean;
};

function beatLabel(beats: number): string {
  return Number.isInteger(beats) ? String(beats) : beats.toFixed(2).replace(/0$/, "");
}

export default function PracticePlaybackIndicator({
  notes, playingNoteId, active, preparing = false
}: PracticePlaybackIndicatorProps) {
  if (!active) return null;

  const positioned = positionNotes(notes);
  const index = positioned.findIndex((note) => note.id === playingNoteId);
  const note = positioned[index];

  return (
    <p className="practice-playback-indicator">
      <Volume2 className="practice-playback-indicator-icon" size={17} aria-hidden="true" />
      <span>
        {preparing ? "연주 준비 중" : note
          ? `재생 중 · ${index + 1}번째 ${note.pitch === null ? "쉼표" : "음표"} · ${beatLabel(note.onset + 1)}박부터 ${beatLabel(toNumber(note.duration))}박`
          : "재생 중 · 표시된 칸을 따라 들어 보세요"}
      </span>
    </p>
  );
}

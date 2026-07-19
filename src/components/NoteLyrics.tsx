import { measureCapacity, type Meter } from "../music/meter";
import { positionNotes } from "../music/score";
import { toNumber } from "../music/rational";
import { scoreLayout } from "../music/scoreLayout";
import type { NoteEvent } from "../music/types";

type NoteLyricsProps = Readonly<{
  notes: readonly NoteEvent[];
  meter: Meter;
  measureIndex: number;
  compact?: boolean;
  wide?: boolean;
  showSignature?: boolean;
  playingNoteId?: string | null;
  selectedNoteId?: string | null;
  notePositions?: Record<string, { x: number; y: number }>;
  readOnly?: boolean;
  onChange: (noteId: string, value: string) => void;
  onFocusNote?: (noteId: string) => void;
}>;

export default function NoteLyrics({
  notes,
  meter,
  measureIndex,
  compact = false,
  wide = false,
  showSignature = true,
  playingNoteId = null,
  selectedNoteId = null,
  notePositions,
  readOnly = false,
  onChange,
  onFocusNote
}: NoteLyricsProps) {
  const capacity = toNumber(measureCapacity(meter));
  const { width, noteStartX } = scoreLayout({ compact, wide, showSignature });
  const pitched = positionNotes(notes).filter((note) => note.pitch !== null);

  return (
    <div className={compact ? "note-lyrics compact" : "note-lyrics"}
      aria-label={`${measureIndex + 1}마디 음표별 가사`}>
      {pitched.map((note, noteIndex) => {
        const usable = width - noteStartX - 8;
        const x = notePositions?.[note.id]?.x ?? noteStartX + (note.onset / capacity) * usable + 10;
        const durationWidth = toNumber(note.duration) / capacity * usable;
        return (
          <input key={note.id} data-testid={`note-lyric-${measureIndex + 1}-${noteIndex + 1}`}
            value={note.lyric ?? ""} maxLength={1} readOnly={readOnly}
            className={playingNoteId === note.id ? "lyric-note-active" : selectedNoteId === note.id ? "lyric-note-selected" : undefined}
            aria-label={`${measureIndex + 1}마디 ${noteIndex + 1}번째 음표 가사`}
            title="이 음표에 맞춰 부를 글자를 적어요"
            style={{ left: `${x / width * 100}%`, width: `${Math.max(8, Math.min(18, durationWidth / width * 100))}%` }}
            onFocus={() => onFocusNote?.(note.id)}
            onChange={(event) => onChange(note.id, event.target.value)} placeholder="가" />
        );
      })}
      {pitched.length === 0 && <span>가락을 고르면 음표마다 가사 칸이 생겨요</span>}
    </div>
  );
}

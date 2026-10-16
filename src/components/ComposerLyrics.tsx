import { useState } from "react";
import type { NoteEvent } from "../music/types";
import type { Meter } from "../music/meter";
import NoteLyrics from "./NoteLyrics";

type Props = Readonly<{
  notes: readonly NoteEvent[];
  meter: Meter;
  measureIndex: number;
  selectedNoteId: string;
  notePositions?: Record<string, { x: number; y: number }>;
  onChange: (notes: readonly NoteEvent[]) => void;
  onFocusNote: (noteId: string) => void;
}>;

export function distributeComposerLyrics(notes: readonly NoteEvent[], text: string): readonly NoteEvent[] {
  const letters = Array.from(text).map((letter) => letter.trim());
  let index = 0;
  return notes.map((note) => note.pitch === null ? note : { ...note, lyric: letters[index++] ?? "" });
}

export default function ComposerLyrics({ notes, meter, measureIndex, selectedNoteId,
  notePositions, onChange, onFocusNote }: Props) {
  const pitched = notes.filter((note) => note.pitch !== null);
  const text = pitched.map((note) => note.lyric || " ").join("").trimEnd();
  const [pasteNotice, setPasteNotice] = useState("");

  return <div className="editor-note-lyrics">
    <label className="composer-lyrics-line">
      <strong>이 마디 가사 <small>최대 {pitched.length}글자</small></strong>
      <input aria-label={`${measureIndex + 1}마디 가사 한 줄`}
        value={text} maxLength={pitched.length} disabled={pitched.length === 0}
        onPaste={(event) => {
          const field = event.currentTarget;
          const pasted = event.clipboardData.getData("text");
          const replaced = (field.selectionEnd ?? 0) - (field.selectionStart ?? 0);
          if (text.length - replaced + pasted.length <= pitched.length) return;
          event.preventDefault();
          setPasteNotice(`이 마디에는 ${pitched.length}글자까지 넣을 수 있어요. 가사를 줄이거나 음표를 더해 주세요.`);
        }}
        onChange={(event) => {
          setPasteNotice("");
          onChange(distributeComposerLyrics(notes, event.target.value));
        }}
        placeholder="음표마다 한 글자씩" />
    </label>
    {pasteNotice && <p className="composer-lyrics-overflow" role="status">{pasteNotice}</p>}
    <details className="composer-lyrics-details">
      <summary>음표별로 가사 고치기</summary>
      <NoteLyrics notes={notes} meter={meter} measureIndex={measureIndex}
        selectedNoteId={selectedNoteId} notePositions={notePositions} onFocusNote={onFocusNote}
        onChange={(noteId, value) => onChange(notes.map((note) =>
          note.id === noteId ? { ...note, lyric: value } : note))} />
    </details>
  </div>;
}

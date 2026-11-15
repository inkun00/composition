import { useEffect, useState } from "react";
import { rational } from "../music/rational";
import type { NoteEvent } from "../music/types";
import { TEXTBOOK_DEFAULT_BPM, TEXTBOOK_PITCHES, TEXTBOOK_TEMPOS } from "./textbookScore";

const DRAFT_KEY = "maeum-melody:textbook-bibimbap:v1";
type Draft = { creator: string; bpm: number; answers: NoteEvent[][] };

function newDraft(): Draft {
  return { creator: "", bpm: TEXTBOOK_DEFAULT_BPM, answers: [[], [], [], []] };
}

function readBar(value: unknown): NoteEvent[] {
  if (!Array.isArray(value) || value.length > 8) return [];
  let total = 0;
  const ids = new Set<string>();
  const notes: NoteEvent[] = [];
  for (const note of value) {
    if (!note || typeof note.id !== "string" || ids.has(note.id)) return [];
    if (note.pitch !== null && !TEXTBOOK_PITCHES.includes(note.pitch)) return [];
    const { numerator, denominator } = note.duration ?? {};
    if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator <= 0) return [];
    const beats = numerator / denominator;
    if (![.5, 1, 1.5, 2, 4].includes(beats)) return [];
    total += beats;
    ids.add(note.id);
    notes.push({ id: note.id, pitch: note.pitch, duration: rational(beats * 2, 2),
      ...(beats === 1.5 ? { dotted: true } : {}) });
  }
  return total <= 4 ? notes : [];
}

function readDraft(): Draft {
  try {
    const stored = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null");
    if (stored && Array.isArray(stored.answers) && stored.answers.length === 4) {
      return {
        creator: typeof stored.creator === "string" ? stored.creator.slice(0, 40) : "",
        bpm: TEXTBOOK_TEMPOS.some(({ bpm }) => bpm === stored.bpm) ? stored.bpm : TEXTBOOK_DEFAULT_BPM,
        answers: stored.answers.map(readBar)
      };
    }
  } catch { /* The activity also works with browser storage disabled. */ }
  return newDraft();
}

export function useTextbookDraft() {
  const [draft, setDraft] = useState(readDraft);
  useEffect(() => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); }
    catch { /* Keep the active draft available for playback and export. */ }
  }, [draft]);

  return {
    ...draft,
    setCreator: (creator: string) => setDraft((current) => ({ ...current, creator })),
    setBpm: (bpm: number) => setDraft((current) => ({ ...current, bpm })),
    setBar: (index: number, notes: NoteEvent[]) => setDraft((current) => ({
      ...current, answers: current.answers.map((bar, i) => i === index ? notes : bar)
    }))
  };
}

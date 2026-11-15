import type { PlaybackMeasure } from "../audio/accompanimentScore";
import { validateMeasure, type Meter } from "../music/meter";
import { rational } from "../music/rational";
import type { HarmonyStory, NoteEvent } from "../music/types";

export const ACTIVITY_TITLE = "비상-6학년-3. 음악의 다양함-나도 작곡가";
export const TEXTBOOK_SONG_TITLE = "건강 비빔밥";
export const TEXTBOOK_METER: Meter = { beats: 4, beatUnit: 4 };
export const TEXTBOOK_PITCHES = [60, 62, 64, 65, 67, 69, 71, 72];
export const TEXTBOOK_BOARD_URL = "https://b.tkbell.co.kr/tkboard/woi/1100152/32KmP1SizI.do?pageSeq=2719039";
export const TEXTBOOK_TEMPOS = [
  { bpm: 66, label: "느리게 · Lento" },
  { bpm: 76, label: "걷는 빠르기로 · Andante" },
  { bpm: 108, label: "조금 빠르게 · Moderato" }
] as const;
export const TEXTBOOK_DEFAULT_BPM = TEXTBOOK_TEMPOS[1].bpm;

type GivenNote = readonly [pitch: number | null, beats: number, lyric?: string];

const givenBars: readonly (readonly GivenNote[])[] = [
  [[64, 1, "맛"], [67, 1, "도"], [64, .5, "좋"], [67, 1.5, "고"]],
  [[62, 1, "영"], [67, 1, "양"], [62, .5, "만"], [67, 1.5, "점"]],
  [[60, .5, "비"], [60, .5, "빔"], [60, .5, "밥"], [60, .5, "을"], [65, .5, "쓱"], [65, 1.5, "싹"]],
  [[67, 1, "만"], [67, 1, "들"], [67, 1, "자"], [null, 1]]
];

function makeNotes(bar: readonly GivenNote[], prefix: string): NoteEvent[] {
  return bar.map(([pitch, beats, lyric], index) => ({
    id: `${prefix}-${index}`, pitch, duration: rational(beats * 2, 2), lyric,
    ...(beats === 1.5 ? { dotted: true } : {}),
    ...(beats === .5 ? { beamBreak: true } : {})
  }));
}

export const GIVEN_MEASURES = givenBars.map((bar, index) => makeNotes(bar, `given-${index + 1}`));
export const ENDING_EXAMPLE = makeNotes([[72, 1], [null, 1], [null, 2]], "ending-example");
export const TEXTBOOK_LYRICS = ["맛도 좋고", "영양 만점", "비빔밥을 쓱싹", "만들자",
  "콩나물 시금치", "무말랭이 고추장", "잊지 마요 계란프라", "이"];

const tonic = { symbol: "Ⅰ", chord: "C", harmony: "home", hint: "도 · 미 · 솔" } as const;
const subdominant = { symbol: "Ⅳ", chord: "F", harmony: "journey", hint: "파 · 라 · 도" } as const;
const dominant = { symbol: "Ⅴ", chord: "G", harmony: "wonder", hint: "솔 · 시 · 레" } as const;
export const TEXTBOOK_CHORDS = [tonic, dominant, subdominant, dominant, tonic, subdominant, dominant, tonic] satisfies readonly {
  symbol: string; chord: string; harmony: HarmonyStory; hint: string;
}[];

export function isTextbookBarComplete(notes: readonly NoteEvent[]) {
  return validateMeasure(notes, TEXTBOOK_METER).state === "exact";
}

function attachLyrics(notes: readonly NoteEvent[], line: string): NoteEvent[] {
  const syllables = Array.from(line.replace(/\s/g, ""));
  const pitchedCount = notes.filter((note) => note.pitch !== null).length;
  let syllableIndex = 0;
  let noteIndex = 0;
  return notes.map((note) => {
    if (note.pitch === null) return note;
    const end = syllables.length < pitchedCount ? syllableIndex + 1
      : Math.round(++noteIndex * syllables.length / pitchedCount);
    const lyric = syllables.slice(syllableIndex, end).join("");
    syllableIndex = end;
    return { ...note, lyric };
  });
}

export function textbookSong(answers: readonly (readonly NoteEvent[])[]): PlaybackMeasure[] {
  return [...GIVEN_MEASURES, ...answers].map((notes, measureIndex) => ({
    notes: measureIndex < 4 ? notes : attachLyrics(notes, TEXTBOOK_LYRICS[measureIndex]),
    harmony: TEXTBOOK_CHORDS[measureIndex].harmony,
    chords: [TEXTBOOK_CHORDS[measureIndex].chord],
    measureIndex
  }));
}

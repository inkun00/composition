export type PracticeChordOption = Readonly<{
  value: string;
  label: string;
  description: string;
}>;

type ChordFamily = "C" | "Dm" | "Em" | "F" | "G" | "Am" | "Bdim";
type PracticeChord = PracticeChordOption & Readonly<{ family: ChordFamily }>;

const PRACTICE_CHORDS: readonly PracticeChord[] = [
  { value: "C", family: "C", label: "C · 도미솔 · 편안해요", description: "편안하게 시작하거나 마칠 때 어울려요." },
  { value: "Cmaj7", family: "C", label: "Cmaj7 · 도미솔시 · 포근해요", description: "도 화음에 시를 더해 부드러운 색깔을 만들어요." },
  { value: "Dm", family: "Dm", label: "Dm · 레파라 · 차분해요", description: "차분하게 이어지며 솔 화음으로 나아가기 좋아요." },
  { value: "Dm7", family: "Dm", label: "Dm7 · 레파라도 · 부드러워요", description: "레 화음에 도를 더해 다음 화음으로 부드럽게 이어져요." },
  { value: "Em", family: "Em", label: "Em · 미솔시 · 잔잔해요", description: "잔잔하게 시작해 라 화음이나 파 화음으로 이어 보세요." },
  { value: "Em7", family: "Em", label: "Em7 · 미솔시레 · 은은해요", description: "미 화음에 레를 더해 은은한 느낌을 만들어요." },
  { value: "F", family: "F", label: "F · 파라도 · 따뜻해요", description: "따뜻하게 펼쳐지며 다른 화음으로 연결해 줘요." },
  { value: "Fmaj7", family: "F", label: "Fmaj7 · 파라도미 · 포근해요", description: "파 화음에 미를 더해 포근한 색깔을 만들어요." },
  { value: "G", family: "G", label: "G · 솔시레 · 앞으로 가요", description: "도 화음으로 돌아가며 편안한 느낌을 만들어 보세요." },
  { value: "G7", family: "G", label: "G7 · 솔시레파 · 돌아가고 싶어요", description: "솔 화음에 파를 더해 도 화음으로 돌아가고 싶은 느낌을 줘요." },
  { value: "Gsus4", family: "G", label: "Gsus4 · 솔도레 · 기대돼요", description: "솔이나 솔7 화음으로 풀어 주면 변화를 듣기 쉬워요." },
  { value: "Am", family: "Am", label: "Am · 라도미 · 조금 쓸쓸해요", description: "조금 쓸쓸한 느낌을 더하며 레나 파 화음으로 이어져요." },
  { value: "Am7", family: "Am", label: "Am7 · 라도미솔 · 담백해요", description: "라 화음에 솔을 더해 담백한 느낌을 만들어요." },
  { value: "Bdim", family: "Bdim", label: "Bdim · 시레파 · 긴장돼요", description: "긴장되는 소리 뒤에 도 화음을 놓아 편안하게 풀어 보세요." }
];

// A deliberately small C-major learning guide, rather than a rule for all music.
// It follows tonic / predominant / dominant motion, with familiar plagal and
// deceptive returns and repeated chord families for a sustained mood.
// Reference: https://musictheory.pugetsound.edu/mt21c/HarmonicFunction.html
const NEXT_FAMILIES: Readonly<Record<ChordFamily, readonly ChordFamily[]>> = {
  C: ["C", "Dm", "F", "G", "Am"],
  Dm: ["Dm", "G", "Bdim"],
  Em: ["Em", "Am", "F"],
  F: ["F", "Dm", "G", "C", "Am"],
  G: ["G", "C", "Am"],
  Am: ["Am", "Dm", "F", "G", "C"],
  Bdim: ["C"]
};

const DEFAULT_NEXT: Readonly<Record<ChordFamily, string>> = {
  C: "C", Dm: "G", Em: "Am", F: "C", G: "C", Am: "C", Bdim: "C"
};

function findChord(value: string) {
  return PRACTICE_CHORDS.find((option) => option.value === value);
}

export function getAvailablePracticeChords(previousChord?: string): readonly PracticeChordOption[] {
  if (previousChord === undefined) return PRACTICE_CHORDS;
  if (previousChord === "Gsus4") {
    return PRACTICE_CHORDS.filter((option) => ["G", "G7", "C", "Cmaj7"].includes(option.value));
  }
  const previous = findChord(previousChord) ?? findChord("C")!;
  return PRACTICE_CHORDS.filter((option) => NEXT_FAMILIES[previous.family].includes(option.family));
}

export function isAvailablePracticeChord(chord: string, previousChord?: string): boolean {
  return getAvailablePracticeChords(previousChord).some((option) => option.value === chord);
}

export function normalizePracticeHarmony<T extends Readonly<{ chord: string }>>(measures: readonly T[]): T[] {
  let previousChord: string | undefined;
  return measures.map((measure) => {
    let chord = measure.chord;
    if (!isAvailablePracticeChord(chord, previousChord)) {
      const previous = previousChord === undefined ? undefined : findChord(previousChord);
      chord = previousChord === "Gsus4" ? "G" : previous ? DEFAULT_NEXT[previous.family] : "C";
    }
    previousChord = chord;
    return chord === measure.chord ? measure : { ...measure, chord };
  });
}

export type PracticeCreationMode = "rhythm" | "rhythm-melody" | "melody";

export const PRACTICE_CREATION_MODES: readonly {
  id: PracticeCreationMode;
  label: string;
  description: string;
}[] = [
  { id: "rhythm", label: "리듬만들기", description: "리듬만 만들고 악기로 연주해요." },
  { id: "rhythm-melody", label: "리듬만들고 가락넣기", description: "만든 리듬에 가락을 붙여 함께 연주해요." },
  { id: "melody", label: "가락만들기", description: "빈 악보에 가락을 바로 만들고 연주해요." }
];

export function isPracticeCreationMode(value: unknown): value is PracticeCreationMode {
  return PRACTICE_CREATION_MODES.some((mode) => mode.id === value);
}

export function practiceCreationModeLabel(mode: PracticeCreationMode): string {
  return PRACTICE_CREATION_MODES.find((entry) => entry.id === mode)!.label;
}

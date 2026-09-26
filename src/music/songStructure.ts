import { repeatMelody } from "./melodyRepeat";
import type { HarmonyStory, NoteEvent } from "./types";

export type SongStructureId =
  | "repeat" | "varied_repeat" | "contrast" | "return"
  | "aaba" | "alternating" | "paired_repeat" | "different_ending" | "refrain_cycle";
export type StructureReuse = "new" | "same" | "ending";
type Family = "A" | "B" | "C";
type BlockSpec = readonly [family: Family, bars: number, reuse: StructureReuse];

type StructureDefinition = Readonly<{
  id: SongStructureId;
  title: string;
  description: string;
  pattern: string;
  layouts: Readonly<Partial<Record<number, readonly BlockSpec[]>>>;
}>;

export const SONG_STRUCTURES: readonly StructureDefinition[] = [
  { id: "repeat", title: "같은 가락 두 번", description: "처음 가락을 한 번 더 들려줘요.", pattern: "A · A",
    layouts: { 8: [["A", 4, "new"], ["A", 4, "same"]], 16: [["A", 8, "new"], ["A", 8, "same"]] } },
  { id: "varied_repeat", title: "끝만 바꿔 두 번", description: "익숙한 가락으로 돌아와 끝을 바꿔요.", pattern: "A · A′",
    layouts: { 8: [["A", 4, "new"], ["A", 4, "ending"]], 16: [["A", 8, "new"], ["A", 8, "ending"]] } },
  { id: "contrast", title: "서로 다른 두 가락", description: "두 가지 가락을 차례로 만들어요.", pattern: "A · B",
    layouts: { 8: [["A", 4, "new"], ["B", 4, "new"]], 16: [["A", 8, "new"], ["B", 8, "new"]] } },
  { id: "return", title: "처음으로 돌아오기", description: "새 가락을 들려준 뒤 처음 가락으로 돌아와요.", pattern: "A · B · A",
    layouts: { 12: [["A", 4, "new"], ["B", 4, "new"], ["A", 4, "same"]],
      16: [["A", 4, "new"], ["B", 8, "new"], ["A", 4, "same"]],
      24: [["A", 8, "new"], ["B", 8, "new"], ["A", 8, "same"]] } },
  { id: "aaba", title: "익숙하게, 새롭게, 다시", description: "처음 가락을 기억한 뒤 새 가락을 만나고 돌아와요.", pattern: "A · A · B · A′",
    layouts: { 16: [["A", 4, "new"], ["A", 4, "same"], ["B", 4, "new"], ["A", 4, "ending"]],
      32: [["A", 8, "new"], ["A", 8, "same"], ["B", 8, "new"], ["A", 8, "ending"]] } },
  { id: "alternating", title: "두 가락 번갈아", description: "두 가락이 번갈아 나와요.", pattern: "A · B · A · B",
    layouts: { 16: [["A", 4, "new"], ["B", 4, "new"], ["A", 4, "same"], ["B", 4, "same"]],
      24: [["A", 8, "new"], ["B", 4, "new"], ["A", 8, "same"], ["B", 4, "same"]],
      32: [["A", 8, "new"], ["B", 8, "new"], ["A", 8, "same"], ["B", 8, "same"]] } },
  { id: "paired_repeat", title: "두 번씩 들려주기", description: "첫 가락을 두 번, 새 가락도 두 번 들려줘요.", pattern: "A · A · B · B",
    layouts: { 32: [["A", 8, "new"], ["A", 8, "same"], ["B", 8, "new"], ["B", 8, "same"]] } },
  { id: "different_ending", title: "새 가락으로 마무리", description: "처음 가락으로 돌아왔다가 새 가락으로 끝내요.", pattern: "A · B · A · C",
    layouts: { 32: [["A", 8, "new"], ["B", 8, "new"], ["A", 8, "same"], ["C", 8, "new"]] } },
  { id: "refrain_cycle", title: "좋아하는 가락이 돌아와요", description: "중심 가락 사이에 다른 이야기를 넣어요.", pattern: "A · B · A · C · A",
    layouts: { 20: [["A", 4, "new"], ["B", 4, "new"], ["A", 4, "same"], ["C", 4, "new"], ["A", 4, "same"]],
      28: [["A", 4, "new"], ["B", 8, "new"], ["A", 4, "same"], ["C", 8, "new"], ["A", 4, "same"]] } }
];

export type SongStructureBlock = Readonly<{
  family: Family;
  start: number;
  bars: number;
  reuse: StructureReuse;
  label: string;
}>;

export type SongStructurePlan = Readonly<{
  id: SongStructureId;
  title: string;
  description: string;
  pattern: string;
  blocks: readonly SongStructureBlock[];
}>;

export function availableSongStructures(length: number): readonly StructureDefinition[] {
  return SONG_STRUCTURES.filter((structure) => structure.layouts[length] !== undefined);
}

export function songStructurePlan(id: SongStructureId | null | undefined, length: number): SongStructurePlan | null {
  const definition = SONG_STRUCTURES.find((structure) => structure.id === id);
  const specs = definition?.layouts[length];
  if (!definition || !specs) return null;
  let start = 0;
  const blocks = specs.map(([family, bars, reuse]) => {
    const label = reuse === "ending" ? `${family} 가락, 끝만 바꾸기`
      : reuse === "same" ? `${family} 가락 다시` : `${family} 새 가락`;
    const block = { family, start, bars, reuse, label };
    start += bars;
    return block;
  });
  return { id: definition.id, title: definition.title, description: definition.description, pattern: definition.pattern, blocks };
}

export function isSongStructureForLength(value: unknown, length: number): value is SongStructureId {
  return typeof value === "string" && songStructurePlan(value as SongStructureId, length) !== null;
}

type StructureMeasure = Readonly<{
  story: HarmonyStory;
  chords: readonly string[];
  candidateId: string | null;
  candidateName: string | null;
  notes: readonly NoteEvent[] | null;
}>;

export function fillStructuredRepeats<T extends StructureMeasure>(
  measures: readonly T[], templateId: SongStructureId | null, changedIndex: number
): T[] {
  const plan = songStructurePlan(templateId, measures.length);
  if (!plan) return [...measures];
  const changedBlock = plan.blocks.find((block) => changedIndex >= block.start && changedIndex < block.start + block.bars);
  if (!changedBlock || changedBlock.reuse !== "new") return [...measures];
  const offset = changedIndex - changedBlock.start;
  const source = measures[changedIndex];
  const result = [...measures];

  for (const block of plan.blocks) {
    if (block.start <= changedBlock.start || block.family !== changedBlock.family || block.bars !== changedBlock.bars) continue;
    const targetIndex = block.start + offset;
    const target = result[targetIndex];
    if (target.candidateId !== null && !target.candidateId.startsWith("structure:")) continue;
    if (!source.notes) {
      if (target.candidateId?.startsWith("structure:")) {
        result[targetIndex] = { ...target, candidateId: null, candidateName: null, notes: null };
      }
      continue;
    }
    const mode = block.reuse === "ending" && offset === block.bars - 1 ? "new-ending" : "again";
    const repeated = repeatMelody(source.notes, source.chords, target.chords, target.story,
      changedIndex, targetIndex, mode);
    result[targetIndex] = {
      ...target,
      candidateId: `structure:${repeated.id}`,
      candidateName: repeated.name,
      notes: repeated.notes.map((note, index) => ({ ...note, lyric: target.notes?.[index]?.lyric ?? note.lyric }))
    };
  }
  return result;
}

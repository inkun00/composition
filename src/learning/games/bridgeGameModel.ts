import { getNote, totalBeats, type NoteId } from "../learningModel";

export type BridgeLevel = {
  id: string;
  title: string;
  mission: string;
  beats: number;
  inventory: Partial<Record<NoteId, number>>;
  required: Partial<Record<NoteId, number>>;
  fact: string;
};

export const BRIDGE_LEVELS: BridgeLevel[] = [
  {
    id: "long-plank", title: "긴 다리 한 조각", beats: 2,
    mission: "2분음표 한 조각으로 두 박짜리 다리를 놓아 주세요.",
    inventory: { half: 1, quarter: 1, eighth: 1 }, required: { half: 1 },
    fact: "4분음표를 한 박으로 셀 때, 2분음표는 두 박을 이어 주어요."
  },
  {
    id: "two-steps", title: "하나, 둘! 발맞추기", beats: 2,
    mission: "4분음표 두 조각으로 다리를 이어요. 하나, 둘!",
    inventory: { quarter: 2, eighth: 1, "quarter-rest": 1 }, required: { quarter: 2 },
    fact: "4분음표 한 개는 한 박! 두 개를 이으면 2/4박자 한 마디예요."
  },
  {
    id: "three-beats", title: "세 박자 개울", beats: 3,
    mission: "2분음표와 4분음표를 하나씩 이어 세 박을 채워 주세요.",
    inventory: { half: 1, quarter: 1, eighth: 1 }, required: { half: 1, quarter: 1 },
    fact: "두 박 + 한 박 = 세 박. 3/4박자는 한 마디에 세 박이 들어가요."
  },
  {
    id: "whole-bridge", title: "아주 긴 무지개 다리", beats: 4,
    mission: "네 박을 한 번에! 온음표 한 조각을 찾아 주세요.",
    inventory: { whole: 1, half: 1, quarter: 1 }, required: { whole: 1 },
    fact: "온음표는 네 박 동안 이어져요. 4/4박자 한 마디를 혼자 채워요."
  },
  {
    id: "quiet-step", title: "쉬어 가는 마지막 다리", beats: 4,
    mission: "2분음표, 4분음표, 4분쉼표를 하나씩 놓아요. 쉬는 박도 다리의 한 조각!",
    inventory: { half: 1, quarter: 1, "quarter-rest": 1, eighth: 1 },
    required: { half: 1, quarter: 1, "quarter-rest": 1 },
    fact: "쉼표에서도 박자는 흘러요. 두 박 소리 + 한 박 소리 + 한 박 쉬기 = 네 박이에요."
  }
];

export function bridgeTileRemaining(level: BridgeLevel, notes: readonly NoteId[], id: NoteId): number {
  return Math.max(0, (level.inventory[id] ?? 0) - notes.filter((note) => note === id).length);
}

export function canPlaceBridgeTile(level: BridgeLevel, notes: readonly NoteId[], id: NoteId): boolean {
  return bridgeTileRemaining(level, notes, id) > 0 && totalBeats(notes) + getNote(id).beats <= level.beats;
}

export function judgeBridge(level: BridgeLevel, notes: readonly NoteId[]): { correct: boolean; message: string } {
  const beats = totalBeats(notes);
  if (beats < level.beats) return { correct: false, message: `다리가 ${level.beats - beats}박만큼 짧아요. 조각을 더 이어 주세요.` };
  if (beats > level.beats) return { correct: false, message: `${beats - level.beats}박이 넘었어요. 마지막 조각을 바꿔 볼까요?` };
  const inventoryValid = notes.every((id) => notes.filter((note) => note === id).length <= (level.inventory[id] ?? 0));
  const requirementsMet = Object.entries(level.required).every(([id, count]) =>
    notes.filter((note) => note === id).length === count);
  if (!inventoryValid || !requirementsMet) return { correct: false, message: "길이는 맞아요! 이번 임무에 적힌 음표 조각도 함께 확인해 주세요." };
  return { correct: true, message: "튼튼한 다리 완성! 친구가 무사히 건넜어요." };
}

export function bridgeLevelScore(mistakes: number): number {
  return Math.max(100, 300 - Math.max(0, mistakes) * 40);
}

export function bridgeStars(mistakes: number): number {
  if (mistakes === 0) return 3;
  if (mistakes <= 4) return 2;
  return 1;
}

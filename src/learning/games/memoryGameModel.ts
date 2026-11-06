import type { DynamicId, NoteId } from "../learningModel";
import type { MusicSymbolId } from "../MusicSymbol";

export type MemoryItem = {
  id: string;
  label: string;
  meaning: string;
  dynamic?: DynamicId;
  note?: NoteId;
  symbol?: MusicSymbolId;
};
export type MemoryCard = { key: string; item: MemoryItem; side: "sign" | "meaning" };

export const MEMORY_STAGES: { name: string; tip: string; items: MemoryItem[] }[] = [
  { name: "소리의 세기 별자리", tip: "셈여림 기호와 뜻을 짝지어요. 맞추면 같은 음을 서로 다른 세기로 들려줘요.", items: [
    { id: "p", label: "p · 피아노", meaning: "여리게", dynamic: "p" },
    { id: "mf", label: "mf · 메조포르테", meaning: "조금 세게", dynamic: "mf" },
    { id: "f", label: "f · 포르테", meaning: "세게", dynamic: "f" }
  ] },
  { name: "음표 길이 별자리", tip: "4분음표를 한 박으로 세어요. 음표와 같은 길이의 카드를 찾아요.", items: [
    { id: "whole", label: "온음표", meaning: "4박 동안 이어요", note: "whole" },
    { id: "half", label: "2분음표", meaning: "2박 동안 이어요", note: "half" },
    { id: "quarter", label: "4분음표", meaning: "1박 동안 이어요", note: "quarter" },
    { id: "eighth", label: "8분음표", meaning: "반 박 동안 이어요", note: "eighth" }
  ] },
  { name: "악보 표지판 별자리", tip: "기호와 뜻의 위치를 기억해서 별자리를 완성해요.", items: [
    { id: "treble", label: "높은음자리표", meaning: "둘째 줄이 솔", symbol: "treble" },
    { id: "bass", label: "낮은음자리표", meaning: "넷째 줄이 파", symbol: "bass" },
    { id: "repeat", label: "도돌이표", meaning: "돌아가 한 번 더", symbol: "repeat" },
    { id: "final", label: "끝세로줄", meaning: "곡의 끝", symbol: "final" },
    { id: "sharp", label: "올림표", meaning: "반음 높여요", symbol: "sharp" },
    { id: "flat", label: "내림표", meaning: "반음 낮춰요", symbol: "flat" }
  ] }
];

export function createMemoryDeck(stage: number, random = Math.random): MemoryCard[] {
  const cards = MEMORY_STAGES[stage].items.flatMap((item) => [
    { key: `${item.id}-sign`, item, side: "sign" as const },
    { key: `${item.id}-meaning`, item, side: "meaning" as const }
  ]);
  for (let index = cards.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [cards[index], cards[other]] = [cards[other], cards[index]];
  }
  return cards;
}

export function memoryReward(combo: number): number {
  return 100 + Math.min(Math.max(combo, 1) - 1, 4) * 25;
}

export function memoryStars(mistakes: number): number {
  return mistakes <= 2 ? 3 : mistakes <= 6 ? 2 : 1;
}

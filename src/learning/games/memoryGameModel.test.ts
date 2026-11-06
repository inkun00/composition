import { describe, expect, it } from "vitest";
import { createMemoryDeck, MEMORY_STAGES, memoryReward, memoryStars } from "./memoryGameModel";

describe("music memory missions", () => {
  it("pairs every symbol with exactly one meaning, across growing stages", () => {
    expect(MEMORY_STAGES.map((stage) => stage.items.length)).toEqual([3, 4, 6]);
    MEMORY_STAGES.forEach((stage, index) => {
      const deck = createMemoryDeck(index, () => 0.25);
      expect(new Set(deck.map((card) => card.key)).size).toBe(stage.items.length * 2);
      stage.items.forEach((item) => {
        expect(deck.filter((card) => card.item.id === item.id).map((card) => card.side).sort()).toEqual(["meaning", "sign"]);
      });
    });
  });

  it("keeps mf about volume and note duration relative to the quarter beat", () => {
    expect(MEMORY_STAGES[0].items.find((item) => item.id === "mf")?.meaning).toBe("조금 세게");
    expect(MEMORY_STAGES[1].tip).toContain("4분음표를 한 박");
    expect(MEMORY_STAGES[1].items.find((item) => item.id === "half")?.meaning).toBe("2박 동안 이어요");
  });

  it("rewards streaks with a bounded bonus and lets every completed game earn a star", () => {
    expect(memoryReward(1)).toBe(100);
    expect(memoryReward(3)).toBe(150);
    expect(memoryReward(20)).toBe(200);
    expect([0, 3, 30].map(memoryStars)).toEqual([3, 2, 1]);
  });
});

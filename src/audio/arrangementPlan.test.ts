import { describe, expect, it } from "vitest";
import { songArrangementPlan } from "./arrangementPlan";

describe("애니 오프닝 록 구간 편곡", () => {
  it("32마디에서 후렴은 벌스보다 커지고 브리지는 잠시 작아진다", () => {
    const verse = songArrangementPlan(4, 32, 4, "anime_rock");
    const chorus = songArrangementPlan(16, 32, 4, "anime_rock");
    const bridge = songArrangementPlan(24, 32, 4, "anime_rock");
    const finale = songArrangementPlan(28, 32, 4, "anime_rock");
    expect(chorus.layerCount).toBeGreaterThan(verse.layerCount);
    expect(chorus.energy).toBeGreaterThan(verse.energy);
    expect(bridge.energy).toBeLessThan(chorus.energy);
    expect(finale.layerCount).toBe(4);
    expect(finale.energy).toBeGreaterThan(chorus.energy);
  });

  it("기존 반주는 원래의 점층 편곡을 유지한다", () => {
    expect(songArrangementPlan(0, 8, 4, "kpop")).toEqual({ layerCount: 1, energy: .82 });
  });
});

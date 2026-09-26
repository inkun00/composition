import { describe, expect, it } from "vitest";
import { karaokeBackingGainForRms, recordingArrangementPlan } from "./player";

describe("녹음용 반주", () => {
  it("노래를 부를 때도 반주를 과하게 줄이지 않는다", () => {
    expect(karaokeBackingGainForRms(0)).toBe(1.06);
    expect(karaokeBackingGainForRms(.03)).toBe(.96);
    expect(karaokeBackingGainForRms(.03)).toBeGreaterThan(.9);
  });

  it("첫 마디부터 최소 두 역할을 유지하고 구절에 따라 풍성해진다", () => {
    const opening = recordingArrangementPlan(0, 8, 4);
    const secondPhrase = recordingArrangementPlan(4, 8, 4);
    expect(opening.layerCount).toBe(2);
    expect(opening.energy).toBeGreaterThanOrEqual(.98);
    expect(secondPhrase.layerCount).toBeGreaterThanOrEqual(opening.layerCount);
    expect(secondPhrase.layerCount).toBeLessThanOrEqual(4);
  });

  it("긴 노래는 중간에 가볍게 쉬었다가 마지막 구절에서 다시 풍성해진다", () => {
    const building = recordingArrangementPlan(4, 16, 4);
    const breathing = recordingArrangementPlan(8, 16, 4);
    const finale = recordingArrangementPlan(12, 16, 4);
    expect(breathing.layerCount).toBeLessThan(building.layerCount);
    expect(finale.layerCount).toBeGreaterThan(breathing.layerCount);
    expect(finale.energy).toBeGreaterThan(breathing.energy);
  });
});

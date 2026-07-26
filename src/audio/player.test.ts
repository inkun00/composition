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
});

import { describe, expect, it } from "vitest";
import {
  PREVIEW_MELODY_VOLUME_MULTIPLIER,
  karaokeBackingGainForRms,
  recordingArrangementPlan
} from "./player";

describe("녹음과 미리듣기 음량", () => {
  it("미리듣기 메인 가락은 기존 음량보다 30% 낮춘다", () => {
    expect(PREVIEW_MELODY_VOLUME_MULTIPLIER).toBe(.7);
  });

  it("노래를 부를 때도 반주를 과하게 줄이지 않는다", () => {
    expect(karaokeBackingGainForRms(0)).toBe(1.06);
    expect(karaokeBackingGainForRms(.03)).toBe(.96);
    expect(karaokeBackingGainForRms(.03)).toBeGreaterThan(.9);
  });

  it("첫 마디부터 최소 두 악기를 유지하고 구절에 따라 활성화한다", () => {
    const opening = recordingArrangementPlan(0, 8, 4);
    const secondPhrase = recordingArrangementPlan(4, 8, 4);
    expect(opening.layerCount).toBe(2);
    expect(opening.energy).toBeGreaterThanOrEqual(.98);
    expect(secondPhrase.layerCount).toBeGreaterThanOrEqual(opening.layerCount);
    expect(secondPhrase.layerCount).toBeLessThanOrEqual(4);
  });
});

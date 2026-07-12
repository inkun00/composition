import { describe, expect, it } from "vitest";
import { ACCOMPANIMENT_STYLES, accompanimentInstrumentPart, accompanimentLayerRole, createAccompanimentPattern, createInstrumentAccompanimentPattern, ENSEMBLE_PRESETS } from "./accompaniment";

describe("자동 반주", () => {
  it("서로 다른 일곱 가지 반주 스타일을 제공한다", () => {
    expect(ACCOMPANIMENT_STYLES).toHaveLength(7);
    expect(new Set(ACCOMPANIMENT_STYLES.map((style) => style.id)).size).toBe(7);
  });

  it("모든 반주 음은 주어진 화음 구간 안에 놓인다", () => {
    for (const style of ACCOMPANIMENT_STYLES) {
      const events = createAccompanimentPattern(style.id, 2);
      expect(events.length).toBeGreaterThan(0);
      expect(events.every((item) => item.offsetBeats >= 0 &&
        item.offsetBeats + item.durationBeats <= 2.0001)).toBe(true);
    }
  });

  it("한 악기부터 여러 악기 오케스트라까지 빠른 편성을 제공한다", () => {
    expect(ENSEMBLE_PRESETS[0].instrumentIds).toHaveLength(1);
    expect(ENSEMBLE_PRESETS[2].instrumentIds.length).toBeGreaterThanOrEqual(5);
  });
  it("6개의 반주 악기는 서로 다른 연주 역할을 받는다", () => {
    const roles = Array.from({ length: 6 }, (_, index) => accompanimentLayerRole(index));
    expect(new Set(roles.map((role) => role.id)).size).toBe(6);
  });

  it("악기 종류에 따라 서로 다른 반주 주법을 만든다", () => {
    expect(accompanimentInstrumentPart("electric_bass_finger", 0).id).toBe("bass");
    expect(accompanimentInstrumentPart("acoustic_guitar_nylon", 1).id).toBe("guitar");
    expect(accompanimentInstrumentPart("violin", 2).id).toBe("strings");
    expect(accompanimentInstrumentPart("trumpet", 3).id).toBe("winds");

    const bass = createInstrumentAccompanimentPattern("arpeggio", 4, "electric_bass_finger", 0);
    const strings = createInstrumentAccompanimentPattern("arpeggio", 4, "violin", 2);
    const guitar = createInstrumentAccompanimentPattern("strum", 4, "acoustic_guitar_nylon", 1);
    expect(bass.every((event) => event.voice === "root")).toBe(true);
    expect(strings).toHaveLength(1);
    expect(guitar.length).toBeGreaterThan(1);
  });
});

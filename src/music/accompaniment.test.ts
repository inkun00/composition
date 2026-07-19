import { describe, expect, it } from "vitest";
import { ACCOMPANIMENT_GENRE_STYLES, ACCOMPANIMENT_PLAYING_STYLES, ACCOMPANIMENT_STYLES, accompanimentInstrumentPart, accompanimentLayerRole, createAccompanimentPattern, createInstrumentAccompanimentPattern, ENSEMBLE_PRESETS, MAX_ACCOMPANIMENT_INSTRUMENTS } from "./accompaniment";
import { isValidInstrumentId } from "./instruments";

describe("자동 반주", () => {
  it("반주 악기를 최대 10개까지 편성할 수 있다", () => {
    expect(MAX_ACCOMPANIMENT_INSTRUMENTS).toBe(10);
  });

  it("장르 다섯 가지와 연주 방식 일곱 가지를 제공한다", () => {
    expect(ACCOMPANIMENT_STYLES).toHaveLength(12);
    expect(ACCOMPANIMENT_GENRE_STYLES).toHaveLength(5);
    expect(ACCOMPANIMENT_PLAYING_STYLES).toHaveLength(7);
    expect(new Set(ACCOMPANIMENT_STYLES.map((style) => style.id)).size).toBe(12);
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

  it("장르 모드는 서로 다른 리듬과 유효한 추천 편성을 가진다", () => {
    const patternKeys = ACCOMPANIMENT_GENRE_STYLES.map((style) =>
      JSON.stringify(createAccompanimentPattern(style.id, 2)));
    expect(new Set(patternKeys).size).toBe(ACCOMPANIMENT_GENRE_STYLES.length);

    for (const style of ACCOMPANIMENT_GENRE_STYLES) {
      expect(style.recommendedInstrumentIds).toHaveLength(6);
      expect(style.recommendedInstrumentIds?.every(isValidInstrumentId)).toBe(true);
      style.recommendedInstrumentIds?.forEach((instrumentId, layerIndex) => {
        const events = createInstrumentAccompanimentPattern(style.id, 1, instrumentId, layerIndex);
        expect(events.length).toBeGreaterThan(0);
        expect(events.every((item) => item.offsetBeats >= 0 &&
          item.offsetBeats + item.durationBeats <= 1.0001)).toBe(true);
      });
    }
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

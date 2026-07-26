import { describe, expect, it } from "vitest";
import { ACCOMPANIMENT_GENRE_STYLES, ACCOMPANIMENT_INSTRUMENT_IDS, ACCOMPANIMENT_MODES, ACCOMPANIMENT_PLAYING_STYLES, ACCOMPANIMENT_STYLES, accompanimentInstrumentPart, accompanimentInstrumentProfile, accompanimentLayerRole, createAccompanimentPattern, createInstrumentAccompanimentPattern, createInstrumentTransitionFill, ENSEMBLE_PRESETS, isAccompanimentInstrument, MAX_ACCOMPANIMENT_INSTRUMENTS, transposeOctaves } from "./accompaniment";
import { isValidInstrumentId } from "./instruments";

describe("자동 반주", () => {
  it("반주 악기를 보컬 공간을 지키는 네 역할까지 편성할 수 있다", () => {
    expect(MAX_ACCOMPANIMENT_INSTRUMENTS).toBe(4);
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

  it("서로 다른 리듬과 편성으로 구성된 빠른 반주 모드 열 가지를 제공한다", () => {
    expect(ACCOMPANIMENT_MODES).toHaveLength(10);
    expect(ENSEMBLE_PRESETS).toBe(ACCOMPANIMENT_MODES);
    expect(new Set(ACCOMPANIMENT_MODES.map((mode) =>
      `${mode.styleId}:${mode.instrumentIds.join(",")}`)).size).toBe(ACCOMPANIMENT_MODES.length);
    ACCOMPANIMENT_MODES.forEach((mode) => {
      expect(ACCOMPANIMENT_STYLES.some((style) => style.id === mode.styleId)).toBe(true);
      expect(mode.instrumentIds.length).toBeGreaterThanOrEqual(2);
      expect(mode.instrumentIds.length).toBeLessThanOrEqual(MAX_ACCOMPANIMENT_INSTRUMENTS);
      expect(mode.instrumentIds.every(isValidInstrumentId)).toBe(true);
      expect(mode.instrumentIds.every(isAccompanimentInstrument)).toBe(true);
    });
  });

  it("장르 모드는 서로 다른 리듬과 유효한 추천 편성을 가진다", () => {
    const patternKeys = ACCOMPANIMENT_GENRE_STYLES.map((style) =>
      JSON.stringify(createAccompanimentPattern(style.id, 2)));
    expect(new Set(patternKeys).size).toBe(ACCOMPANIMENT_GENRE_STYLES.length);

    for (const style of ACCOMPANIMENT_GENRE_STYLES) {
      expect(style.recommendedInstrumentIds).toHaveLength(4);
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

  it("효과음과 노이즈 음색은 반주 악기에서 제외한다", () => {
    expect(ACCOMPANIMENT_INSTRUMENT_IDS.length).toBeGreaterThanOrEqual(24);
    expect(ACCOMPANIMENT_INSTRUMENT_IDS.every(isAccompanimentInstrument)).toBe(true);
    ["applause", "bird_tweet", "gunshot", "helicopter", "telephone_ring", "seashore"]
      .forEach((id) => expect(isAccompanimentInstrument(id)).toBe(false));
  });

  it("명시적 악기 프로필은 자연스러운 역할·음역·음량을 제공한다", () => {
    expect(accompanimentInstrumentPart("harpsichord", 0).id).toBe("keys");
    expect(accompanimentInstrumentPart("glockenspiel", 0).id).toBe("percussion");
    expect(accompanimentInstrumentProfile("violin", 0).polyphonic).toBe(false);
    expect(accompanimentInstrumentProfile("string_ensemble_1", 0).polyphonic).toBe(true);
    expect(accompanimentInstrumentProfile("glockenspiel", 0).gain).toBeLessThan(1);
  });

  it("6/8박자는 두 개의 큰 박으로 묶인 전용 패턴을 사용한다", () => {
    const meter = { beats: 6, beatUnit: 8 } as const;
    expect(createAccompanimentPattern("strum", 3, meter).map((event) => event.offsetBeats))
      .toEqual([0, 1.5]);
    expect(createAccompanimentPattern("children_song", 3, meter).map((event) => event.offsetBeats))
      .toEqual([0, .5, 1.5, 2]);
    expect(createInstrumentAccompanimentPattern(
      "kpop", 3, "electric_bass_finger", 0, meter
    ).map((event) => event.offsetBeats)).toEqual([0, 1.5]);
  });

  it("4마디 끝에서는 리듬 악기와 관악기가 짧은 전환 연주를 만든다", () => {
    expect(createInstrumentTransitionFill(4, "glockenspiel", 3)).toHaveLength(4);
    expect(createInstrumentTransitionFill(4, "trumpet", 3)).toHaveLength(2);
    expect(createInstrumentTransitionFill(4, "violin", 2)).toHaveLength(0);
  });

  it("음역 이동은 화음의 음을 보존하는 옥타브 단위만 사용한다", () => {
    for (const pitch of [48, 52, 55, 59]) {
      for (const octaves of [-2, -1, 0, 1, 2]) {
        expect(((transposeOctaves(pitch, octaves) - pitch) % 12 + 12) % 12).toBe(0);
      }
    }
  });
});

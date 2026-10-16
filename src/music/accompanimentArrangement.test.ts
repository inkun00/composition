import { describe, expect, it } from "vitest";
import {
  ACCOMPANIMENT_MODES,
  accompanimentInstrumentProfile,
  createInstrumentAccompanimentPattern as pattern
} from "./accompaniment";
import { createArrangedAccompanimentPattern as arrange } from "./accompanimentArrangement";

const meters = [
  { beats: 2, beatUnit: 4 }, { beats: 3, beatUnit: 4 },
  { beats: 4, beatUnit: 4 }, { beats: 6, beatUnit: 8 }
] as const;

describe("장르에 맞는 반주 주법과 구절", () => {
  it("피아노 아르페지오는 단음 순서를, 기타 스트럼은 위아래 화음 쓸기를 지시한다", () => {
    const arpeggio = pattern("arpeggio", 4, "acoustic_grand_piano", 0);
    expect(arpeggio.every((item) => item.voice === "step")).toBe(true);
    expect(new Set(arpeggio.map((item) => item.step)).size).toBeGreaterThan(2);
    const strums = pattern("strum", 4, "acoustic_guitar_steel", 0);
    expect(strums.every((item) => item.voice === "chord")).toBe(true);
    expect(new Set(strums.map((item) => item.strum))).toEqual(new Set(["down", "up"]));
    expect(accompanimentInstrumentProfile("acoustic_guitar_steel", 0).polyphonic).toBe(true);
  });

  it("보사노바는 당김 화음과 기본음·5도의 베이스를 교차한다", () => {
    const guitar = pattern("bossa", 4, "acoustic_guitar_nylon", 0);
    expect(guitar.map((item) => item.offsetBeats)).toEqual([0, 1.5, 2.5, 3.5]);
    expect(guitar.every((item) => item.voice === "chord")).toBe(true);
    const bass = pattern("bossa", 4, "acoustic_bass", 1);
    expect(bass.map((item) => [item.offsetBeats, item.voice, item.step]))
      .toEqual([[0, "root", undefined], [1.5, "step", 2], [2, "root", undefined], [3.5, "step", 2]]);
  });

  it("셔플 기타와 건반 모두 긴 음과 짧은 음이 2:1 위치에서 짝을 이룬다", () => {
    for (const instrument of ["bright_acoustic_piano", "electric_guitar_muted", "marimba"]) {
      const straight = pattern("shuffle", 4, instrument, 0);
      expect(straight.map((item) => item.offsetBeats).slice(0, 4)).toEqual([0, 2 / 3, 1, 1 + 2 / 3]);
      expect(straight[0].durationBeats).toBeGreaterThan(straight[1].durationBeats);
      const compound = pattern("shuffle", 3, instrument, 0, meters[3]);
      expect(compound.map((item) => item.offsetBeats)).toEqual([0, 1, 1.5, 2.5]);
    }
    expect(new Set(pattern("shuffle", 4, "electric_bass_pick", 1).map((item) => item.step)).size)
      .toBeGreaterThan(2);
  });

  it("3/4 포크는 첫 박의 베이스와 두 번의 화음을 구분한다", () => {
    const guitar = pattern("folk", 3, "acoustic_guitar_steel", 0, meters[1]);
    expect(guitar.map((item) => [item.offsetBeats, item.voice])).toEqual([[0, "root"], [1, "chord"], [2, "chord"]]);
    expect(pattern("folk", 3, "acoustic_bass", 1, meters[1]).map((item) => item.offsetBeats)).toEqual([0]);
    expect(pattern("folk", 4, "acoustic_bass", 1, meters[2]).map((item) => item.voice)).toEqual(["root", "step"]);
  });

  it("K-POP의 기타는 짧은 화음, 현악은 긴 받침을 연주한다", () => {
    const guitar = pattern("kpop", 4, "electric_guitar_muted", 2, meters[2]);
    expect(guitar.every((item) => item.voice === "chord" && item.durationBeats <= .24)).toBe(true);
    expect(pattern("kpop", 4, "string_ensemble_1", 3, meters[2])).toHaveLength(1);
    expect(arrange("kpop", 4, "electric_bass_finger", 1, meters[2], { measureIndex: 1 })
      .some((item) => item.offsetBeats === 3.5)).toBe(true);
  });

  it("전환 장식은 기존 꼬리를 대체하고 끝마디는 함께 길게 마무리한다", () => {
    const fill = arrange("children_song", 4, "glockenspiel", 3, meters[2], { transitionFill: true });
    expect(new Set(fill.map((item) => item.offsetBeats)).size).toBe(fill.length);
    const end = arrange("children_song", 4, "acoustic_grand_piano", 0, meters[2], {
      transitionFill: true, ending: true
    });
    expect(end).toHaveLength(1);
    expect(end[0]).toMatchObject({ offsetBeats: 0, durationBeats: 4, voice: "chord", sustain: true });
    expect(arrange("opera", 4, "french_horn", 3, meters[2], { transitionFill: true }))
      .toEqual(arrange("opera", 4, "french_horn", 3, meters[2]));
  });

  it("모든 빠른 모드가 네 박자와 구절 상황에서 마디를 넘지 않고 유효한 강약을 가진다", () => {
    for (const meter of meters) {
      const beats = meter.beats * 4 / meter.beatUnit;
      for (const mode of ACCOMPANIMENT_MODES) {
        mode.instrumentIds.forEach((instrumentId, layerIndex) => {
          for (const context of [{}, { measureIndex: 1 }, { transitionFill: true }, { ending: true }]) {
            const events = arrange(mode.styleId, beats, instrumentId, layerIndex, meter, context);
            expect(events.length, `${mode.id}:${instrumentId}`).toBeGreaterThan(0);
            expect(events.every((item) => Number.isFinite(item.offsetBeats) &&
              item.offsetBeats >= 0 && item.durationBeats > 0 && item.offsetBeats + item.durationBeats <= beats + .00001 &&
              (item.velocity ?? 0) > 0 && (item.velocity ?? 2) <= 1)).toBe(true);
          }
        });
      }
    }
  });

  it("솔로 현악과 관악은 악기별 실제 음역을 사용한다", () => {
    expect(accompanimentInstrumentProfile("cello", 0).range[0]).toBeLessThan(48);
    expect(accompanimentInstrumentProfile("violin", 0).range[0]).toBeGreaterThanOrEqual(55);
    expect(accompanimentInstrumentProfile("flute", 0).range[0]).toBeGreaterThanOrEqual(60);
    expect(accompanimentInstrumentProfile("french_horn", 0).range[1]).toBeLessThan(80);
  });
});

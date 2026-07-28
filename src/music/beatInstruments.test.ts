import { describe, expect, it } from "vitest";
import {
  BEAT_INSTRUMENTS,
  isValidBeatInstrumentSelection,
  isValidBeatVolume,
  normalizeBeatVolume,
  normalizeBeatInstrumentIds
} from "./beatInstruments";

describe("비트 악기 선택", () => {
  it("낮은 박자·가운데 박자·잔박자에서 하나씩 고를 수 있다", () => {
    expect(normalizeBeatInstrumentIds(["hihat", "kick", "clap"]))
      .toEqual(["kick", "clap", "hihat"]);
    expect(isValidBeatInstrumentSelection(["kick", "clap", "hihat"])).toBe(true);
  });

  it("같은 역할의 악기는 먼저 고른 하나만 남긴다", () => {
    expect(normalizeBeatInstrumentIds(["kick", "soft-kick", "clap"]))
      .toEqual(["kick", "clap"]);
    expect(isValidBeatInstrumentSelection(["kick", "soft-kick"])).toBe(false);
  });

  it("자동 추천값 없이 빈 선택도 올바른 선택이다", () => {
    expect(normalizeBeatInstrumentIds([])).toEqual([]);
    expect(isValidBeatInstrumentSelection([])).toBe(true);
  });

  it("다섯 가지 실제 타악기를 더 고를 수 있다", () => {
    const addedIds = ["floor-tom", "djembe", "conga", "cowbell", "triangle"];
    expect(BEAT_INSTRUMENTS.filter(({ id }) => addedIds.includes(id)).map(({ id }) => id))
      .toEqual(addedIds);
    expect(normalizeBeatInstrumentIds(["djembe", "cowbell", "triangle"]))
      .toEqual(["djembe", "cowbell", "triangle"]);
  });

  it("새로 추가한 여섯 악기도 역할별로 골라 함께 연주할 수 있다", () => {
    const addedIds = ["timpani", "cajon", "bongo", "claves", "ride", "guiro"];
    expect(BEAT_INSTRUMENTS.filter(({ id }) => addedIds.includes(id)).map(({ id }) => id))
      .toEqual(addedIds);
    expect(normalizeBeatInstrumentIds(["timpani", "claves", "ride"]))
      .toEqual(["timpani", "claves", "ride"]);
  });

  it("비트 음량을 5% 단위의 안전한 범위로 맞춘다", () => {
    expect(normalizeBeatVolume(137)).toBe(135);
    expect(normalizeBeatVolume(999)).toBe(160);
    expect(normalizeBeatVolume(undefined)).toBe(100);
    expect(isValidBeatVolume(135)).toBe(true);
    expect(isValidBeatVolume(137)).toBe(false);
  });
});

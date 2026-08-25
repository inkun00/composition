import { describe, expect, it } from "vitest";
import { beatPatternMeasureBeats } from "../music/beatPattern";
import {
  createAnimeRockBeatPattern,
  effectiveBeatPattern
} from "./animeRockArrangement";

describe("애니 오프닝 록 자동 드럼", () => {
  it("기본 록 킷과 4마디 끝 필인을 만든다", () => {
    const pattern = createAnimeRockBeatPattern();
    const instruments = new Set(pattern.map((event) => event.instrumentId));
    expect(instruments).toEqual(new Set([
      "hihat", "kick", "snare", "crash", "open-hihat", "rack-tom", "floor-tom"
    ]));
    expect(pattern.some((event) => event.measureIndex === 3 && event.instrumentId === "floor-tom"))
      .toBe(true);
    expect(new Set(pattern.map((event) => event.measureIndex))).toEqual(new Set([0, 1, 2, 3]));
  });

  it("사용자가 고친 악기만 자동 패턴 대신 사용한다", () => {
    const customKick = [{ id: "custom-kick", instrumentId: "kick", measureIndex: 0, offsetBeats: 1 }] as const;
    const pattern = effectiveBeatPattern("anime_rock", customKick);
    expect(pattern.filter((event) => event.instrumentId === "kick")).toEqual(customKick);
    expect(pattern.some((event) => event.instrumentId === "snare")).toBe(true);
  });

  it("다른 반주 모드의 비트는 바꾸지 않는다", () => {
    const custom = [{ id: "custom", instrumentId: "clap", measureIndex: 0, offsetBeats: 0 }] as const;
    expect(effectiveBeatPattern("kpop", custom)).toBe(custom);
  });

  it("6/8에서도 모든 소리가 마디 안에 들어간다", () => {
    const meter = { beats: 6, beatUnit: 8 } as const;
    const measureBeats = beatPatternMeasureBeats(meter);
    const pattern = createAnimeRockBeatPattern(meter);
    expect(pattern.every((event) => event.offsetBeats >= 0 && event.offsetBeats < measureBeats)).toBe(true);
  });
});

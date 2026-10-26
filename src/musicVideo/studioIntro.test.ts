import { describe, expect, it } from "vitest";
import type { PlaybackMeasure } from "../audio/accompanimentScore";
import { buildLyricVideoPlan } from "../video/lyricVideoPlan";
import { getStudioIntroSeconds } from "./studioIntro";

const measures: readonly PlaybackMeasure[] = [{ harmony: "home", chords: ["C"], notes: [
  { id: "note", pitch: 60, duration: { numerator: 4, denominator: 1 }, lyric: "노래" }
] }];

describe("편집 화면의 전주 구간", () => {
  it("네 마디 반주와 실제 오프라인 시작 여백을 BPM에 맞춰 계산한다", () => {
    expect(getStudioIntroSeconds(measures, 120)).toBeCloseTo(8.08);
    expect(getStudioIntroSeconds(measures, 240)).toBeCloseTo(4.08);
    expect(getStudioIntroSeconds([], 120)).toBe(0);
  });

  it("녹음이 있으면 예상 전주 대신 실제 첫 노래 프레임의 시각을 사용한다", () => {
    const plan = buildLyricVideoPlan("노래", measures, 120, 3.71, 8);
    expect(getStudioIntroSeconds(measures, 240, { plan })).toBe(3.71);
    expect(getStudioIntroSeconds(measures, 120, { plan: buildLyricVideoPlan("노래", measures, 120, 0, 5) })).toBe(0);
  });
});

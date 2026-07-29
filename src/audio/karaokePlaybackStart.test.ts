import { describe, expect, it } from "vitest";
import {
  KARAOKE_INTRO_FADE_SECONDS,
  karaokeIntroArrangementPlan,
  karaokeScheduleLeadSeconds
} from "./karaokePlaybackStart";

describe("노래 연습 시작 음질 보호", () => {
  it("긴 곡과 많은 악기에는 음을 예약할 시간을 더 확보한다", () => {
    expect(karaokeScheduleLeadSeconds(8, 1)).toBeCloseTo(0.86);
    expect(karaokeScheduleLeadSeconds(8, 4)).toBeCloseTo(1.34);
    expect(karaokeScheduleLeadSeconds(16, 4)).toBe(1.6);
  });

  it("전주 첫 마디는 한 악기로 시작해 네 번째 마디까지 자연스럽게 쌓는다", () => {
    expect(karaokeIntroArrangementPlan(0, 4)).toEqual({ layerCount: 1, energy: 0.72 });
    expect(karaokeIntroArrangementPlan(1, 4)).toEqual({ layerCount: 2, energy: 0.84 });
    expect(karaokeIntroArrangementPlan(2, 4)).toEqual({ layerCount: 2, energy: 0.92 });
    expect(karaokeIntroArrangementPlan(3, 4)).toEqual({ layerCount: 3, energy: 1 });
  });

  it("첫 합주의 딱딱한 진입을 막는 짧은 페이드 시간을 사용한다", () => {
    expect(KARAOKE_INTRO_FADE_SECONDS).toBeGreaterThanOrEqual(0.1);
    expect(KARAOKE_INTRO_FADE_SECONDS).toBeLessThanOrEqual(0.2);
  });
});

import { describe, expect, it } from "vitest";
import { buildPracticeHarmonyPlan } from "./practiceHarmonyAudio";

describe("연습 화음 듣기", () => {
  it.each([
    ["C", [0, 4, 7]],
    ["G7", [7, 11, 2, 5]],
    ["Dm7", [2, 5, 9, 0]],
    ["Gsus4", [7, 0, 2]]
  ] as const)("%s의 실제 구성음을 동시에 연주한다", (chord, pitchClasses) => {
    const plan = buildPracticeHarmonyPlan(chord, "piano");
    expect(plan.tracks.map((track) => track.timeline.events[0].pitch! % 12)).toEqual(pitchClasses);
    expect(plan.tracks.every((track) => track.instrumentId === "piano" && !track.rhythm)).toBe(true);
    expect(plan.tracks.every((track) => track.timeline.events[0].startSeconds === 0)).toBe(true);
    expect(plan.timeline.durationSeconds).toBe(1.5);
    expect(plan.tracks.every((track) => track.timeline.events[0].noteId === "")).toBe(true);
  });

  it("지원하지 않는 화음을 다른 소리로 대신 연주하지 않는다", () => {
    expect(() => buildPracticeHarmonyPlan("wrong", "piano")).toThrow("들을 화음을 다시");
  });
});

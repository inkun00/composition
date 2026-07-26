import { describe, expect, it } from "vitest";
import { getCandidates } from "./candidates";
import {
  candidateAverageDuration,
  prioritizeCandidatesForRhythm,
  rhythmPreferenceForStyle
} from "./rhythmPreference";

describe("선택한 음의 움직임에 맞는 추천 가락", () => {
  const candidates = getCandidates("home", { beats: 4, beatUnit: 4 }, ["C"]);

  it("짧은 움직임은 짧은 가락을, 긴 움직임은 긴 가락을 먼저 보여 준다", () => {
    const short = prioritizeCandidatesForRhythm(candidates, "children_song").slice(0, 6);
    const long = prioritizeCandidatesForRhythm(candidates, "opera").slice(0, 6);
    const mean = (items: typeof candidates) =>
      items.reduce((sum, candidate) => sum + candidateAverageDuration(candidate), 0) / items.length;

    expect(mean(short)).toBeLessThan(mean(long));
  });

  it("고르게 또박은 한 박자에 가까운 가락을 우선한다", () => {
    const medium = prioritizeCandidatesForRhythm(candidates, "folk").slice(0, 6);
    const distanceFromOneBeat = medium.reduce((sum, candidate) =>
      sum + Math.abs(candidateAverageDuration(candidate) - 1), 0) / medium.length;
    expect(distanceFromOneBeat).toBeLessThan(.4);
  });

  it("정렬 순서만 바꾸고 전체 30개는 빠짐없이 유지한다", () => {
    const prioritized = prioritizeCandidatesForRhythm(candidates, "opera");
    expect(prioritized).toHaveLength(30);
    expect(new Set(prioritized.map((candidate) => candidate.id))).toEqual(
      new Set(candidates.map((candidate) => candidate.id))
    );
    expect(rhythmPreferenceForStyle("children_song")).toBe("short");
    expect(rhythmPreferenceForStyle("folk")).toBe("medium");
    expect(rhythmPreferenceForStyle("opera")).toBe("long");
  });
});

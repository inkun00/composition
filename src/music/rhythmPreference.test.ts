import { describe, expect, it } from "vitest";
import { getCandidates } from "./candidates";
import { HARMONY_PRESETS } from "./harmonyPresets";
import { rankRecommendedCandidates } from "./recommendation";
import {
  candidateAverageDuration,
  candidateRhythmSignature,
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

  it("처음 보이는 여섯 가락은 서로 다른 리듬이며 마디마다 첫 제안이 달라진다", () => {
    const firstChoices = Array.from({ length: 4 }, (_, index) =>
      prioritizeCandidatesForRhythm(candidates, "children_song", index).slice(0, 6));
    firstChoices.forEach((choices) => {
      expect(new Set(choices.map(candidateRhythmSignature)).size).toBe(6);
    });
    expect(new Set(firstChoices.map((choices) => candidateRhythmSignature(choices[0]))).size).toBe(4);
  });

  it("100가지 이야기의 기본 설정에서 한 리듬만 계속 첫 자리를 차지하지 않는다", () => {
    const firstRhythms = new Set<string>();
    for (const preset of HARMONY_PRESETS) {
      preset.bars.forEach((chords, index) => {
        const available = getCandidates(preset.roles[index], { beats: 4, beatUnit: 4 }, chords);
        const harmonyRanked = rankRecommendedCandidates(available, chords, null, index, 16);
        const visible = prioritizeCandidatesForRhythm(harmonyRanked, "children_song", index).slice(0, 6);
        expect(new Set(visible.map(candidateRhythmSignature)).size).toBe(6);
        firstRhythms.add(candidateRhythmSignature(visible[0]));
      });
    }
    expect(firstRhythms.size).toBeGreaterThanOrEqual(4);
  });
});

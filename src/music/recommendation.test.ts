import { describe, expect, it } from "vitest";
import { rational } from "./rational";
import { chooseRecommendedCandidate, recommendationFeelingForMeasure } from "./recommendation";
import type { MelodyCandidate } from "./types";

function candidate(id: string, pitches: readonly number[], feelingId?: string): MelodyCandidate {
  return {
    id,
    name: id,
    hint: id,
    feelingId,
    harmony: "home",
    notes: pitches.map((pitch, index) => ({ id: `${id}-${index}`, pitch, duration: rational(1) }))
  };
}

describe("화음 특징 추천", () => {
  it("으뜸음만 반복하는 가락보다 3도음과 5도음이 드러나는 가락을 고른다", () => {
    const rootOnly = candidate("root-only", [60, 60, 60, 60]);
    const colourful = candidate("colourful", [60, 64, 67, 64]);
    expect(chooseRecommendedCandidate([rootOnly, colourful], ["C"], null, 0, 4).id).toBe("colourful");
  });

  it("7화음에서는 화음의 색깔을 만드는 음이 포함된 가락을 고른다", () => {
    const plain = candidate("plain", [67, 67, 67, 67]);
    const dominantColour = candidate("dominant-colour", [67, 71, 77, 71]);
    expect(chooseRecommendedCandidate([plain, dominantColour], ["G7"], null, 1, 4).id)
      .toBe("dominant-colour");
  });

  it("마지막 마디에서는 마지막 화음의 중심음으로 끝나는 가락을 우선한다", () => {
    const open = candidate("open", [64, 67, 64, 67]);
    const closed = candidate("closed", [64, 67, 64, 60]);
    expect(chooseRecommendedCandidate([open, closed], ["C"], 62, 3, 4).id).toBe("closed");
  });

  it("화음 특징이 비슷하면 바로 앞 마디와 다른 가락 모양을 고른다", () => {
    const firstShape = candidate("first-shape", [60, 64, 67, 64]);
    const secondShape = candidate("second-shape", [64, 67, 60, 64]);
    expect(chooseRecommendedCandidate(
      [firstShape, secondShape], ["C"], 64, 1, 4, 0, new Set([0])
    ).id).toBe("second-shape");
  });

  it("추천을 다시 누르면 같은 느낌 안에서도 다른 상위 가락을 고른다", () => {
    const candidates = [
      candidate("gentle-a", [60, 64, 67, 64], "gentle"),
      candidate("gentle-b", [64, 67, 60, 64], "gentle"),
      candidate("gentle-c", [67, 64, 60, 64], "gentle")
    ];
    const first = chooseRecommendedCandidate(candidates, ["C"], null, 0, 8, -1, new Set(), "gentle", 0);
    const second = chooseRecommendedCandidate(candidates, ["C"], null, 0, 8, -1, new Set(), "gentle", 1);
    expect(second.id).not.toBe(first.id);
  });

  it("각 추천안은 네 가지 느낌을 고르게 섞고 끝에서 한 번 강조한다", () => {
    const plans = Array.from({ length: 4 }, (_, recommendationIndex) =>
      Array.from({ length: 8 }, (_, measureIndex) =>
        recommendationFeelingForMeasure(recommendationIndex, measureIndex, 8)));

    expect(new Set(plans.map((plan) => plan.join("|"))).size).toBe(4);
    plans.forEach((plan) => {
      expect(new Set(plan)).toEqual(new Set(["gentle", "bouncy", "flowing", "highlight"]));
      expect(plan[6]).toBe("highlight");
      expect(plan[7]).not.toBe("highlight");
    });
  });
});

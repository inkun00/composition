import { describe, expect, it } from "vitest";
import { DYNAMICS } from "../learningModel";
import {
  DYNAMICS_CHOICES, DYNAMICS_MISSIONS, MELODY, dynamicsGainAt,
  dynamicsPerformanceReward
} from "./dynamicsPerformanceModel";

describe("dynamics performance", () => {
  it("reuses the exact six steady gains at every point in the same melody", () => {
    for (const dynamic of DYNAMICS) {
      for (const progress of [-1, 0, .25, .5, 1, 2]) {
        expect(dynamicsGainAt(dynamic.id, progress)).toBe(dynamic.gain);
      }
    }
    expect(MELODY).toEqual({ midi: [60, 64, 67, 72, 71, 67, 64, 62], beats: 1, bpm: 112 });
    expect(DYNAMICS_CHOICES.map(({ id }) => id)).toEqual([
      "pp", "p", "mp", "mf", "f", "ff", "crescendo", "decrescendo"
    ]);
  });

  it("changes loudness gradually from p to f and back without exceeding either endpoint", () => {
    const quiet = DYNAMICS.find(({ id }) => id === "p")!.gain;
    const strong = DYNAMICS.find(({ id }) => id === "f")!.gain;
    let previous = quiet;
    for (let step = 0; step <= 20; step += 1) {
      const progress = step / 20;
      const growing = dynamicsGainAt("crescendo", progress);
      expect(growing).toBeGreaterThanOrEqual(previous);
      expect(growing).toBeLessThanOrEqual(strong);
      expect(growing + dynamicsGainAt("decrescendo", progress)).toBeCloseTo(quiet + strong);
      previous = growing;
    }
    expect(dynamicsGainAt("crescendo", .5)).toBeCloseTo((quiet + strong) / 2);
    expect(dynamicsGainAt("crescendo", -1)).toBe(quiet);
    expect(dynamicsGainAt("crescendo", 2)).toBe(strong);
    expect(dynamicsGainAt("decrescendo", -1)).toBe(strong);
    expect(dynamicsGainAt("decrescendo", 2)).toBe(quiet);
    expect(dynamicsGainAt("crescendo", Number.NaN)).toBe(quiet);
  });

  it("introduces one expression per mission and keeps the musical comparison explicit", () => {
    expect(DYNAMICS_MISSIONS.map(({ target }) => target)).toEqual(["p", "f", "crescendo", "decrescendo"]);
    expect(new Set(DYNAMICS_MISSIONS.map(({ id }) => id)).size).toBe(4);
    for (const mission of DYNAMICS_MISSIONS) {
      expect(DYNAMICS_CHOICES.some(({ id }) => id === mission.target)).toBe(true);
      expect(mission.description).toContain("같은 가락");
    }
  });

  it("rewards successful answers while keeping rehearsal separate from submitted attempts", () => {
    expect(dynamicsPerformanceReward([1, 1, 1, 1])).toEqual({ score: 1200, stars: 3 });
    expect(dynamicsPerformanceReward([2, 1, 1, 1])).toEqual({ score: 1160, stars: 2 });
    expect(dynamicsPerformanceReward([2, 2, 2, 2])).toEqual({ score: 1040, stars: 2 });
    expect(dynamicsPerformanceReward([6, 1, 1, 1])).toEqual({ score: 1000, stars: 1 });
    expect(dynamicsPerformanceReward([20, 20, 20, 20])).toEqual({ score: 400, stars: 1 });
  });
});

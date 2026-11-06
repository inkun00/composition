import { describe, expect, it } from "vitest";
import { BRIDGE_LEVELS, bridgeLevelScore, bridgeStars, bridgeTileRemaining, canPlaceBridgeTile, judgeBridge } from "./bridgeGameModel";
import type { NoteId } from "../learningModel";

describe("musical bridge missions", () => {
  it("has a valid solution for every progressively introduced rhythm", () => {
    const solutions: NoteId[][] = [["half"], ["quarter", "quarter"], ["half", "quarter"], ["whole"], ["half", "quarter", "quarter-rest"]];
    BRIDGE_LEVELS.forEach((level, index) => {
      const placed: NoteId[] = [];
      for (const note of solutions[index]) {
        expect(canPlaceBridgeTile(level, placed, note)).toBe(true);
        placed.push(note);
      }
      expect(judgeBridge(level, placed).correct).toBe(true);
    });
  });

  it("checks the musical mission as well as the total beat length", () => {
    expect(judgeBridge(BRIDGE_LEVELS[1], ["quarter", "quarter-rest"]).correct).toBe(false);
    expect(judgeBridge(BRIDGE_LEVELS[4], ["half", "quarter", "quarter-rest"]).correct).toBe(true);
    expect(judgeBridge(BRIDGE_LEVELS[4], ["half", "quarter", "quarter"]).correct).toBe(false);
  });

  it("limits inventory and rejects overflowing or missing pieces", () => {
    const level = BRIDGE_LEVELS[0];
    expect(bridgeTileRemaining(level, ["quarter"], "quarter")).toBe(0);
    expect(canPlaceBridgeTile(level, ["quarter"], "quarter")).toBe(false);
    expect(canPlaceBridgeTile(level, ["quarter"], "half")).toBe(false);
    expect(canPlaceBridgeTile(level, [], "whole")).toBe(false);
    expect(judgeBridge(level, ["quarter"]).message).toContain("1박");
  });

  it("rewards a clean run while every completed level still gives points", () => {
    expect(bridgeLevelScore(0)).toBe(300);
    expect(bridgeLevelScore(2)).toBe(220);
    expect(bridgeLevelScore(20)).toBe(100);
    expect(bridgeStars(0)).toBe(3);
    expect(bridgeStars(4)).toBe(2);
    expect(bridgeStars(5)).toBe(1);
  });
});

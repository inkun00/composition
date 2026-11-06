import { describe, expect, it } from "vitest";
import {
  BRIDGE_CROSSING_MS, BRIDGE_TILE_MOTION_MS, bridgeCrossingPose, bridgeMistakeOffset,
  bridgeTilePose
} from "./bridgeMotion";

describe("bridge game motion", () => {
  it("accelerates a falling tile and settles after a smaller rebound", () => {
    const start = bridgeTilePose(0).lift;
    const early = bridgeTilePose(100).lift;
    const later = bridgeTilePose(200).lift;
    expect(start).toBeGreaterThan(early);
    expect(early - later).toBeGreaterThan(start - early);
    expect(bridgeTilePose(380).lift).toBeGreaterThan(0);
    expect(bridgeTilePose(380).lift).toBeLessThan(start / 4);
    expect(bridgeTilePose(BRIDGE_TILE_MOTION_MS)).toEqual({
      progress: 0, lift: 0, angle: 0, scaleX: 1, scaleY: 1
    });
  });

  it("takes four hops while moving forward and lands without overshooting", () => {
    let lastProgress = 0;
    let lastLift = 0;
    let ascending = false;
    let peaks = 0;
    for (let time = 0; time <= BRIDGE_CROSSING_MS; time += 10) {
      const pose = bridgeCrossingPose(time);
      expect(pose.progress).toBeGreaterThanOrEqual(lastProgress);
      expect(pose.progress).toBeLessThanOrEqual(1);
      expect(pose.lift).toBeGreaterThanOrEqual(0);
      if (pose.lift > lastLift) ascending = true;
      if (ascending && pose.lift < lastLift) {
        peaks += 1;
        ascending = false;
      }
      lastProgress = pose.progress;
      lastLift = pose.lift;
    }
    expect(peaks).toBe(4);
    expect(bridgeCrossingPose(BRIDGE_CROSSING_MS + 100)).toEqual({
      progress: 1, lift: 0, angle: 0, scaleX: 1, scaleY: 1
    });
  });

  it("keeps a failed placement gentle and returns the bridge to its position", () => {
    const offsets = Array.from({ length: 37 }, (_, index) => bridgeMistakeOffset(index * 10));
    expect(Math.max(...offsets)).toBeGreaterThan(0);
    expect(Math.min(...offsets)).toBeLessThan(0);
    expect(offsets.every((offset) => Math.abs(offset) <= 5)).toBe(true);
    expect(bridgeMistakeOffset(360)).toBe(0);
    expect(bridgeMistakeOffset(600)).toBe(0);
  });
});

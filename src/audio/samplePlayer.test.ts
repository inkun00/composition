import { describe, expect, it } from "vitest";
import { INSTRUMENTS } from "../music/instruments";
import { isSampleBackedInstrument } from "./samplePlayer";

describe("실제 악기 샘플 연결", () => {
  it("화면의 모든 악기가 샘플 재생을 지원한다", () => {
    expect(INSTRUMENTS.every((instrument) => isSampleBackedInstrument(instrument.id))).toBe(true);
  });
});

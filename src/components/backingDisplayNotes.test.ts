import { describe, expect, it } from "vitest";
import { backingDisplayNotes, repeatFourMeasures } from "./backingDisplayNotes";

describe("repeatFourMeasures", () => {
  it("마디 수가 적을 때 4마디로 반복 채운다", () => {
    const items = [1, 2];
    expect(repeatFourMeasures(items, false)).toEqual([1, 2, 1, 2]);
  });
});

describe("backingDisplayNotes", () => {
  it("반주 표시용 노트를 생성한다", () => {
    const notes = backingDisplayNotes(
      { chords: ["C"] },
      { beats: 4, beatUnit: 4 },
      "arpeggio",
      "intro",
      0
    );
    expect(notes.length).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from "vitest";
import { rational } from "./rational";
import { inferImportedHarmony, type ImportedHarmonyMeasure } from "./importedHarmony";

function measure(pitches: readonly number[], chords?: readonly string[]): ImportedHarmonyMeasure {
  return {
    notes: pitches.map((pitch, index) => ({
      id: `note-${pitch}-${index}`,
      pitch,
      duration: rational(1)
    })),
    chords
  };
}

describe("가져온 악보의 화음 추정", () => {
  it("C장조 가락에서 마디별 C-F-G-C 진행을 찾는다", () => {
    const result = inferImportedHarmony([
      measure([60, 64, 67, 72]),
      measure([65, 69, 72, 69]),
      measure([67, 71, 74, 71]),
      measure([72, 67, 64, 60])
    ], { fifths: 0, mode: "major" });

    expect(result.tonicChord).toBe("C");
    expect(result.chordsByMeasure).toEqual([["C"], ["F"], ["G"], ["C"]]);
  });

  it("조표가 있는 G장조 가락에는 G장조 화음을 붙인다", () => {
    const result = inferImportedHarmony([
      measure([67, 71, 74, 79]),
      measure([72, 76, 79, 76]),
      measure([74, 78, 81, 78]),
      measure([79, 74, 71, 67])
    ], { fifths: 1, mode: "major" });

    expect(result.tonicChord).toBe("G");
    expect(result.chordsByMeasure).toEqual([["G"], ["C"], ["D"], ["G"]]);
  });

  it("MusicXML에서 읽은 코드 기호를 자동 추정보다 우선한다", () => {
    const result = inferImportedHarmony([
      measure([60, 64, 67, 72], ["Am7"]),
      measure([67, 71, 74, 79])
    ], { fifths: 0, mode: "major" });

    expect(result.chordsByMeasure[0]).toEqual(["Am7"]);
  });
});

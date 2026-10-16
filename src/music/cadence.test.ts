import { describe, expect, it } from "vitest";
import { cadenceChords } from "./cadence";
import { chordPitchClasses } from "./chord";

describe("전주·후주의 조성", () => {
  it("곡의 유니코드 내림표·올림표를 영문 표기와 같은 높이로 읽는다", () => {
    for (const [unicode, ascii] of [["E♭m", "Ebm"], ["D♭maj7", "Dbmaj7"], ["F♯m", "F#m"]]) {
      expect(cadenceChords(unicode)).toEqual(cadenceChords(ascii));
      const cadence = cadenceChords(unicode)!;
      expect(chordPitchClasses(cadence[2])[0]).toBe(chordPitchClasses(unicode)[0]);
    }
  });

  it("단조의 버금딸림과 장조 딸림7화음 및 슬래시 화음의 원래 근음을 보존한다", () => {
    expect(cadenceChords("Am/C")).toEqual(["Dm", "E7", "Am"]);
    expect(cadenceChords("Cmaj7/E")).toEqual(["F", "G7", "C"]);
    const roman = cadenceChords("I")!;
    expect(roman.map(chordPitchClasses)).toEqual([[5, 9, 0], [7, 11, 2, 5], [0, 4, 7]]);
  });
});

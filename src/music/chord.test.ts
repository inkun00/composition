import { describe, expect, it } from "vitest";
import { chordDegreeLabel, chordDegreeSequence, chordMidiPitches, chordPitchClasses, nearestChordTone } from "./chord";

describe("화음 구성음 계산", () => {
  it("장화음과 단화음을 구분한다", () => {
    expect(chordPitchClasses("C")).toEqual([0, 4, 7]);
    expect(chordPitchClasses("Am")).toEqual([9, 0, 4]);
  });

  it("다양한 꾸밈 화음과 아래음을 읽는다", () => {
    expect(chordPitchClasses("G7")).toEqual([7, 11, 2, 5]);
    expect(chordPitchClasses("Bm7♭5")).toEqual([11, 2, 5, 9]);
    expect(chordPitchClasses("G/B")[0]).toBe(11);
    expect(chordMidiPitches("C5")).toHaveLength(2);
  });

  it("서로 다른 특별한 긴장 화음은 서로 다른 구성음을 가진다", () => {
    expect(chordPitchClasses("It+6")).toEqual([8, 0, 6]);
    expect(chordPitchClasses("Fr+6")).toEqual([8, 0, 2, 6]);
    expect(chordPitchClasses("Ger+6")).toEqual([8, 0, 3, 6]);
  });

  it("가락 목표음을 가장 가까운 화음 구성음으로 옮긴다", () => {
    expect(nearestChordTone(61, "C")).toBe(60);
    expect(nearestChordTone(61, "D♭")).toBe(61);
  });

  it("반주에 쓰이는 장9·단6·감7·변화9화음의 성격을 보존한다", () => {
    expect(chordPitchClasses("Cmaj9")).toEqual([0, 4, 7, 11, 2]);
    expect(chordPitchClasses("Fm6")).toEqual([5, 8, 0, 2]);
    expect(chordPitchClasses("Am6")).toEqual([9, 0, 4, 6]);
    expect(chordPitchClasses("C♯dim7")).toEqual([1, 4, 7, 10]);
    expect(chordPitchClasses("Bm7♭5")).toEqual([11, 2, 5, 9]);
    expect(chordPitchClasses("E7♯9")).toEqual([4, 8, 11, 2, 7]);
    expect(chordPitchClasses("G7♭9")).toEqual([7, 11, 2, 5, 8]);
    expect(chordPitchClasses("Cadd9")).toEqual([0, 4, 7, 2]);
  });

  it("도수 기호의 7화음도 전주·후주에서 실제 딸림화음으로 읽는다", () => {
    expect(chordPitchClasses("I")).toEqual([0, 4, 7]);
    expect(chordPitchClasses("IV")).toEqual([5, 9, 0]);
    expect(chordPitchClasses("V7")).toEqual([7, 11, 2, 5]);
  });

  it("화음 기호를 초등학생용 도수로 바꾼다", () => {
    expect(chordDegreeLabel("C/E")).toBe("1도");
    expect(chordDegreeLabel("B♭7")).toBe("♭7도");
    expect(chordDegreeLabel("Fr+6")).toBe("♭6도");
    expect(chordDegreeSequence(["F", "G7"])).toBe("4도 → 5도 화음");
  });
});

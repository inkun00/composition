import { describe, expect, it } from "vitest";
import { chordPitchClasses } from "../music/chord";
import { getAvailablePracticeChords, isAvailablePracticeChord, normalizePracticeHarmony } from "./practiceHarmony";

function values(previousChord?: string) {
  return getAvailablePracticeChords(previousChord).map((option) => option.value);
}

describe("앞 마디에 맞춰 고르는 연습 화음", () => {
  it("첫 마디에는 서로 다른 열네 화음과 초보자를 위한 구성음 설명을 제공한다", () => {
    const options = getAvailablePracticeChords();
    expect(options).toHaveLength(14);
    expect(new Set(options.map((option) => option.value)).size).toBe(14);
    expect(values()).toEqual(expect.arrayContaining(["C", "Dm", "Em", "F", "G", "Am", "Bdim", "Cmaj7", "Dm7", "Em7", "Fmaj7", "G7", "Gsus4", "Am7"]));
    for (const option of options) {
      expect(option.label).toContain(option.value);
      expect(option.label).toMatch(/[도레미파솔라시]/);
      expect(option.description.length).toBeGreaterThan(5);
    }
  });

  it("도 화음의 기본색과 7화음을 구분해 실제로 다른 구성음을 사용한다", () => {
    expect(chordPitchClasses("Cmaj7")).toEqual([0, 4, 7, 11]);
    expect(chordPitchClasses("Dm7")).toEqual([2, 5, 9, 0]);
    expect(chordPitchClasses("Fmaj7")).toEqual([5, 9, 0, 4]);
    expect(chordPitchClasses("Gsus4")).toEqual([7, 0, 2]);
    for (const option of getAvailablePracticeChords()) {
      expect(chordPitchClasses(option.value).every((pitch) => [0, 2, 4, 5, 7, 9, 11].includes(pitch))).toBe(true);
    }
  });

  it("앞 화음에 따라 다음 후보를 좁히고 ii-V-I와 기만·변격 귀환을 안내한다", () => {
    expect(values("Dm")).toEqual(["Dm", "Dm7", "G", "G7", "Gsus4", "Bdim"]);
    expect(values("G7")).toEqual(["C", "Cmaj7", "G", "G7", "Gsus4", "Am", "Am7"]);
    expect(values("Bdim")).toEqual(["C", "Cmaj7"]);
    expect(values("F")).toEqual(expect.arrayContaining(["C", "Am"]));
    expect(values("Gsus4")).toEqual(["C", "Cmaj7", "G", "G7"]);
    expect(values("Em")).toEqual(expect.arrayContaining(["Am", "F"]));
    expect(values("C")).not.toContain("Bdim");
    expect(isAvailablePracticeChord("F", "Dm")).toBe(false);
    expect(isAvailablePracticeChord("unknown")).toBe(false);
  });

  it("앞 화음 변경 후 가능한 기존 선택은 보존하고 잘못된 선택만 뒤로 이어 고친다", () => {
    const original = ["Dm", "F", "Dm7", "G7", "Cmaj7"].map((chord, index) => ({ chord, noteId: `note-${index}` }));
    const next = normalizePracticeHarmony(original);
    expect(next.map((measure) => measure.chord)).toEqual(["Dm", "G", "C", "G7", "Cmaj7"]);
    expect(next[0]).toBe(original[0]);
    expect(next[3]).toBe(original[3]);
    expect(next[4]).toBe(original[4]);
    expect(next.map((measure) => measure.noteId)).toEqual(original.map((measure) => measure.noteId));
    expect(original.map((measure) => measure.chord)).toEqual(["Dm", "F", "Dm7", "G7", "Cmaj7"]);
    next.forEach((measure, index) => expect(isAvailablePracticeChord(measure.chord, next[index - 1]?.chord)).toBe(true));
  });

  it("이전 기본 화음 연속과 저장된 C-F-Am 진행을 보존한다", () => {
    for (const chords of [["C", "C", "C", "C"], ["C", "F", "Am"], ["Cmaj7", "Fmaj7", "Dm7", "G7"]]) {
      const original = chords.map((chord) => ({ chord }));
      expect(normalizePracticeHarmony(original)).toEqual(original);
    }
  });

  it("손상된 화음값도 항상 허용 후보로 복구하고 이후 진행에 반영한다", () => {
    const next = normalizePracticeHarmony(["unknown", "Dm", "missing", "Bdim", "wrong"].map((chord) => ({ chord })));
    expect(next.map((measure) => measure.chord)).toEqual(["C", "Dm", "G", "C", "C"]);
  });
});

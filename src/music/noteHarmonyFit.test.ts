import { describe, expect, it } from "vitest";
import { chordToneNames, noteHarmonyFit } from "./noteHarmonyFit";
import type { NoteEvent } from "./types";

const meter = { beats: 4, beatUnit: 4 } as const;
const note = (id: string, pitch: number | null, beats = 1): NoteEvent => ({
  id, pitch, duration: { numerator: beats, denominator: 1 }
});

describe("단정하지 않는 화음 안내", () => {
  it("화음 구성음과 가까워도 홀로 있는 레를 경과음으로 부르지 않는다", () => {
    const re = note("re", 62, 4);
    expect(noteHarmonyFit(re, [re], ["C"], meter)).toBe("color");
  });

  it("앞뒤 문맥을 분석하지 않는 안내는 이웃음과 도약도 모두 화음 밖의 음으로 표시한다", () => {
    const notes = [note("do", 60), note("re", 62), note("do2", 60), note("la", 69)];
    expect(noteHarmonyFit(notes[1], notes, ["C"], meter)).toBe("color");
    expect(noteHarmonyFit(notes[3], notes, ["C"], meter)).toBe("color");
  });

  it("마디 중간 화음 변경과 쉼표를 구분한다", () => {
    const notes = [note("mi", 64, 2), note("ti", 71), note("rest", null)];
    expect(noteHarmonyFit(notes[0], notes, ["C", "G"], meter)).toBe("chord");
    expect(noteHarmonyFit(notes[1], notes, ["C", "G"], meter)).toBe("chord");
    expect(noteHarmonyFit(notes[2], notes, ["C", "G"], meter)).toBeNull();
  });

  it("화음별 어울리는 음(계이름)을 반환한다", () => {
    expect(chordToneNames("C")).toEqual(["도", "미", "솔"]);
    expect(chordToneNames("G")).toEqual(["솔", "시", "레"]);
    expect(chordToneNames("F")).toEqual(["파", "라", "도"]);
    expect(chordToneNames("Am")).toEqual(["라", "도", "미"]);
  });
});

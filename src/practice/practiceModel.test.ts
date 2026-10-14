import { describe, expect, it } from "vitest";
import { SUPPORTED_METERS, measureCapacity, validateMeasure } from "../music/meter";
import { rational, toNumber } from "../music/rational";
import type { NoteEvent } from "../music/types";
import {
  PRACTICE_DURATIONS,
  PRACTICE_PITCHES,
  assignPracticeLyrics,
  createPracticeMeasures,
  getPracticeHarmonyHints,
  makeLyricRhythm,
  practiceDurationSeconds
} from "./practiceModel";

const commonTime = { beats: 4, beatUnit: 4 as const };
function note(id: string, pitch: number | null, beats: number, lyric?: string): NoteEvent {
  return { id, pitch, duration: rational(beats * 4, 4), ...(lyric ? { lyric } : {}) };
}

describe("처음 작곡하는 사람의 연습 모델", () => {
  it("낮은 도부터 높은 도까지 여덟 음과 실제 길이의 점음표를 제공한다", () => {
    expect(PRACTICE_PITCHES.map((option) => option.pitch)).toEqual([60, 62, 64, 65, 67, 69, 71, 72]);
    expect(PRACTICE_DURATIONS.filter((duration) => duration.dotted).map((duration) => duration.beats))
      .toEqual([1.5, 3]);
    expect(PRACTICE_DURATIONS[0]).toMatchObject({ beats: 0.25, label: "16분음표 · 1/4박", symbol: "𝅘𝅥𝅯" });
  });

  it("마디마다 가사, 화음과 음표를 독립적으로 편집할 수 있다", () => {
    const measures = createPracticeMeasures(3);
    expect(new Set(measures.map((measure) => measure.id)).size).toBe(3);
    measures[0].notes = [note("first", 60, 1)];
    measures[0].lyric = "안녕";
    expect(measures[1]).toMatchObject({ notes: [], lyric: "", chord: "C" });
    expect(() => createPracticeMeasures(0)).toThrow("마디 수");
    expect(() => createPracticeMeasures(1.5)).toThrow("마디 수");
  });

  it("쉼표를 건너뛰어 한글 음절을 배치하고 오래된 가사를 지운다", () => {
    const input = [note("a", 60, 1, "옛"), note("rest", null, 1, "숨"), note("b", 64, 1), note("c", 67, 1, "말")];
    const result = assignPracticeLyrics(input, "안 녕!");
    expect(result.map((event) => event.lyric)).toEqual(["안", undefined, "녕", ""]);
    expect(input[0].lyric).toBe("옛");
    expect(input[1].lyric).toBe("숨");
  });

  it("분리된 한글 자모도 정규화해서 한 음절로 배치한다", () => {
    expect(assignPracticeLyrics([note("a", 60, 1)], "가")[0].lyric).toBe("가");
  });

  it.each(SUPPORTED_METERS)("$beats/$beatUnit박자에서 가능한 모든 가사 길이를 빠짐없이 맞춘다", (meter) => {
    const maxSyllables = toNumber(measureCapacity(meter)) * 4;
    for (let count = 1; count <= maxSyllables; count += 1) {
      const notes = makeLyricRhythm("가".repeat(count), meter, `measure-${count}`);
      expect(notes).toHaveLength(count);
      expect(notes.map((event) => event.lyric).join("")).toBe("가".repeat(count));
      expect(validateMeasure(notes, meter).state).toBe("exact");
      expect(new Set(notes.map((event) => event.id)).size).toBe(count);
      for (const event of notes) {
        expect(PRACTICE_DURATIONS.some((duration) => duration.beats === toNumber(event.duration))).toBe(true);
        expect(Boolean(event.dotted)).toBe([1.5, 3].includes(toNumber(event.duration)));
      }
    }
  });

  it("공백과 문장부호는 박자를 차지하지 않으며 빈 가사는 거부한다", () => {
    expect(makeLyricRhythm("안녕, 친구!", commonTime, "greeting").map((event) => event.lyric))
      .toEqual(["안", "녕", "친", "구"]);
    expect(() => makeLyricRhythm(" \n?!", commonTime, "empty")).toThrow("가사를 먼저");
  });

  it("긴 가사를 잘라 버리지 않고 다음 마디에 나누라고 알린다", () => {
    expect(() => makeLyricRhythm("가".repeat(17), commonTime, "long"))
      .toThrow("가사 17글자는 이 마디에 모두 들어가지 않아요");
    expect(() => makeLyricRhythm("가".repeat(9), { beats: 2, beatUnit: 4 }, "short"))
      .toThrow("최대 8글자");
  });

  it("16개 음절을 16분음표로 만들고 쉼표까지 1/4박 길이로 계산한다", () => {
    const notes = makeLyricRhythm("가나다라마바사아자차카타파하하하", commonTime, "sixteenth");
    expect(notes).toHaveLength(16);
    expect(notes.every((event) => event.duration.numerator === 1 && event.duration.denominator === 4)).toBe(true);
    const measures = createPracticeMeasures(1);
    measures[0].notes = [note("sound", 60, 0.25), note("rest", null, 0.25)];
    expect(practiceDurationSeconds(measures, 120)).toBe(0.25);
  });

  it("다른 마디의 음표 ID가 서로 겹치지 않는다", () => {
    const first = makeLyricRhythm("안녕", commonTime, "first");
    const second = makeLyricRhythm("친구", commonTime, "second");
    expect(new Set([...first, ...second].map((event) => event.id)).size).toBe(4);
  });

  it("강박에서 화음과 부딪히는 음을 알려 주고 가까운 화음 음을 제안한다", () => {
    const hints = getPracticeHarmonyHints([note("d", 62, 1), note("c", 60, 3)], "C", commonTime);
    expect(hints).toHaveLength(1);
    expect(hints[0].noteId).toBe("d");
    expect(hints[0].kind).toBe("non-chord");
    expect(hints[0].message).toContain("힘주는 박");
    expect(hints[0].suggestedPitches).toEqual([60, 64, 67]);
  });

  it("짧은 경과음과 이웃음에는 경고를 남발하지 않는다", () => {
    const passing = [note("c", 60, 1.5), note("d", 62, 0.5), note("e", 64, 2)];
    const neighbour = [note("e1", 64, 2), note("f", 65, 0.5), note("e2", 64, 1.5)];
    expect(getPracticeHarmonyHints(passing, "C", commonTime)).toEqual([]);
    expect(getPracticeHarmonyHints(neighbour, "C", commonTime)).toEqual([]);
  });

  it("6/8박자에서는 두 번째 큰 박에 놓인 긴 비화음음을 짚는다", () => {
    const hints = getPracticeHarmonyHints(
      [note("c", 60, 1.5), note("d", 62, 1), note("f", 65, 0.5)],
      "C", { beats: 6, beatUnit: 8 }
    );
    expect(hints.map((hint) => hint.noteId)).toEqual(["d", "f"]);
    expect(hints[0].message).toContain("힘주는 박");
  });

  it("곡 마지막 마디의 긴장 음은 선택적인 마무리 힌트로 안내한다", () => {
    const notes = [note("c", 60, 1), note("e", 64, 1), note("g", 67, 1), note("b", 71, 1)];
    const hints = getPracticeHarmonyHints(notes, "C", commonTime, { isFinalMeasure: true });
    expect(hints).toHaveLength(1);
    expect(hints[0].noteId).toBe("b");
    expect(hints[0].kind).toBe("ending");
    expect(hints[0].message).toContain("편안하게 마치고 싶다면");
    expect(hints[0].suggestedPitches[0]).toBe(72);
    expect(getPracticeHarmonyHints(notes, "G", commonTime, { isFinalMeasure: true })
      .some((hint) => hint.noteId === "b")).toBe(false);
  });

  it("큰 도약에 걸음 힌트를 주되 쉼표 너머의 음을 도약으로 판단하지 않는다", () => {
    const leap = getPracticeHarmonyHints([note("low", 60, 2), note("high", 72, 2)], "C", commonTime);
    expect(leap).toHaveLength(1);
    expect(leap[0].message).toContain("한 걸음씩");
    expect(leap[0].suggestedPitches).toEqual(expect.arrayContaining([62, 64]));
    expect(getPracticeHarmonyHints([note("low", 60, 1), note("rest", null, 1), note("high", 72, 2)], "C", commonTime))
      .toEqual([]);
  });

  it("점음표와 쉼표를 포함한 실제 재생 길이를 빠르기에 맞게 계산한다", () => {
    const measures = createPracticeMeasures(2);
    measures[0].notes = [note("a", 60, 1.5), note("rest", null, 0.5), note("b", 64, 2)];
    measures[1].notes = [note("c", 67, 3)];
    expect(practiceDurationSeconds(measures, 120)).toBe(3.5);
    expect(practiceDurationSeconds([], 80)).toBe(0);
    expect(() => practiceDurationSeconds(measures, 0)).toThrow("빠르기");
    expect(() => practiceDurationSeconds(measures, Number.NaN)).toThrow("빠르기");
  });
});

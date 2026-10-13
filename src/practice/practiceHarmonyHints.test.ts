import { describe, expect, it } from "vitest";
import { rational } from "../music/rational";
import type { NoteEvent } from "../music/types";
import { getPracticeHarmonySummary } from "./practiceHarmonyHints";
import { getPracticeHarmonyHints, type PracticeMeasure } from "./practiceModel";

const commonTime = { beats: 4, beatUnit: 4 as const };

function note(id: string, pitch: number | null, beats: number): NoteEvent {
  return { id, pitch, duration: rational(beats * 2, 2) };
}

function measure(id: string, chord: string, notes: readonly NoteEvent[]): PracticeMeasure {
  return { id, chord, notes, lyric: "" };
}

function hintIds(notes: readonly NoteEvent[], chord = "C"): string[] {
  return getPracticeHarmonyHints(notes, chord, commonTime).map((hint) => hint.noteId);
}

describe("화음 조언의 비화성음과 마디 경계 검증", () => {
  it("화음음 사이를 약박에서 순차적으로 잇는 음은 길이만으로 불안정하다고 하지 않는다", () => {
    const notes = [note("c", 60, 1), note("passing-d", 62, 1), note("e", 64, 2)];
    expect(hintIds(notes)).toEqual([]);
  });

  it("약박 이웃음이 원래 화음음으로 돌아오면 불필요한 변경을 권하지 않는다", () => {
    const notes = [note("e1", 64, 1), note("neighbour-f", 65, 1), note("e2", 64, 2)];
    expect(hintIds(notes)).toEqual([]);
  });

  it("임시표가 있는 화음음 사이의 순차 경과음도 바르게 인정한다", () => {
    const notes = [
      { ...note("f-sharp", 66, 1), accidental: "sharp" as const },
      { ...note("passing-g-sharp", 68, 1), accidental: "sharp" as const },
      note("a", 69, 2)
    ];
    expect(hintIds(notes, "D")).toEqual([]);
  });

  it("플랫으로 적힌 이웃음이 화음음으로 되돌아오면 틀린 음이라고 하지 않는다", () => {
    const notes = [
      note("a1", 69, 1),
      { ...note("neighbour-b-flat", 70, 1), accidental: "flat" as const },
      note("a2", 69, 2)
    ];
    expect(hintIds(notes, "F")).toEqual([]);
  });

  it("복합박자의 강박이라도 준비와 해결이 분명한 순차 진행을 틀린 음으로 단정하지 않는다", () => {
    const notes = [note("c", 60, 1.5), note("passing-d", 62, 1), note("e", 64, 0.5)];
    expect(getPracticeHarmonyHints(notes, "C", { beats: 6, beatUnit: 8 })).toEqual([]);
  });

  it("연속된 두 비화성음이 실제 화음음 사이를 한 방향으로 이으면 경과 진행으로 인정한다", () => {
    const notes = [note("g", 67, 1), note("a", 69, 0.5), note("b", 71, 0.5), note("c", 72, 2)];
    expect(hintIds(notes)).toEqual([]);
  });

  it("마디 끝의 비화성음이 다음 마디의 실제 화음음으로 순차 해결되면 끝맺음 경고를 하지 않는다", () => {
    const notes = [note("c", 60, 3), note("passing-d", 62, 1)];
    const nextMeasure = measure("next", "C", [note("e", 64, 4)]);
    expect(getPracticeHarmonyHints(notes, "C", commonTime, { nextMeasure, isFinalMeasure: false })).toEqual([]);
  });

  it("아직 채우지 않은 마디 끝에서 다음 마디로 음이 곧바로 이어진다고 가정하지 않는다", () => {
    const notes = [note("c", 60, 3), note("d", 62, 0.5)];
    const nextMeasure = measure("next", "C", [note("e", 64, 4)]);
    const hints = getPracticeHarmonyHints(notes, "C", commonTime, { nextMeasure, isFinalMeasure: false });
    expect(hints.map((hint) => hint.noteId)).toContain("d");
  });

  it("다음 음이 비화성음이면 순차 진행이라는 이유만으로 경과음이라고 단정하지 않는다", () => {
    const notes = [note("c", 60, 1.5), note("d", 62, 0.5), note("eb", 63, 2)];
    expect(hintIds(notes)).toContain("d");
  });

  it("이전 음이 비화성음이면 순차 진행이라는 이유만으로 경과음이라고 단정하지 않는다", () => {
    const notes = [note("eb", 63, 1.5), note("f", 65, 0.5), note("g", 67, 2)];
    expect(hintIds(notes)).toContain("f");
  });

  it("쉼표 뒤나 쉼표 앞의 음을 연결된 경과음으로 오인하지 않는다", () => {
    const afterRest = [note("rest", null, 1.5), note("d", 62, 0.5), note("e", 64, 2)];
    const beforeRest = [note("c", 60, 1.5), note("d", 62, 0.5), note("rest", null, 2)];
    expect(hintIds(afterRest)).toContain("d");
    expect(hintIds(beforeRest)).toContain("d");
  });

  it("짧은 음이라도 화음음에서 도약해 떠나는 비화성음은 놓치지 않는다", () => {
    const notes = [note("c", 60, 1.5), note("a", 69, 0.5), note("g", 67, 2)];
    expect(hintIds(notes)).toContain("a");
  });

  it("두 반음보다 큰 이동을 이웃음의 순차 진행으로 오인하지 않는다", () => {
    const notes = [note("c1", 60, 1.5), note("eb", 63, 0.5), note("c2", 60, 2)];
    expect(hintIds(notes)).toContain("eb");
  });

  it("제보 화면의 약박 라와 짧은 마지막 파를 편안한 화음음으로 오인하지 않는다", () => {
    const notes = [
      note("e1", 64, 1), note("passing-f", 65, 1), note("g", 67, 0.5),
      note("e2", 64, 0.5), note("a", 69, 0.5), note("ending-f", 65, 0.5)
    ];
    const ids = hintIds(notes);
    expect(ids).toEqual(expect.arrayContaining(["a", "ending-f"]));
    expect(ids).not.toContain("passing-f");
  });

  it("제보 화면의 G화음 강박 라와 파는 화음의 음이 아니라고 안내한다", () => {
    const notes = [note("a1", 69, 2), note("f", 65, 0.5), note("e", 64, 0.5), note("a2", 69, 1)];
    const ids = hintIds(notes, "G");
    expect(ids).toEqual(expect.arrayContaining(["a1", "f"]));
  });

  it("다음 마디의 화음음을 약박에서 미리 내고 같은 음으로 이어질 때 선행음을 인정한다", () => {
    const notes = [note("e", 64, 3.5), note("anticipation-f", 65, 0.5)];
    const nextMeasure = measure("next", "F", [note("f", 65, 4)]);
    const hints = getPracticeHarmonyHints(notes, "C", commonTime, { nextMeasure, isFinalMeasure: false });
    expect(hints).toEqual([]);
  });

  it("다음 화음에 들어 있다는 이유만으로 다른 음으로 진행하는 비화성음을 선행음이라고 하지 않는다", () => {
    const notes = [note("e", 64, 3.5), note("ending-f", 65, 0.5)];
    const nextMeasure = measure("next", "F", [note("a", 69, 4)]);
    const hints = getPracticeHarmonyHints(notes, "C", commonTime, { nextMeasure, isFinalMeasure: false });
    expect(hints.map((hint) => hint.noteId)).toContain("ending-f");
  });

  it("다음 마디 첫 쉼표를 건너뛰어 선행음의 연속성을 가정하지 않는다", () => {
    const notes = [note("e", 64, 3.5), note("f", 65, 0.5)];
    const nextMeasure = measure("next", "F", [note("rest", null, 1), note("f", 65, 3)]);
    const hints = getPracticeHarmonyHints(notes, "C", commonTime, { nextMeasure, isFinalMeasure: false });
    expect(hints.map((hint) => hint.noteId)).toContain("f");
  });

  it("이전 화음에서 준비되어 붙임줄로 이어진 음이 아래로 해소되면 계류음을 인정한다", () => {
    const previousMeasure = measure("previous", "F", [{ ...note("prepared-f", 65, 4), linkToNext: true }]);
    const notes = [note("suspension-f", 65, 1), note("resolved-e", 64, 3)];
    const hints = getPracticeHarmonyHints(notes, "C", commonTime, { previousMeasure });
    expect(hints.map((hint) => hint.noteId)).not.toContain("suspension-f");
  });

  it("준비된 음이 위로 순차 해결되는 경우에도 틀린 음으로 단정하지 않는다", () => {
    const previousMeasure = measure("previous", "F", [{ ...note("prepared-f", 65, 4), linkToNext: true }]);
    const notes = [note("prepared-f", 65, 1), note("g", 67, 3)];
    const hints = getPracticeHarmonyHints(notes, "C", commonTime, { previousMeasure });
    expect(hints).toEqual([]);
  });

  it("미완성 이전 마디의 끝음은 다음 마디까지 유지된 준비음이라고 가정하지 않는다", () => {
    const previousMeasure = measure("previous", "F", [{ ...note("f", 65, 1), linkToNext: true }]);
    const notes = [note("f", 65, 1), note("e", 64, 3)];
    const hints = getPracticeHarmonyHints(notes, "C", commonTime, { previousMeasure });
    expect(hints.map((hint) => hint.noteId)).toContain("f");
  });

  it("이전 마디 마지막 쉼표를 건너뛰어 계류음의 준비를 가정하지 않는다", () => {
    const previousMeasure = measure("previous", "F", [note("f", 65, 3), note("rest", null, 1)]);
    const notes = [note("f", 65, 1), note("e", 64, 3)];
    const hints = getPracticeHarmonyHints(notes, "C", commonTime, { previousMeasure });
    expect(hints.map((hint) => hint.noteId)).toContain("f");
  });

  it.each([
    { chord: "D", pitch: 65, resolution: 62, expected: 66, classes: [2, 6, 9] },
    { chord: "Bb", pitch: 71, resolution: 65, expected: 70, classes: [10, 2, 5] }
  ])("$chord 화음의 제안에 필요한 임시표 음을 포함한다", ({ chord, pitch, resolution, expected, classes }) => {
    const notes = [note("non-chord", pitch, 1), note("resolved", resolution, 3)];
    const hint = getPracticeHarmonyHints(notes, chord, commonTime)[0];
    expect(hint.noteId).toBe("non-chord");
    expect(hint.suggestedPitches).toContain(expected);
    expect(hint.suggestedPitches.every((candidate) => classes.includes(candidate % 12))).toBe(true);
  });

  it("화음음끼리의 큰 도약은 화음 충돌이 아니라 부르기 편한 움직임 조언으로 구분한다", () => {
    const hints = getPracticeHarmonyHints([note("c1", 60, 2), note("c2", 72, 2)], "C", commonTime);
    expect(hints).toHaveLength(1);
    expect(hints[0].kind).toBe("leap");
  });

  it("중간 마디의 끝을 곡 전체의 종지로 단정하지 않는다", () => {
    const notes = [note("c", 60, 1), note("e", 64, 1), note("g", 67, 1), note("b", 71, 1)];
    const hints = getPracticeHarmonyHints(notes, "C", commonTime, { isFinalMeasure: false });
    expect(hints.some((hint) => hint.kind === "ending")).toBe(false);
    expect(hints.some((hint) => hint.message.includes("편안하게 마치고 싶다면"))).toBe(false);
  });

  it("화음음이라는 사실과 모든 곡이 편안하게 들린다는 단정을 구별한다", () => {
    const notes = [note("c", 60, 1), note("e", 64, 1), note("g", 67, 2)];
    const summary = getPracticeHarmonySummary(notes, "C", commonTime);
    expect(summary).toContain("화음");
    expect(summary).not.toContain("화음과 편안하게 어울려요");
  });

  it.each([
    { chord: "G7", pitches: [67, 71, 65] },
    { chord: "Bdim", pitches: [62, 65, 71] },
    { chord: "Csus4", pitches: [60, 65, 67] }
  ])("$chord의 구성음만 있어도 화음 자체의 긴장과 색채를 구별한다", ({ chord, pitches }) => {
    const notes = [note("first", pitches[0], 1), note("second", pitches[1], 1), note("third", pitches[2], 2)];
    const summary = getPracticeHarmonySummary(notes, chord, commonTime);
    expect(summary).toMatch(/긴장|색채/);
    expect(summary).not.toContain("화음과 편안하게 어울려요");
  });
});

import { describe, expect, it } from "vitest";
import { changeCompositionHarmony, emptyComposition, resizeComposition, shortenedMeasuresContainWork } from "./composerDraft";
import { findHarmonyPreset } from "./harmonyPresets";
import { validateMeasure } from "./meter";

const preset = findHarmonyPreset("H001");

function composed() {
  const measures = emptyComposition(preset, 8);
  measures[0] = {
    ...measures[0], candidateId: "custom", candidateName: "내 가락",
    notes: [{ id: "my-note", pitch: 64, duration: { numerator: 4, denominator: 1 }, lyric: "봄" }],
    effects: [{ id: "bird", effectId: "bird", offsetBeats: 0 }]
  };
  return measures;
}

describe("만든 음악을 보존하는 곡 설정", () => {
  it("마디를 늘려도 음표·가사·효과음은 그대로이고 뒤에만 빈 마디를 더한다", () => {
    const original = composed();
    const extended = resizeComposition(original, preset, 12);
    expect(extended).toHaveLength(12);
    original.forEach((measure, index) => expect(extended[index]).toBe(measure));
    expect(extended.slice(8).every((measure) => measure.notes === null)).toBe(true);
  });

  it("끝 마디에 실제 내용이 있을 때만 줄이기 확인을 요구한다", () => {
    const original = resizeComposition(composed(), preset, 12);
    expect(shortenedMeasuresContainWork(original, 8)).toBe(false);
    original[11] = { ...original[11], effects: [{ id: "last", effectId: "bird", offsetBeats: 0 }] };
    expect(shortenedMeasuresContainWork(original, 8)).toBe(true);
    expect(resizeComposition(original, preset, 8)[0]).toBe(original[0]);
    expect(original).toHaveLength(12);
  });

  it("다른 화음으로 바꾸어도 만든 가락과 가사, 효과음, 조표는 보존한다", () => {
    const original = composed();
    original[0].keyFifths = 1;
    const nextPreset = findHarmonyPreset("H002");
    const changed = changeCompositionHarmony(original, nextPreset);
    expect(changed[0].notes).toBe(original[0].notes);
    expect(changed[0].effects).toBe(original[0].effects);
    expect(changed[0].keyFifths).toBe(1);
    expect(changed[0].chords).toEqual(nextPreset.bars[0]);
    expect(changed[0].story).toEqual(nextPreset.roles[0]);
  });

  it("박자 변경 뒤에도 기존 음을 지우지 않고 맞지 않는 길이를 감지할 수 있다", () => {
    const notes = composed()[0].notes!;
    expect(validateMeasure(notes, { beats: 4, beatUnit: 4 }).state).toBe("exact");
    expect(validateMeasure(notes, { beats: 3, beatUnit: 4 }).state).toBe("over");
    expect(notes[0].lyric).toBe("봄");
    expect(notes[0].duration.numerator).toBe(4);
  });
});

// @vitest-environment jsdom

import { act } from "react";
import { describe, expect, it } from "vitest";
import { rational } from "../music/rational";
import { emptyPracticeDraft, readPracticeDraft } from "./practiceStorage";
import { current, fullDraft, mount, setupPracticeStateTests } from "./usePracticeState.test.helpers";

setupPracticeStateTests();

describe("리듬 만들기 없이 시작하는 가락 연습", () => {
  it("빈 악보에서 선택한 마디를 유지하며 가락 단계로 들어가고 음표를 자동으로 만들지 않는다", () => {
    mount();
    act(() => { current.selectMeasure(1); });
    const before = current.draft;
    act(() => { current.goToMelody(); });
    expect(current.step).toBe("melody");
    expect(current.editingStep).toBe("melody");
    expect(current.activeScoreIndex).toBe(0);
    expect(current.activeIndex).toBe(1);
    expect(current.selectedNoteId).toBeNull();
    expect(current.draft).toBe(before);
    expect(current.draft.measures.every((measure) => measure.notes.length === 0)).toBe(true);
    expect(current.complete).toBe(false);
    expect(current.notice).toContain("나만의 가락");
    expect(current.notice).not.toContain("완성");
    expect(readPracticeDraft()).toEqual(before);
  });

  it("부족하거나 초과한 박자와 원래 음높이·임시표·가사·쉼표를 그대로 보존한다", () => {
    const draft = fullDraft();
    draft.measures[0].notes = [
      { id: "opening-rest", pitch: null, duration: rational(1, 4) },
      { id: "opening-sharp", pitch: 61, accidental: "sharp", duration: rational(1, 4), lyric: "안" }
    ];
    draft.measures[1].notes = [
      { id: "overflow-flat", pitch: 63, accidental: "flat", duration: rational(3), dotted: true, lyric: "친" },
      { id: "overflow-sound", pitch: 67, duration: rational(2), lyric: "구" }
    ];
    mount(draft);
    const before = current.draft;
    act(() => { current.goToMelody(); });
    expect(current.step).toBe("melody");
    expect(current.draft).toBe(before);
    expect(current.validations.map((validation) => validation.state)).toEqual(["short", "over"]);
    expect(current.selectedNoteId).toBe("opening-sharp");
    expect(current.complete).toBe(false);
    expect(readPracticeDraft()).toEqual(before);
  });

  it("빈 추가 악보가 있어도 첫 악보의 같은 마디로 들어가며 모든 악보의 작업을 보존한다", () => {
    mount(fullDraft());
    act(() => {
      current.addRhythmScore();
      current.setLyric("쿵짝", 1, 1);
      current.addNote(0.25, 60, undefined, 1, 1);
      current.addNote(0.25, null, undefined, 1, 1);
      current.addRhythmScore();
      current.selectMeasure(1, 2);
    });
    const before = current.draft;
    act(() => { current.goToMelody(); });
    expect(current.step).toBe("melody");
    expect(current.activeScoreIndex).toBe(0);
    expect(current.activeIndex).toBe(1);
    expect(current.selectedNoteId).toBe("second-a");
    expect(current.draft).toBe(before);
    expect(current.draft.rhythmLayers[0].measures[1].notes.map((note) => note.lyric)).toEqual(["쿵", undefined]);
    expect(current.draft.rhythmLayers[1].measures.every((measure) => measure.notes.length === 0)).toBe(true);
    expect(current.complete).toBe(false);
  });

  it("모든 악보가 빈 상태에서도 추가 악보의 같은 마디를 첫 악보에 맞춰 가락을 시작한다", () => {
    mount();
    act(() => {
      current.addRhythmScore();
      current.addRhythmScore();
      current.selectMeasure(1, 2);
    });
    const before = current.draft;
    act(() => { current.goToMelody(); });
    expect(current.step).toBe("melody");
    expect(current.activeScoreIndex).toBe(0);
    expect(current.activeIndex).toBe(1);
    expect(current.selectedNoteId).toBeNull();
    expect(current.draft).toBe(before);
    expect(current.complete).toBe(false);
  });

  it("가락과 리듬 단계를 왕복해도 직접 만든 음표와 가사를 유지한다", () => {
    mount();
    act(() => { current.goToMelody(); });
    act(() => {
      current.setLyric("반짝");
      current.addNote(0.25, 60);
      current.addNote(0.25, null);
      current.addNote(0.5, 67);
    });
    const firstNote = current.active.notes[0].id;
    act(() => { current.setPitch(firstNote, 61); });
    const before = current.draft;
    for (let iteration = 0; iteration < 3; iteration += 1) {
      act(() => { current.setStep("rhythm"); });
      expect(current.draft).toBe(before);
      act(() => { current.goToMelody(); });
      expect(current.step).toBe("melody");
      expect(current.draft).toBe(before);
      expect(current.selectedNoteId).toBe(firstNote);
    }
    expect(current.active.notes.map((note) => note.pitch)).toEqual([61, null, 67]);
    expect(current.active.notes.map((note) => note.lyric)).toEqual(["반", undefined, "짝"]);
    expect(readPracticeDraft()).toEqual(before);
    expect(current.complete).toBe(false);
  });

  it("빈 악보에서 가락만 직접 만들어 모든 마디가 정확해지면 저장 가능한 상태가 된다", () => {
    mount();
    act(() => { current.goToMelody(); });
    act(() => {
      current.configure({ title: "처음부터 가락", melodyInstrumentId: "flute" });
      current.setLyric("안녕", 0);
      current.addNote(2, 60, undefined, 0);
      current.addNote(2, 64, undefined, 0);
    });
    expect(current.step).toBe("melody");
    expect(current.validations.map((validation) => validation.state)).toEqual(["exact", "short"]);
    expect(current.complete).toBe(false);
    act(() => {
      current.setLyric("친구", 1);
      current.addNote(3, 67, true, 1);
      current.addNote(1, 72, undefined, 1);
    });
    expect(current.step).toBe("melody");
    expect(current.complete).toBe(true);
    expect(current.saved).toBe(true);
    expect(current.draft.measures.map((measure) => measure.notes.map((note) => note.lyric))).toEqual([["안", "녕"], ["친", "구"]]);
    expect(readPracticeDraft()).toEqual(current.draft);
    expect(readPracticeDraft().title).toBe("처음부터 가락");
    expect(readPracticeDraft().melodyInstrumentId).toBe("flute");
  });

  it("가락 단계 진입과 별개로 모든 마디의 정확한 박자와 실제 소리가 있어야 완성으로 인정한다", () => {
    mount(emptyPracticeDraft());
    act(() => {
      current.fillRests(0);
      current.fillRests(1);
      current.goToMelody();
    });
    expect(current.step).toBe("melody");
    expect(current.validations.every((validation) => validation.state === "exact")).toBe(true);
    expect(current.complete).toBe(false);
    const firstRest = current.draft.measures[0].notes[0].id;
    act(() => {
      current.deleteNote(firstRest);
      current.addNote(4, 65, undefined, 0);
    });
    expect(current.complete).toBe(true);
    act(() => { current.addRhythmScore(); });
    expect(current.complete).toBe(false);
    act(() => {
      current.fillRests(0, 1);
      current.fillRests(1, 1);
      current.goToMelody();
    });
    expect(current.complete).toBe(true);
    act(() => { current.addNote(0.25, 60, undefined, 1); });
    expect(current.step).toBe("melody");
    expect(current.validations[1].state).toBe("over");
    expect(current.complete).toBe(false);
  });
});

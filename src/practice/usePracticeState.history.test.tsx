import { act } from "react";
import { describe, expect, it } from "vitest";
import { toNumber } from "../music/rational";
import { readPracticeDraft } from "./practiceStorage";
import { current, fullDraft, mount, setupPracticeStateTests } from "./usePracticeState.test.helpers";

setupPracticeStateTests();

describe("연습 입력 위치와 실수 복구", () => {
  it("클릭한 시작 박자 앞을 쉼표로 채우고 음표·가사 전체를 한 번에 되돌린다", () => {
    mount();
    act(() => current.setLyric("별"));
    const before = current.draft;
    act(() => current.addNote(0.5, 67, undefined, 0, 0, 2.5));
    const placed = current.draft;
    expect(placed.measures[0].notes.map((note) => [note.pitch, toNumber(note.duration)])).toEqual([[null, 2], [null, 0.5], [67, 0.5]]);
    expect(placed.measures[0].notes.at(-1)?.lyric).toBe("별");
    expect(current.notice).toContain("앞의 빈 박자는 쉼표");
    act(() => current.undo());
    expect(current.draft).toEqual(before);
    expect(readPracticeDraft()).toEqual(before);
    act(() => current.redo());
    expect(current.draft).toEqual(placed);
    expect(readPracticeDraft()).toEqual(placed);
  });

  it("이미 채운 위치와 마디 밖에는 새 음표를 넣지 않는다", () => {
    mount();
    act(() => current.addNote(1, 60));
    const before = current.draft;
    act(() => {
      current.addNote(1, 67, undefined, 0, 0, 0.5);
      current.addNote(1, 67, undefined, 0, 0, 4);
      current.addNote(1, 67, undefined, 0, 0, NaN);
    });
    expect(current.draft).toEqual(before);
  });

  it("삭제한 음표의 높이·길이·가사를 복구하고 새 편집은 다시 하기 기록을 지운다", () => {
    mount(fullDraft());
    const before = current.draft;
    act(() => current.deleteNote("first-a"));
    expect(current.canUndo).toBe(true);
    act(() => current.undo());
    expect(current.draft).toEqual(before);
    expect(current.canRedo).toBe(true);
    act(() => current.setPitch("first-a", 62));
    expect(current.canRedo).toBe(false);
    act(() => current.redo());
    expect(current.draft.measures[0].notes[0].pitch).toBe(62);
  });

  it("악보 추가·설정·화음 변경을 되돌리고 같은 설정은 기록하지 않는다", () => {
    mount(fullDraft());
    const snapshots = [current.draft];
    act(() => current.addRhythmScore());
    snapshots.push(current.draft);
    act(() => current.configure({ bpm: 130 }));
    snapshots.push(current.draft);
    act(() => current.setChord("F", 0, 0));
    snapshots.push(current.draft);
    act(() => current.configure({ bpm: 130 }));
    act(() => current.undo());
    expect(current.draft).toEqual(snapshots[2]);
    act(() => current.undo());
    expect(current.draft).toEqual(snapshots[1]);
    act(() => current.undo());
    expect(current.draft).toEqual(snapshots[0]);
    expect(current.activeScoreIndex).toBe(0);
    expect(current.canUndo).toBe(false);
  });

  it("마디 축소 후 되돌리면 뒤쪽 가사와 음표를 복구한다", () => {
    mount(fullDraft());
    const before = current.draft;
    act(() => current.resize(1));
    expect(current.draft.measures).toHaveLength(1);
    act(() => current.undo());
    expect(current.draft).toEqual(before);
    act(() => current.redo());
    expect(current.draft.measures).toHaveLength(1);
    expect(current.activeIndex).toBe(0);
  });

  it("처음 고르는 모드는 빈 모드로 되돌리지 않고 기록은 60번으로 제한한다", () => {
    mount(undefined, null);
    act(() => current.selectCreationMode("rhythm"));
    expect(current.canUndo).toBe(false);
    act(() => {
      for (let index = 1; index <= 70; index += 1) current.configure({ title: `연습 ${index}` });
      for (let index = 0; index < 70; index += 1) current.undo();
    });
    expect(current.draft.title).toBe("연습 10");
    expect(current.canUndo).toBe(false);
    expect(current.canRedo).toBe(true);
  });
});

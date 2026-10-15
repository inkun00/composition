import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { emptyPracticeDraft, readPracticeDraft } from "./practiceStorage";
import { current, fullDraft, mount, setupPracticeStateTests } from "./usePracticeState.test.helpers";

setupPracticeStateTests();

describe("연습 상태 새로 시작", () => {
  it("취소하면 선택한 악보·음표·입력 방식과 저장 내용이 그대로 남는다", () => {
    mount(fullDraft());
    act(() => {
      current.addRhythmScore();
      current.addNote(1, 60, undefined, 1, 1);
      current.setInputMode("score");
    });
    const previous = current.draft;
    const selected = current.selectedNoteId;
    vi.mocked(window.confirm).mockReturnValue(false);
    let restarted = true;

    act(() => { restarted = current.startNew(); });

    expect(restarted).toBe(false);
    expect(current.draft).toBe(previous);
    expect(current.activeIndex).toBe(1);
    expect(current.activeScoreIndex).toBe(1);
    expect(current.selectedNoteId).toBe(selected);
    expect(current.inputMode).toBe("score");
    expect(readPracticeDraft()).toEqual(previous);
  });

  it("모든 상태와 저장을 비우고 같은 이벤트의 다음 입력도 첫 악보 첫 마디에 넣는다", () => {
    mount(fullDraft());
    act(() => {
      current.resize(4);
      current.addRhythmScore();
      current.addNote(1, 60, undefined, 3, 1);
      current.setInputMode("score");
    });
    let restarted = false;

    act(() => { restarted = current.startNew(); });

    expect(restarted).toBe(true);
    expect(current.draft).toEqual(emptyPracticeDraft());
    expect(readPracticeDraft()).toEqual(emptyPracticeDraft());
    expect(current.activeIndex).toBe(0);
    expect(current.activeScoreIndex).toBe(0);
    expect(current.selectedNoteId).toBeNull();
    expect(current.inputMode).toBe("grid");
    expect(current.step).toBe("rhythm");
    expect(current.notice).toBe("");
    expect(current.saved).toBe(true);

    act(() => {
      current.selectCreationMode("melody");
      current.addNote(1, 67);
    });

    expect(current.draft.measures[0].notes).toHaveLength(1);
    expect(current.draft.measures[0].notes[0].pitch).toBe(67);
    expect(current.draft.measures[1].notes).toEqual([]);
    expect(current.draft.rhythmLayers).toEqual([]);
    expect(current.activeScoreIndex).toBe(0);
    expect(current.step).toBe("melody");
    expect(readPracticeDraft()).toEqual(current.draft);
  });
});

// @vitest-environment jsdom

import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { rational } from "../music/rational";
import { emptyPracticeDraft, readPracticeDraft } from "./practiceStorage";
import { current, fullDraft, mount, setupPracticeStateTests } from "./usePracticeState.test.helpers";

setupPracticeStateTests();

describe("처음에 고르는 세 가지 연습 모드", () => {
  it("새 작업은 모드를 선택하기 전 상태로 시작하고 선택한 모드를 저장한다", () => {
    mount(emptyPracticeDraft(), null);
    expect(current.draft.mode).toBeNull();
    expect(current.canGoToMelody).toBe(false);
    act(() => { current.selectCreationMode("melody"); });
    expect(current.draft.mode).toBe("melody");
    expect(current.step).toBe("melody");
    expect(current.selectedNoteId).toBeNull();
    expect(readPracticeDraft().mode).toBe("melody");
  });

  it("리듬만들기는 완성된 리듬이어도 가락 단계로 가지 않는다", () => {
    mount(fullDraft(), "rhythm");
    expect(current.complete).toBe(true);
    expect(current.canGoToMelody).toBe(false);
    act(() => {
      current.goToMelody();
      current.setStep("melody");
    });
    expect(current.step).toBe("rhythm");
    act(() => {
      current.setDuration("first-a", 1);
      current.fillRests(0);
    });
    expect(current.complete).toBe(true);
    expect(current.active.notes.at(-1)?.pitch).toBeNull();
  });

  it("가락만들기는 저장된 모드로 곧바로 시작하고 빈 악보에 음표를 넣는다", () => {
    mount(emptyPracticeDraft(), "melody");
    expect(current.step).toBe("melody");
    expect(current.editingStep).toBe("melody");
    expect(current.canGoToMelody).toBe(true);
    act(() => {
      current.addNote(0.25, 67, undefined, 0);
      current.addNote(0.25, null, undefined, 0);
    });
    expect(current.draft.measures[0].notes.map((note) => note.pitch)).toEqual([67, null]);
    act(() => { current.setDuration(current.active.notes[0].id, 0.5); });
    expect(current.draft.measures[0].notes[0].duration).toEqual(rational(1, 2));
    act(() => { current.setStep("rhythm"); });
    expect(current.step).toBe("melody");
  });

  it("연결 모드의 가락 단계에서는 만든 리듬을 고정하고 음높이와 가사만 수정한다", () => {
    mount(fullDraft(), "rhythm-melody");
    const original = current.draft.measures;
    expect(current.canGoToMelody).toBe(true);
    act(() => {
      current.goToMelody();
      current.addNote(1, 65);
      current.setDuration("first-a", 1);
      current.deleteNote("first-b");
      current.fillRests();
      current.generateRhythm();
      current.setMeter({ beats: 3, beatUnit: 4 });
      current.resize(3);
      current.addRhythmScore();
    });
    expect(current.step).toBe("melody");
    expect(current.draft.measures).toEqual(original);
    expect(current.draft.meter).toEqual({ beats: 4, beatUnit: 4 });
    expect(current.draft.rhythmLayers).toEqual([]);
    act(() => {
      current.setPitch("first-a", 69);
      current.setNoteLyric("first-a", "햇");
    });
    expect(current.draft.measures[0].notes[0]).toMatchObject({ pitch: 69, lyric: "햇", duration: rational(2) });
    expect(current.draft.measures[0].notes.map((note) => note.id)).toEqual(original[0].notes.map((note) => note.id));
    expect(current.complete).toBe(true);
    act(() => {
      current.setStep("rhythm");
      current.setDuration("first-a", 1);
      current.fillRests(0);
    });
    expect(current.step).toBe("rhythm");
    expect(current.draft.measures[0].notes[0].duration).toEqual(rational(1));
    expect(current.complete).toBe(true);
  });

  it("모드를 바꿔도 모든 작업을 보존하고 가락만들기는 숨긴 리듬 악보를 완성 조건에서 제외한다", () => {
    mount(fullDraft());
    act(() => {
      current.addRhythmScore();
      current.setLyric("쿵짝", 1, 1);
      current.addNote(1, 60, undefined, 1, 1);
      current.selectMeasure(1, 1);
    });
    const original = current.draft;
    expect(current.complete).toBe(false);
    expect(current.canGoToMelody).toBe(false);
    act(() => { current.selectCreationMode("melody"); });
    expect(current.activeScoreIndex).toBe(0);
    expect(current.activeIndex).toBe(1);
    expect(current.selectedNoteId).toBe("second-a");
    expect(current.step).toBe("melody");
    expect(current.scores).toHaveLength(1);
    expect(current.complete).toBe(true);
    expect(current.draft.measures).toBe(original.measures);
    expect(current.draft.rhythmLayers).toBe(original.rhythmLayers);
    const currentDraft = current.draft;
    act(() => {
      current.selectMeasure(1, 1);
      current.addRhythmScore();
      current.removeRhythmScore(1);
      current.setRhythmInstrument(0, "beat:clap");
      current.setPitch(original.rhythmLayers[0].measures[1].notes[0].id, 65);
    });
    expect(current.draft).toBe(currentDraft);
    expect(current.activeScoreIndex).toBe(0);
    expect(readPracticeDraft().rhythmLayers[0].measures[1].lyric).toBe("쿵짝");
    act(() => { current.selectCreationMode("rhythm"); });
    expect(current.scores).toHaveLength(2);
    expect(current.step).toBe("rhythm");
    expect(current.complete).toBe(false);
    expect(current.draft.rhythmLayers).toBe(original.rhythmLayers);
  });

  it("가락만들기에서도 마디 수를 줄여 숨긴 리듬 작업이 삭제될 때는 먼저 확인한다", () => {
    mount(emptyPracticeDraft());
    act(() => {
      current.addRhythmScore();
      current.addNote(4, 60, undefined, 1, 1);
      current.selectCreationMode("melody");
    });
    const original = current.draft;
    vi.mocked(window.confirm).mockReturnValue(false);
    act(() => { current.resize(1); });
    expect(window.confirm).toHaveBeenCalledOnce();
    expect(current.draft).toBe(original);
  });
});

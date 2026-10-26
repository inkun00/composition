// @vitest-environment jsdom

import { act } from "react";
import { describe, expect, it } from "vitest";
import { rational } from "../music/rational";
import { buildPracticeTimeline } from "./practiceAudioTimeline";
import { readPracticeDraft } from "./practiceStorage";
import { current, fullDraft, mount, setupPracticeStateTests } from "./usePracticeState.test.helpers";

setupPracticeStateTests();

describe("높은 도 위로 확장한 가락 음역", () => {
  it("빈 가락에 높은 레·솔·두 옥타브 위 도를 넣고 반음 수정한 높이 그대로 저장·재생한다", () => {
    mount(undefined, "melody");
    act(() => {
      current.resize(1);
      current.setLyric("높은별");
      current.addNote(1, 74);
      current.addNote(1, 79);
      current.addNote(2, 84);
    });
    const highestNoteId = current.active.notes[2].id;
    expect(current.active.notes.map((note) => note.pitch)).toEqual([74, 79, 84]);
    expect(current.complete).toBe(true);
    act(() => { current.setPitch(highestNoteId, 83); });
    expect(current.selectedNoteId).toBe(highestNoteId);
    expect(current.active.notes[2]).toMatchObject({
      pitch: 83, accidental: undefined, duration: rational(2), lyric: "별"
    });
    const restored = readPracticeDraft();
    expect(restored.measures[0].notes).toEqual(current.active.notes);
    const timeline = buildPracticeTimeline({ ...restored, mode: "melody", step: "melody" });
    expect(timeline.events.map((event) => event.pitch)).toEqual([74, 79, 83]);
    expect(timeline.events.map((event) => event.startSeconds)).toEqual([0, 0.625, 1.25]);
    expect(timeline.events.map((event) => event.endSeconds)).toEqual([0.625, 1.25, 2.5]);
    expect(current.saved).toBe(true);
  });

  it("리듬을 고정한 가락도 높은 음으로 옮기고 되돌릴 때 음표 길이와 가사를 보존한다", () => {
    mount(fullDraft());
    const original = current.draft.measures;
    act(() => {
      current.goToMelody();
      current.setInputMode("score");
      current.setPitch("first-a", 74);
      current.setPitch("first-b", 79);
      current.setPitch("second-a", 83);
      current.setPitch("second-b", 84);
    });
    const expectedPitches = [[74, 79], [83, 84]];
    expect(current.draft.measures.map((measure) => measure.notes.map((note) => note.pitch))).toEqual(expectedPitches);
    const rhythmAndLyrics = (measures: typeof original) => measures.map((measure) => measure.notes.map((note) => ({
      duration: note.duration, dotted: note.dotted, lyric: note.lyric
    })));
    expect(rhythmAndLyrics(current.draft.measures)).toEqual(rhythmAndLyrics(original));
    expect(current.activeIndex).toBe(1);
    expect(current.selectedNoteId).toBe("second-b");
    expect(current.complete).toBe(true);
    const restored = readPracticeDraft();
    expect(restored.measures).toEqual(current.draft.measures);
    const timeline = buildPracticeTimeline({ ...restored, mode: "rhythm-melody", step: "melody" });
    expect(timeline.events.map((event) => event.pitch)).toEqual(expectedPitches.flat());
    act(() => { current.undo(); });
    expect(current.draft.measures[1].notes[1].pitch).toBe(72);
    act(() => { current.redo(); });
    expect(current.draft.measures[1].notes[1].pitch).toBe(84);
    expect(readPracticeDraft().measures).toEqual(restored.measures);
  });
});

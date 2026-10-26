// @vitest-environment jsdom

import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { rational } from "../music/rational";
import { buildPracticeTimeline } from "./practiceAudioTimeline";
import { emptyPracticeDraft, readPracticeDraft } from "./practiceStorage";
import { current, fullDraft, mount, setupPracticeStateTests } from "./usePracticeState.test.helpers";

setupPracticeStateTests();

describe("리듬을 만들고 가락으로 이어 가는 연습 상태", () => {
  it("앞 화음을 바꾸면 뒤 마디의 후보 밖 화음만 조정하고 가락·리듬·가사는 보존한다", () => {
    mount(fullDraft());
    act(() => { current.resize(4); });
    const before = current.draft.measures;
    act(() => { current.setChord("Dm", 0); });
    expect(current.draft.measures.map((measure) => measure.chord)).toEqual(["Dm", "G", "C", "C"]);
    expect(current.draft.measures.map((measure) => measure.notes)).toEqual(before.map((measure) => measure.notes));
    expect(current.draft.measures.map((measure) => measure.lyric)).toEqual(before.map((measure) => measure.lyric));
    expect(current.notice).toContain("뒤쪽 1개 마디");
    expect(readPracticeDraft().measures.map((measure) => measure.chord)).toEqual(["Dm", "G", "C", "C"]);
    const updated = current.draft;
    act(() => { current.setChord("F", 1); });
    expect(current.draft).toBe(updated);
    expect(current.notice).toContain("앞 마디");
  });

  it("같은 이벤트에서 고른 새 화음을 다음 마디 후보 검증에 사용한다", () => {
    mount(fullDraft());
    act(() => {
      current.setChord("Dm7", 0);
      current.setChord("G7", 1);
      current.resize(3);
      current.setChord("Cmaj7", 2);
    });
    expect(current.draft.measures.map((measure) => measure.chord)).toEqual(["Dm7", "G7", "Cmaj7"]);
    expect(current.draft.measures[0].notes.map((note) => note.lyric)).toEqual(["안", "녕"]);
  });

  it("마디를 늘릴 때 마지막 화음 뒤에 연결 가능한 기본 화음을 넣는다", () => {
    mount();
    act(() => {
      current.resize(1);
      current.setChord("Em7", 0);
      current.resize(4);
    });
    expect(current.draft.measures.map((measure) => measure.chord)).toEqual(["Em7", "Am", "C", "C"]);
    expect(current.draft.measures.every((measure) => measure.notes.length === 0)).toBe(true);
  });

  it("추가 리듬 악보의 화음 검증도 독립적이며 첫 악보를 변경하지 않는다", () => {
    mount(fullDraft());
    const primary = current.draft.measures;
    act(() => {
      current.addRhythmScore();
      current.setChord("Dm", 0, 1);
    });
    expect(current.draft.measures).toBe(primary);
    expect(current.draft.rhythmLayers[0].measures.map((measure) => measure.chord)).toEqual(["Dm", "G"]);
    const previous = current.draft;
    act(() => {
      current.setChord("F", 1, 1);
      current.setChord("C", -1, 1);
      current.setChord("C", 0, 99);
    });
    expect(current.draft).toBe(previous);
  });

  it("저장된 작업을 복원하고 편집한 가사와 설정을 자동 저장한다", () => {
    mount(fullDraft());
    expect(current.active.lyric).toBe("안녕");
    expect(current.complete).toBe(true);
    act(() => { current.setLyric("햇 살!"); });
    act(() => { current.configure({ title: "햇살 연습", bpm: 120, rhythmInstrumentId: "beat:clap" }); });
    const stored = readPracticeDraft();
    expect(stored.title).toBe("햇살 연습");
    expect(stored.bpm).toBe(120);
    expect(stored.rhythmInstrumentId).toBe("beat:clap");
    expect(stored.measures[0].lyric).toBe("햇 살!");
    expect(stored.measures[0].notes.map((note) => note.lyric)).toEqual(["햇", "살"]);
    expect(current.saved).toBe(true);
  });

  it("박자를 바꿔도 음표와 가사는 보존하고 마디 검증만 다시 계산한다", () => {
    mount(fullDraft());
    const previous = current.draft.measures;
    act(() => { current.setMeter({ beats: 3, beatUnit: 4 }); });
    expect(current.draft.measures).toEqual(previous);
    expect(current.validations.map((validation) => validation.state)).toEqual(["over", "over"]);
    expect(current.complete).toBe(false);
    expect(current.notice).toContain("음표는 그대로");
    act(() => { current.setMeter({ beats: 4, beatUnit: 4 }); });
    expect(current.complete).toBe(true);
    expect(readPracticeDraft().measures.map((measure) => measure.lyric)).toEqual(["안녕", "친구"]);
  });

  it("마디를 늘릴 때 기존 작업을 보존하고 마디 ID를 중복시키지 않는다", () => {
    mount();
    act(() => { current.setLyric("안녕"); });
    act(() => { current.generateRhythm(); });
    const first = current.draft.measures[0];
    act(() => { current.resize(4); });
    expect(current.draft.measures).toHaveLength(4);
    expect(current.draft.measures[0]).toEqual(first);
    expect(current.draft.measures.slice(2).every((measure) => measure.notes.length === 0 && measure.lyric === "")).toBe(true);
    expect(new Set(current.draft.measures.map((measure) => measure.id)).size).toBe(4);
  });

  it("뒤쪽 마디 삭제를 취소하면 가사, 음표와 선택한 마디를 모두 유지한다", () => {
    mount(fullDraft());
    act(() => { current.selectMeasure(1); });
    act(() => { current.setSelectedNoteId("second-a"); });
    const previous = current.draft.measures;
    vi.mocked(window.confirm).mockReturnValue(false);
    act(() => { current.resize(1); });
    expect(window.confirm).toHaveBeenCalledOnce();
    expect(current.draft.measures).toEqual(previous);
    expect(current.activeIndex).toBe(1);
    expect(current.selectedNoteId).toBe("second-a");
  });

  it("뒤쪽 마디 삭제를 승인하면 남은 마디의 작업을 유지하고 선택 범위를 맞춘다", () => {
    mount(fullDraft());
    const first = current.draft.measures[0];
    act(() => { current.selectMeasure(1); });
    act(() => { current.resize(1); });
    expect(current.draft.measures).toEqual([first]);
    expect(current.activeIndex).toBe(0);
    expect(current.selectedNoteId).toBeNull();
    expect(readPracticeDraft().measures).toHaveLength(1);
  });

  it("연결 모드에서는 부족한 리듬을 먼저 채운 후에만 가락 만들기로 넘어간다", () => {
    const draft = fullDraft();
    draft.measures[1].notes = [{ id: "short", pitch: 67, duration: rational(1) }];
    mount(draft);
    act(() => { current.selectMeasure(1); });
    const previous = current.draft;
    act(() => { current.goToMelody(); });
    expect(current.step).toBe("rhythm");
    expect(current.activeIndex).toBe(1);
    expect(current.draft).toBe(previous);
    expect(current.selectedNoteId).toBeNull();
    expect(current.complete).toBe(false);
    act(() => { current.addNote(3, 72, true); });
    expect(current.complete).toBe(true);
    act(() => { current.goToMelody(); });
    expect(current.step).toBe("melody");
    expect(current.active.notes.some((note) => note.id === current.selectedNoteId && note.pitch !== null)).toBe(true);
  });

  it("연결 모드에서는 쉼표만으로 채운 리듬을 가락 단계로 넘기지 않는다", () => {
    const draft = emptyPracticeDraft();
    draft.measures = [{ id: "rest-only", notes: [{ id: "rest", pitch: null, duration: rational(4) }], lyric: "", chord: "C" }];
    mount(draft);
    expect(current.validations[0].state).toBe("exact");
    expect(current.complete).toBe(false);
    const previous = current.draft;
    act(() => { current.goToMelody(); });
    expect(current.step).toBe("rhythm");
    expect(current.selectedNoteId).toBeNull();
    expect(current.draft).toBe(previous);
    expect(current.complete).toBe(false);
  });

  it("리듬에서 만든 음표의 길이, 쉼표, 가사와 순서를 그대로 가락의 기본 음표로 사용한다", () => {
    const draft = fullDraft();
    draft.measures[0].notes = [
      { id: "rhythm-a", pitch: 60, duration: rational(1, 2), lyric: "안" },
      { id: "rhythm-rest", pitch: null, duration: rational(1, 2) },
      { id: "rhythm-b", pitch: 60, duration: rational(3), dotted: true, lyric: "녕" }
    ];
    mount(draft);
    const rhythm = current.draft.measures;
    act(() => { current.goToMelody(); });
    expect(current.step).toBe("melody");
    expect(current.draft.measures).toBe(rhythm);
    act(() => {
      current.setInputMode("score");
      current.setInputMode("grid");
    });
    expect(current.draft.measures).toBe(rhythm);
  });

  it("악보에서 반음 위로 옮기면 샤프, 반음 아래로 옮기면 플랫을 붙이고 실제 반음으로 재생한다", () => {
    mount(fullDraft());
    act(() => {
      current.goToMelody();
      current.setInputMode("score");
      current.setPitch("first-a", 61);
      current.setPitch("first-b", 63);
    });
    expect(current.active.notes[0]).toMatchObject({ pitch: 61, accidental: "sharp", lyric: "안", duration: rational(2) });
    expect(current.active.notes[1]).toMatchObject({ pitch: 63, accidental: "flat", lyric: "녕", duration: rational(2) });
    const restored = readPracticeDraft();
    expect(restored.measures[0].notes.map(({ pitch, accidental }) => ({ pitch, accidental }))).toEqual([
      { pitch: 61, accidental: "sharp" },
      { pitch: 63, accidental: "flat" }
    ]);
    const timeline = buildPracticeTimeline({ ...restored, mode: restored.mode ?? undefined, step: "melody" });
    expect(timeline.events.map((event) => event.pitch)).toEqual([61, 63, 67, 72]);
    expect(timeline.events.map((event) => event.startSeconds)).toEqual([0, 1.25, 2.5, 4.375]);
    expect(current.complete).toBe(true);
  });

  it("반음에서 자연음으로 돌아오면 임시표를 해제하고 음역 밖과 잘못된 높이를 제한한다", () => {
    const draft = fullDraft();
    draft.measures[0].notes = [
      { id: "sharp", pitch: 61, accidental: "sharp", duration: rational(1), lyric: "안" },
      { id: "flat", pitch: 63, accidental: "flat", duration: rational(1), lyric: "녕" },
      { id: "rest", pitch: null, duration: rational(2) }
    ];
    mount(draft);
    act(() => {
      current.setPitch("sharp", 60);
      current.setPitch("flat", 64);
      current.setPitch("rest", 65);
    });
    expect(current.active.notes.map(({ pitch, accidental }) => ({ pitch, accidental }))).toEqual([
      { pitch: 60, accidental: undefined },
      { pitch: 64, accidental: undefined },
      { pitch: null, accidental: undefined }
    ]);
    act(() => {
      current.setPitch("sharp", 59);
      current.setPitch("flat", 85);
    });
    expect(current.active.notes.map((note) => note.pitch)).toEqual([60, 84, null]);
    const beforeInvalid = current.draft;
    act(() => {
      current.setPitch("sharp", Number.NaN);
      current.setPitch("flat", Infinity);
    });
    expect(current.draft).toBe(beforeInvalid);
    expect(readPracticeDraft().measures[0].notes.map((note) => note.pitch)).toEqual([60, 84, null]);
  });

  it("가락 단계에서도 리듬을 고치며 부족한 박자를 채우면 저장 가능 상태가 복구된다", () => {
    mount(fullDraft(), "melody");
    act(() => { current.goToMelody(); });
    const second = current.draft.measures[1];
    act(() => { current.setDuration("first-a", 1); });
    expect(current.step).toBe("melody");
    expect(current.complete).toBe(false);
    expect(current.validations[0].state).toBe("short");
    act(() => { current.fillRests(); });
    expect(current.step).toBe("melody");
    expect(current.complete).toBe(true);
    expect(current.active.notes[2]).toMatchObject({ pitch: null, duration: rational(1) });
    act(() => { current.deleteNote("first-b"); });
    expect(current.complete).toBe(false);
    expect(current.active.lyric).toBe("안녕");
    act(() => { current.addNote(2, 65); });
    expect(current.complete).toBe(true);
    expect(current.active.notes.map((note) => note.lyric)).toEqual(["안", undefined, "녕"]);
    act(() => { current.setPitch("first-a", 76); });
    expect(current.active.notes[0].pitch).toBe(76);
    expect(current.active.notes[2].pitch).toBe(65);
    expect(current.draft.measures[1]).toEqual(second);
    expect(current.step).toBe("melody");
    const beforeGeneration = current.draft;
    act(() => { current.generateRhythm(); });
    expect(current.draft).toEqual(beforeGeneration);
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it("가락의 박자가 초과되어도 가락 단계에 머물고 음표 삭제로 복구할 수 있다", () => {
    mount(fullDraft(), "melody");
    act(() => { current.goToMelody(); });
    act(() => { current.addNote(1, 65, undefined, 1); });
    expect(current.activeIndex).toBe(1);
    expect(current.step).toBe("melody");
    expect(current.validations[1].state).toBe("over");
    expect(current.complete).toBe(false);
    const addedId = current.active.notes[2].id;
    act(() => { current.deleteNote(addedId); });
    expect(current.step).toBe("melody");
    expect(current.complete).toBe(true);
    expect(current.active.notes.map((note) => note.pitch)).toEqual([67, 72]);
    expect(current.active.lyric).toBe("친구");
  });

  it("네 마디 중 빈 마디가 있어도 가락 단계로 넘어가고 직접 채워 완성한다", () => {
    mount(fullDraft(), "melody");
    act(() => { current.resize(4); });
    act(() => { current.addNote(4, 60, undefined, 2); });
    act(() => { current.goToMelody(); });
    expect(current.step).toBe("melody");
    expect(current.activeIndex).toBe(2);
    expect(current.draft.measures[3].notes).toEqual([]);
    expect(current.complete).toBe(false);
    act(() => {
      current.addNote(4, 60, undefined, 3);
      current.goToMelody();
    });
    expect(current.step).toBe("melody");
    expect(current.complete).toBe(true);
  });

  it("다른 마디의 음표를 선택하거나 고치면 해당 마디를 찾아 변경한다", () => {
    mount(fullDraft());
    act(() => { current.selectMeasure(1); });
    const second = current.draft.measures[1];
    act(() => { current.setSelectedNoteId("first-b"); });
    expect(current.activeIndex).toBe(0);
    expect(current.selectedNoteId).toBe("first-b");
    act(() => {
      current.selectMeasure(1);
      current.setPitch("first-a", 69);
      current.setDuration("first-b", 1);
      current.fillRests(0);
    });
    expect(current.activeIndex).toBe(0);
    expect(current.active.notes[0].pitch).toBe(69);
    expect(current.active.notes[1].duration).toEqual(rational(1));
    expect(current.validations[0].state).toBe("exact");
    expect(current.draft.measures[1]).toEqual(second);
    act(() => {
      current.selectMeasure(1);
      current.deleteNote("first-b");
    });
    expect(current.activeIndex).toBe(0);
    expect(current.active.notes.map((note) => note.id)).not.toContain("first-b");
    expect(current.draft.measures[1]).toEqual(second);
  });

  it("한 번의 입력에서 마디별 가사와 리듬을 수정해도 최신 가사와 박자를 사용한다", () => {
    mount(fullDraft());
    act(() => { current.selectMeasure(1); });
    const second = current.draft.measures[1];
    act(() => {
      current.setLyric("반짝별아", 0);
      current.generateRhythm(0);
      current.setChord("F", 0);
    });
    expect(current.activeIndex).toBe(0);
    expect(current.active.chord).toBe("F");
    expect(current.active.notes).toHaveLength(4);
    expect(current.active.notes.map((note) => note.lyric).join("")).toBe("반짝별아");
    expect(current.draft.measures[1]).toEqual(second);
    act(() => {
      current.selectMeasure(1);
      current.setLyric("햇살");
      current.setDuration("second-a", 1);
      current.fillRests();
    });
    expect(current.activeIndex).toBe(1);
    expect(current.active.lyric).toBe("햇살");
    expect(current.active.notes.map((note) => note.lyric)).toEqual(["햇", "살", undefined]);
    expect(current.validations[1].state).toBe("exact");
  });

  it("음표별 빈 가사칸은 음높이와 길이를 고쳐도 다른 음표의 가사를 당겨오지 않는다", () => {
    mount(fullDraft());
    act(() => { current.setNoteLyric("first-a", ""); });
    expect(current.active.lyric).toBe("녕");
    expect(current.active.notes.map((note) => note.lyric)).toEqual(["", "녕"]);
    act(() => {
      current.selectMeasure(1);
      current.setPitch("first-a", 65);
      current.setDuration("first-b", 1);
      current.fillRests(0);
    });
    expect(current.activeIndex).toBe(0);
    expect(current.active.notes.map((note) => note.lyric)).toEqual(["", "녕", undefined]);
    expect(current.active.lyric).toBe("녕");
    expect(readPracticeDraft().measures[0].notes.map((note) => note.lyric)).toEqual(["", "녕", undefined]);
    act(() => { current.setNoteLyric("first-a", "안"); });
    expect(current.active.lyric).toBe("안녕");
    act(() => { current.setNoteLyric("first-b", "구"); });
    expect(current.active.lyric).toBe("안구");
    act(() => { current.setNoteLyric("first-b", ""); });
    expect(current.active.lyric).toBe("안");
    expect(current.active.notes.map((note) => note.lyric)).toEqual(["안", "", undefined]);
  });

  it("음표별 가사를 여러 번 고쳐도 아직 배치하지 못한 가사 음절은 보존한다", () => {
    const draft = fullDraft();
    draft.measures[0].lyric = "안녕친구";
    mount(draft);
    act(() => { current.setNoteLyric("first-a", ""); });
    expect(current.active.lyric).toBe("녕친구");
    act(() => { current.setNoteLyric("first-b", "별"); });
    expect(current.active.lyric).toBe("별친구");
    act(() => { current.setNoteLyric("first-a", "햇"); });
    expect(current.active.lyric).toBe("햇별친구");
    expect(current.active.notes.map((note) => note.lyric)).toEqual(["햇", "별"]);
    act(() => { current.setNoteLyric("missing-note", "꽃"); });
    expect(current.active.lyric).toBe("햇별친구");
  });

  it("가락에서 쉼표나 음표를 추가해도 앞의 빈 가사칸과 기존 음절 위치를 유지한다", () => {
    const draft = fullDraft();
    draft.measures[0].lyric = "반짝별아";
    draft.measures[0].notes = ["반", "짝", "별", "아"].map((lyric, index) => ({
      id: `lyric-${index}`, pitch: [60, 62, 64, 65][index], duration: rational(1), lyric
    }));
    mount(draft, "melody");
    act(() => { current.setNoteLyric("lyric-0", ""); });
    act(() => { current.goToMelody(); });
    const existing = current.active.notes;
    act(() => {
      current.addNote(0.5, null);
      current.addNote(0.5, 72);
    });
    expect(current.step).toBe("melody");
    expect(current.active.notes.slice(0, 4)).toEqual(existing);
    expect(current.active.notes.map((note) => note.lyric)).toEqual(["", "짝", "별", "아", undefined, ""]);
    expect(current.active.lyric).toBe("짝별아");
    expect(readPracticeDraft().measures[0].notes.map((note) => note.lyric)).toEqual(["", "짝", "별", "아", undefined, ""]);
  });

  it("새 음표에만 미배치 가사를 넣고 중간 음표를 지워도 나머지 가사와 원문을 유지한다", () => {
    const draft = fullDraft();
    draft.measures[0].lyric = "안녕친구";
    mount(draft);
    act(() => { current.setNoteLyric("first-a", ""); });
    act(() => {
      current.addNote(0.5, null);
      current.addNote(0.5, 65);
      current.addNote(0.5, 67);
    });
    expect(current.active.lyric).toBe("녕친구");
    expect(current.active.notes.map((note) => note.lyric)).toEqual(["", "녕", undefined, "친", "구"]);
    const retainedNotes = current.active.notes.filter((note) => note.id !== "first-b");
    act(() => { current.deleteNote("first-b"); });
    expect(current.active.lyric).toBe("녕친구");
    expect(current.active.notes).toEqual(retainedNotes);
    act(() => { current.addNote(0.5, 69); });
    expect(current.active.notes.map((note) => note.lyric)).toEqual(["", undefined, "친", "구", "녕"]);
    expect(current.active.lyric).toBe("녕친구");
    expect(readPracticeDraft().measures[0].notes.map((note) => note.lyric)).toEqual(["", undefined, "친", "구", "녕"]);
  });

  it("반복 음절이 있는 리듬의 음표를 지우고 직접 편집해도 미배치 음절을 중복 없이 보존한다", () => {
    const draft = fullDraft();
    draft.measures[0].lyric = "라라별별";
    draft.measures[0].notes = ["라", "라", "별", "별"].map((lyric, index) => ({
      id: `repeat-${index}`, pitch: 60, duration: rational(1), lyric
    }));
    mount(draft);
    act(() => {
      current.deleteNote("repeat-1");
      current.deleteNote("repeat-2");
      current.setNoteLyric("repeat-0", "하");
    });
    expect(current.active.notes.map((note) => note.lyric)).toEqual(["하", "별"]);
    expect(current.active.lyric).toBe("하별라별");
    act(() => {
      current.addNote(1, 64);
      current.addNote(1, 67);
    });
    expect(current.active.notes.map((note) => note.lyric)).toEqual(["하", "별", "라", "별"]);
    expect(current.active.lyric).toBe("하별라별");
    expect(current.complete).toBe(true);
  });

  it("남은 박자는 쉼표로 채우고 가사는 소리 나는 음표에만 붙인다", () => {
    mount();
    act(() => { current.setLyric("안녕"); });
    act(() => { current.addNote(1.5, 60, true); });
    act(() => { current.addNote(0.5, 64); });
    act(() => { current.fillRests(); });
    expect(current.validations[0].state).toBe("exact");
    expect(current.active.notes.map((note) => note.lyric)).toEqual(["안", "녕", undefined]);
    expect(current.active.notes[2]).toMatchObject({ pitch: null, duration: rational(2) });
    expect(current.complete).toBe(false);
  });

  it.each([
    { meter: { beats: 4, beatUnit: 4 as const }, count: 16 },
    { meter: { beats: 3, beatUnit: 4 as const }, count: 12 },
    { meter: { beats: 2, beatUnit: 4 as const }, count: 8 },
    { meter: { beats: 6, beatUnit: 8 as const }, count: 12 }
  ])("$meter.beats/$meter.beatUnit박자를 16분음표로 정확히 채우고 자동 저장한다", ({ meter, count }) => {
    mount();
    act(() => {
      current.resize(1);
      current.setMeter(meter);
      for (let index = 0; index < count; index += 1) {
        current.addNote(0.25, index % 2 === 0 ? 60 : null);
      }
    });
    expect(current.active.notes).toHaveLength(count);
    expect(current.active.notes.every((note) => note.duration.numerator === 1 && note.duration.denominator === 4)).toBe(true);
    expect(current.validations[0].state).toBe("exact");
    expect(current.complete).toBe(true);
    expect(readPracticeDraft().measures[0].notes).toEqual(current.active.notes);
    act(() => { current.goToMelody(); });
    expect(current.step).toBe("melody");
  });

  it("16분음표로 길이를 바꾼 뒤 남은 마지막 1/4박도 쉼표로 채운다", () => {
    mount(fullDraft());
    act(() => {
      current.resize(1);
      current.setDuration("first-a", 0.25);
      current.fillRests();
    });
    expect(current.active.notes.map((note) => note.duration)).toEqual([
      rational(1, 4), rational(2), rational(3, 2), rational(1, 4)
    ]);
    expect(current.active.notes.at(-1)).toMatchObject({ pitch: null, duration: rational(1, 4), dotted: false });
    expect(current.active.notes.map((note) => note.lyric)).toEqual(["안", "녕", undefined, undefined]);
    expect(current.validations[0].state).toBe("exact");
    expect(readPracticeDraft().measures[0].notes).toEqual(current.active.notes.map((note) => ({ ...note, dotted: note.dotted || undefined })));
  });

  it("추가 악보에서도 16분음표·쉼표를 독립적으로 추가하고 마지막 빈 박자를 채운다", () => {
    mount(fullDraft());
    const primary = current.draft.measures;
    act(() => {
      current.addRhythmScore();
      current.addNote(0.25, 60);
      current.addNote(0.25, null);
      current.fillRests();
    });
    expect(current.draft.measures).toBe(primary);
    expect(current.scoreValidations[1][0].state).toBe("exact");
    expect(current.active.notes.slice(0, 2).map((note) => note.duration)).toEqual([rational(1, 4), rational(1, 4)]);
    expect(readPracticeDraft().rhythmLayers[0].measures[0].notes.map((note) => note.duration)).toEqual(current.active.notes.map((note) => note.duration));
  });

  it("너무 긴 가사는 오류를 알리되 기존 리듬과 가사 원문을 버리지 않는다", () => {
    mount(fullDraft());
    const existingNotes = current.active.notes;
    const longLyric = "가".repeat(17);
    act(() => { current.setLyric(longLyric); });
    const withLongLyrics = current.active.notes;
    act(() => { current.generateRhythm(); });
    expect(current.notice).toContain("가사 17글자는 이 마디에 모두 들어가지 않아요");
    expect(current.active.lyric).toBe(longLyric);
    expect(current.active.notes).toEqual(withLongLyrics);
    expect(current.active.notes.map((note) => ({ id: note.id, duration: note.duration, pitch: note.pitch })))
      .toEqual(existingNotes.map((note) => ({ id: note.id, duration: note.duration, pitch: note.pitch })));
    expect(current.active.notes.map((note) => note.lyric)).toEqual(["가", "가"]);
    expect(readPracticeDraft().measures[0].lyric).toBe(longLyric);
    expect(current.complete).toBe(true);
  });

  it("새 리듬 생성 취소 시 기존 음표를 유지하고 다른 마디에 새 리듬을 만들 수 있다", () => {
    mount(fullDraft());
    const previous = current.active.notes;
    vi.mocked(window.confirm).mockReturnValue(false);
    act(() => { current.generateRhythm(); });
    expect(current.active.notes).toEqual(previous);
    vi.mocked(window.confirm).mockReturnValue(true);
    act(() => { current.selectMeasure(1); });
    act(() => { current.setLyric("반짝별아"); });
    act(() => { current.generateRhythm(); });
    expect(current.active.notes).toHaveLength(4);
    expect(current.active.notes.map((note) => note.lyric).join("")).toBe("반짝별아");
    expect(current.draft.measures[0].notes).toEqual(previous);
    const ids = current.draft.measures.flatMap((measure) => measure.notes.map((note) => note.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("저장 실패를 상태로 알리면서 편집을 유지하고 다음 저장 성공 시 복구한다", () => {
    mount();
    const failedWrite = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    act(() => { current.setLyric("안녕"); });
    act(() => { current.addNote(1, 60); });
    expect(current.saved).toBe(false);
    expect(current.active.lyric).toBe("안녕");
    expect(current.active.notes[0].lyric).toBe("안");
    failedWrite.mockRestore();
    act(() => { current.configure({ title: "보존된 연습" }); });
    expect(current.saved).toBe(true);
    expect(readPracticeDraft().measures[0].lyric).toBe("안녕");
    expect(readPracticeDraft().title).toBe("보존된 연습");
  });
});

describe("악보를 최대 세 개 겹쳐 만드는 리듬 상태", () => {
  it("독립된 빈 악보를 추가하고 새 악보를 선택하며 최대 세 개로 제한한다", () => {
    mount(fullDraft());
    const first = current.draft.measures;
    act(() => {
      current.addRhythmScore();
      current.addRhythmScore();
      current.addRhythmScore();
    });
    expect(current.scores).toHaveLength(3);
    expect(current.activeScoreIndex).toBe(2);
    expect(current.draft.measures).toEqual(first);
    expect(current.scores.slice(1).every((score) => score.measures.length === 2 && score.measures.every((measure) => measure.notes.length === 0))).toBe(true);
    expect(new Set(current.scores.map((score) => score.id)).size).toBe(3);
    expect(current.notice).toContain("최대 3개");
    expect(current.complete).toBe(false);
  });

  it("선택한 악보와 명시한 악보의 음표 및 가사를 각각 바꾸고 음표 소유자를 자동 선택한다", () => {
    mount(fullDraft());
    const first = current.draft.measures;
    act(() => {
      current.addRhythmScore();
      current.setLyric("쿵짝", 1, 1);
      current.addNote(2, 60, undefined, 1, 1);
      current.addNote(2, 60, undefined, 1, 1);
    });
    const extraNote = current.active.notes[0].id;
    expect(current.activeScoreIndex).toBe(1);
    expect(current.activeIndex).toBe(1);
    expect(current.active.notes.map((note) => note.lyric)).toEqual(["쿵", "짝"]);
    expect(current.draft.measures).toEqual(first);
    act(() => {
      current.selectMeasure(0, 0);
      current.setDuration(extraNote, 1);
      current.setNoteLyric(extraNote, "");
      current.fillRests(1, 1);
    });
    expect(current.activeScoreIndex).toBe(1);
    expect(current.activeIndex).toBe(1);
    expect(current.active.notes.map((note) => note.lyric)).toEqual(["", "짝", undefined]);
    expect(current.scoreValidations[1][1].state).toBe("exact");
    expect(current.draft.measures).toEqual(first);
    act(() => { current.deleteNote("first-a"); });
    expect(current.activeScoreIndex).toBe(0);
    expect(current.activeIndex).toBe(0);
    expect(current.draft.rhythmLayers[0].measures[1].notes.map((note) => note.lyric)).toEqual(["", "짝", undefined]);
    expect(readPracticeDraft().rhythmLayers[0].measures[1].notes.map((note) => note.lyric)).toEqual(["", "짝", undefined]);
  });

  it("악보별 악기를 미리 선택하고 다른 악보의 악기 및 음표를 유지한다", () => {
    mount();
    act(() => {
      current.setRhythmInstrument(0, "beat:triangle");
      current.addRhythmScore();
      current.setRhythmInstrument(1, "marimba");
      current.addRhythmScore();
      current.setRhythmInstrument(2, "beat:clap");
      current.setRhythmInstrument(2, "beat:missing");
      current.setRhythmInstrument(99, "flute");
    });
    expect(current.scores.map((score) => score.instrumentId)).toEqual(["beat:triangle", "marimba", "beat:clap"]);
    expect(readPracticeDraft().rhythmLayers.map((score) => score.instrumentId)).toEqual(["marimba", "beat:clap"]);
    expect(current.scores.every((score) => score.measures.every((measure) => measure.notes.length === 0))).toBe(true);
  });

  it("연결 모드에서는 추가 악보의 리듬까지 채워야 첫 악보의 가락을 만든다", () => {
    mount(fullDraft());
    act(() => {
      current.addRhythmScore();
      current.fillRests(0, 1);
      current.goToMelody();
    });
    expect(current.step).toBe("rhythm");
    expect(current.activeScoreIndex).toBe(1);
    expect(current.activeIndex).toBe(0);
    expect(current.selectedNoteId).toBeNull();
    expect(current.draft.rhythmLayers[0].measures[1].notes).toEqual([]);
    expect(current.complete).toBe(false);
    act(() => {
      current.fillRests(1, 1);
      current.goToMelody();
    });
    expect(current.complete).toBe(true);
    expect(current.step).toBe("melody");
    expect(current.activeScoreIndex).toBe(0);
    expect(current.editingStep).toBe("melody");
    const first = current.draft.measures;
    act(() => {
      current.selectMeasure(1, 1);
      current.setLyric("짝짝", 1, 1);
      current.generateRhythm(1, 1);
    });
    expect(current.step).toBe("melody");
    expect(current.editingStep).toBe("rhythm");
    expect(current.active.notes.map((note) => note.lyric)).toEqual(["짝", "짝"]);
    expect(current.draft.measures).toEqual(first);
    expect(current.complete).toBe(true);
  });

  it("첫 악보가 쉼표뿐이면 추가 악보에서 소리가 나도 연결 모드의 가락으로 넘어가지 않는다", () => {
    mount();
    act(() => {
      current.fillRests(0, 0);
      current.fillRests(1, 0);
      current.addRhythmScore();
      current.addNote(4, 60, undefined, 0, 1);
      current.fillRests(1, 1);
      current.goToMelody();
    });
    expect(current.complete).toBe(true);
    expect(current.step).toBe("rhythm");
    expect(current.activeScoreIndex).toBe(1);
    expect(current.selectedNoteId).toBe(current.draft.rhythmLayers[0].measures[0].notes[0].id);
    expect(current.draft.measures.every((measure) => measure.notes.every((note) => note.pitch === null))).toBe(true);
    expect(current.draft.rhythmLayers[0].measures[0].notes[0].pitch).toBe(60);
  });

  it("마디 수를 모든 악보에서 함께 바꾸고 추가 악보의 뒤쪽 작업 삭제도 확인한다", () => {
    mount();
    act(() => {
      current.addRhythmScore();
      current.resize(4);
      current.setLyric("쿵", 3, 1);
      current.addNote(4, 60, undefined, 3, 1);
    });
    expect(current.scores.map((score) => score.measures.length)).toEqual([4, 4]);
    const previous = current.draft;
    vi.mocked(window.confirm).mockReturnValue(false);
    act(() => { current.resize(2); });
    expect(current.draft).toEqual(previous);
    expect(current.activeIndex).toBe(3);
    expect(window.confirm).toHaveBeenCalledOnce();
    vi.mocked(window.confirm).mockReturnValue(true);
    act(() => { current.resize(2); });
    expect(current.scores.map((score) => score.measures.length)).toEqual([2, 2]);
    expect(current.activeIndex).toBe(1);
    expect(current.activeScoreIndex).toBe(1);
    expect(readPracticeDraft().rhythmLayers[0].measures).toHaveLength(2);
  });

  it("작업한 악보 삭제 취소는 그대로 보존하고 삭제 승인 후 선택을 남은 악보로 맞춘다", () => {
    mount(fullDraft());
    act(() => {
      current.addRhythmScore();
      current.addNote(1, 60);
      current.addRhythmScore();
      current.addNote(1, 60);
    });
    const lastNote = current.active.notes[0].id;
    const previous = current.draft;
    vi.mocked(window.confirm).mockReturnValue(false);
    act(() => { current.removeRhythmScore(1); });
    expect(current.draft).toEqual(previous);
    expect(current.activeScoreIndex).toBe(2);
    vi.mocked(window.confirm).mockReturnValue(true);
    act(() => { current.removeRhythmScore(1); });
    expect(current.scores).toHaveLength(2);
    expect(current.activeScoreIndex).toBe(1);
    expect(current.selectedNoteId).toBe(lastNote);
    act(() => { current.removeRhythmScore(0); });
    expect(current.scores).toHaveLength(2);
    act(() => { current.removeRhythmScore(1); });
    expect(current.activeScoreIndex).toBe(0);
    expect(current.selectedNoteId).toBeNull();
    expect(current.scores).toHaveLength(1);
    expect(current.draft.measures).toEqual(previous.measures);
  });

  it("한 이벤트 안에서 악보를 번갈아 편집해도 가사와 음표 ID를 섞지 않는다", () => {
    mount();
    act(() => {
      current.addRhythmScore();
      current.addRhythmScore();
      for (let scoreIndex = 0; scoreIndex < 3; scoreIndex += 1) {
        current.selectMeasure(0, scoreIndex);
        current.setLyric(["도레", "쿵짝", "찰찰"][scoreIndex]);
        current.generateRhythm();
      }
    });
    expect(current.scores.map((score) => score.measures[0].notes.map((note) => note.lyric).join(""))).toEqual(["도레", "쿵짝", "찰찰"]);
    const ids = current.scores.flatMap((score) => score.measures.flatMap((measure) => measure.notes.map((note) => note.id)));
    expect(new Set(ids).size).toBe(ids.length);
    act(() => { current.setSelectedNoteId(ids[0]); });
    expect(current.activeScoreIndex).toBe(0);
    expect(current.active.lyric).toBe("도레");
  });
});

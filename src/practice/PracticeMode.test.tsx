import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SUPPORTED_METERS, validateMeasure } from "../music/meter";
import {
  placeCurrentNote, button, changeInput, changeValue, click, completeMeasure, completeOneMeasure,
  completeScoreMeasure, container, latestAudioInput, measureCard, mount, placeNote,
  rerender, savedDraft, scoreButton, scoreCard, testButton, unmount
} from "./PracticeMode.test.helpers";

const audio = vi.hoisted(() => ({
  busy: false,
  playing: false,
  previewMeasureIndex: null as number | null,
  previewScoreIndex: null as number | null,
  previewRhythmMixing: false,
  playingNoteId: null,
  playingNoteIds: [] as readonly string[],
  status: "",
  progress: 0,
  preview: vi.fn(),
  previewMeasure: vi.fn(),
  previewScore: vi.fn(),
  previewRhythmMix: vi.fn(),
  save: vi.fn(),
  stop: vi.fn()
}));

vi.mock("./usePracticeAudio", () => ({ usePracticeAudio: vi.fn(() => audio) }));
vi.mock("../components/ScoreMeasure", () => ({ default: () => <div aria-label="연습 악보" /> }));

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  audio.busy = false;
  audio.playing = false;
  audio.previewMeasureIndex = null;
  audio.previewScoreIndex = null;
  audio.previewRhythmMixing = false;
  audio.playingNoteIds = [];
  audio.status = "";
  audio.progress = 0;
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

afterEach(() => {
  unmount();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("악보를 겹쳐 리듬 만들기", () => {
  it("음표를 넣기 전에 입력 영역 위에서 악기를 고르고 세 악보를 함께 펼친다", () => {
    mount();
    const instruments = container?.querySelector('[aria-label="리듬 악보와 악기 선택"]') as Element;
    const workspace = container?.querySelector('[data-testid="practice-score-tools-0"]') as Element;
    expect(instruments).not.toBeNull();
    expect(instruments.compareDocumentPosition(workspace) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(savedDraft().measures.every((measure) => measure.notes.length === 0)).toBe(true);
    changeValue("리듬 연주 악기", "beat:clap");
    expect(savedDraft().rhythmInstrumentId).toBe("beat:clap");
    click(button("악보 추가하기"));
    changeValue("2번 악보 리듬 연주 악기", "beat:shaker");
    click(button("악보 추가하기"));
    changeValue("3번 악보 리듬 연주 악기", "beat:kick");
    expect(savedDraft().rhythmLayers.map((layer) => layer.instrumentId)).toEqual(["beat:shaker", "beat:kick"]);
    expect(button("악보 추가하기").disabled).toBe(true);
    click(button("악보 추가하기"));
    expect(savedDraft().rhythmLayers).toHaveLength(2);
    for (let scoreIndex = 0; scoreIndex < 3; scoreIndex += 1) {
      expect(container?.querySelector(`[data-testid="practice-score-workspace-${scoreIndex}"]`)).not.toBeNull();
      expect(scoreCard(scoreIndex, 0)).not.toBeNull();
      expect(scoreCard(scoreIndex, 1)).not.toBeNull();
      const tools = container?.querySelector(`[data-testid="practice-score-tools-${scoreIndex}"]`) as Element;
      expect(tools.closest(".practice-score-workspace")?.getAttribute("data-testid"))
        .toBe(`practice-score-workspace-${scoreIndex}`);
      expect(tools.querySelectorAll('[data-testid^="practice-duration-"]')).toHaveLength(7);
      expect(tools.querySelectorAll('[data-testid^="practice-rest-"]')).toHaveLength(0);
      expect(tools.querySelectorAll(".practice-common-durations button")).toHaveLength(3);
    }
    expect(container?.querySelector('[data-testid="practice-add-note"]')).toBeNull();
    expect(container?.querySelector('[data-testid="practice-add-rest"]')).toBeNull();
    placeCurrentNote(1.5, false, 1);
    placeCurrentNote(1.5, true, 1);
    expect(savedDraft().rhythmLayers[0].measures[0].notes.map((note) => ({
      pitch: note.pitch, duration: note.duration, dotted: note.dotted
    }))).toEqual([
      { pitch: 60, duration: { numerator: 3, denominator: 2 }, dotted: true },
      { pitch: null, duration: { numerator: 3, denominator: 2 }, dotted: true }
    ]);
    expect(savedDraft().measures.every((measure) => measure.notes.length === 0)).toBe(true);
    expect(savedDraft().rhythmLayers[1].measures.every((measure) => measure.notes.length === 0)).toBe(true);
  });

  it("빈칸을 채우고 다시 눌러 지운 뒤 재추가해도 다른 악보와 마디의 리듬·가사를 보존한다", () => {
    mount();
    completeMeasure(0, "작은새야");
    completeMeasure(1, "노래하자");
    click(button("악보 추가하기"));
    completeScoreMeasure(1, 0, "반짝별아");
    changeInput(scoreCard(1, 1).querySelector<HTMLInputElement>(".practice-lyric-entry input") as HTMLInputElement, "봄");
    const before = savedDraft();
    click(testButton("practice-score-1-measure-1"));
    placeCurrentNote(0.5, false, 1);
    const inserted = savedDraft().rhythmLayers[0].measures[1].notes[0];
    expect(inserted).toMatchObject({ pitch: 60, duration: { numerator: 1, denominator: 2 }, lyric: "봄" });
    expect(scoreCard(1, 1).querySelector(".practice-measure-total")?.textContent).toBe("0.5 / 4박");
    click(testButton("practice-measure-0"));
    click(testButton(`practice-rhythm-note-${inserted.id}`));
    expect(savedDraft()).toEqual(before);
    expect(scoreCard(1, 1).querySelector(".practice-measure-total")?.textContent).toBe("0 / 4박");
    expect(scoreCard(1, 1).classList.contains("is-active")).toBe(true);
    expect(container?.querySelector('[data-testid="practice-delete-note"]')).toBeNull();
    click(scoreCard(1, 1).querySelector<HTMLButtonElement>(".practice-empty-slot") as HTMLButtonElement);
    const after = savedDraft();
    expect(after.measures).toEqual(before.measures);
    expect(after.rhythmLayers[0].measures[0]).toEqual(before.rhythmLayers[0].measures[0]);
    expect(after.rhythmLayers[0].measures[1].notes).toHaveLength(1);
    expect(after.rhythmLayers[0].measures[1].notes[0]).toMatchObject({
      pitch: 60, duration: inserted.duration, lyric: "봄"
    });
    expect(after.rhythmLayers[0].measures[1].notes[0].id).not.toBe(inserted.id);
  });

  it("선택한 악보에만 서로 다른 리듬을 넣고 해당 악보와 마디를 따로 듣는다", () => {
    mount();
    changeValue("연습할 마디 수", "1");
    placeCurrentNote(1, false);
    const primary = savedDraft().measures[0].notes;
    click(button("악보 추가하기"));
    click(testButton("practice-score-select-1"));
    placeCurrentNote(0.5, false);
    placeCurrentNote(0.5, true);
    const before = savedDraft();
    expect(before.measures[0].notes).toEqual(primary);
    expect(before.rhythmLayers[0].measures[0].notes.map((note) => note.pitch)).toEqual([60, null]);
    expect(before.rhythmLayers[0].measures[0].notes.map((note) => note.duration))
      .toEqual([{ numerator: 1, denominator: 2 }, { numerator: 1, denominator: 2 }]);
    expect(testButton("practice-score-1-measure-preview-0").disabled).toBe(false);
    click(testButton("practice-score-1-measure-preview-0"));
    expect(audio.previewMeasure).toHaveBeenLastCalledWith(0, 1);
    expect(latestAudioInput().rhythmLayers).toEqual(before.rhythmLayers);
    expect(latestAudioInput().measures).toEqual(before.measures);
    expect(latestAudioInput().meter).toEqual(before.meter);
    click(testButton("practice-measure-preview-0"));
    expect(audio.previewMeasure).toHaveBeenLastCalledWith(0, 0);
    click(testButton("practice-score-select-0"));
    click(scoreCard(1, 0).querySelector<HTMLButtonElement>(".practice-lyric-heading button")!);
    click(testButton("practice-score-1-measure-0"));
    placeCurrentNote(2, false);
    expect(savedDraft().measures[0].notes).toEqual(primary);
    expect(savedDraft().rhythmLayers[0].measures[0].notes.slice(0, -1))
      .toEqual(before.rhythmLayers[0].measures[0].notes);
    expect(savedDraft().rhythmLayers[0].measures[0].notes.at(-1)?.duration)
      .toEqual({ numerator: 2, denominator: 1 });
  });

  it("다 채우지 않은 리듬도 함께 듣고 준비 취소와 멈추는 동안 다른 입력을 잠근다", () => {
    mount();
    click(button("악보 추가하기"));
    expect(button("리듬 함께 듣기").disabled).toBe(true);
    click(testButton("practice-score-select-0"));
    placeCurrentNote(1, false);
    const before = savedDraft();
    expect(button("리듬 함께 듣기").disabled).toBe(false);
    expect(button("소리 파일(MP3)").disabled).toBe(true);
    click(button("리듬 함께 듣기"));
    expect(audio.previewRhythmMix).toHaveBeenCalledTimes(1);
    expect(audio.preview).not.toHaveBeenCalled();
    audio.busy = true;
    audio.previewRhythmMixing = true;
    rerender();
    expect(button("리듬 함께 듣기 준비 취소").disabled).toBe(false);
    expect(button("악보 추가하기").disabled).toBe(true);
    expect(testButton("practice-duration-1").disabled).toBe(true);
    expect(testButton("practice-choose-rest").disabled).toBe(true);
    expect(testButton("practice-measure-preview-0").disabled).toBe(true);
    const instrument = container?.querySelector<HTMLSelectElement>('[aria-label="리듬 연주 악기"]');
    expect(instrument?.matches(":disabled")).toBe(true);
    click(button("리듬 함께 듣기 준비 취소"));
    expect(audio.stop).toHaveBeenCalledTimes(1);
    audio.busy = false;
    audio.playing = true;
    rerender();
    expect(button("겹친 리듬 멈추기").disabled).toBe(false);
    click(button("겹친 리듬 멈추기"));
    expect(audio.stop).toHaveBeenCalledTimes(2);
    expect(savedDraft()).toEqual(before);
  });

  it("같은 번호의 다른 악보 미리듣기를 잠그고 현재 듣는 악보만 취소한다", () => {
    mount();
    changeValue("연습할 마디 수", "1");
    placeCurrentNote(1, false);
    click(button("악보 추가하기"));
    click(testButton("practice-score-select-1"));
    placeCurrentNote(1, false);
    audio.busy = true;
    audio.previewScoreIndex = 1;
    audio.previewMeasureIndex = 0;
    rerender();
    const extraPreview = testButton("practice-score-1-measure-preview-0");
    expect(extraPreview.textContent?.trim()).toBe("준비 취소");
    expect(extraPreview.getAttribute("aria-label")).toBe("2번 악보 1마디 준비 취소");
    expect(extraPreview.disabled).toBe(false);
    expect(testButton("practice-measure-preview-0").disabled).toBe(true);
    expect(button("리듬 함께 듣기").disabled).toBe(true);
    click(extraPreview);
    expect(audio.stop).toHaveBeenCalledTimes(1);
    expect(audio.previewMeasure).not.toHaveBeenCalled();
  });

  it("리듬에 가락을 붙이기는 모든 악보의 박자를 완성한 뒤 열고 저장한다", () => {
    mount();
    changeValue("연습할 마디 수", "1");
    completeMeasure(0);
    click(button("악보 추가하기"));
    click(button("악보 추가하기"));
    const melodyTab = container?.querySelector<HTMLButtonElement>("#practice-melody-tab") as HTMLButtonElement;
    expect(melodyTab.disabled).toBe(true);
    expect(button("소리 파일(MP3)").disabled).toBe(true);
    expect(button("음악 영상(MP4)").disabled).toBe(true);
    completeScoreMeasure(1, 0, "작은새야");
    expect(melodyTab.disabled).toBe(true);
    completeScoreMeasure(2, 0, "노래하자");
    expect(melodyTab.disabled).toBe(false);
    expect(button("소리 파일(MP3)").disabled).toBe(false);
    expect(button("음악 영상(MP4)").disabled).toBe(false);
    click(button("소리 파일(MP3)"));
    click(button("음악 영상(MP4)"));
    expect(audio.save.mock.calls).toEqual([["mp3"], ["mp4"]]);
    expect(latestAudioInput().step).toBe("rhythm");
    expect(latestAudioInput().rhythmLayers).toHaveLength(2);
    click(melodyTab);
    expect(measureCard(0).querySelectorAll(".practice-melody-row")).toHaveLength(8);
    expect(container?.querySelector('[data-testid="practice-score-workspace-1"]')).toBeNull();
    const primary = savedDraft().measures[0].notes;
    click(button("리듬 만들기로"));
    expect(scoreCard(1, 0).querySelector(".practice-rhythm-timeline")).not.toBeNull();
    click(testButton("practice-score-1-measure-0"));
    click(scoreCard(1, 0).querySelector<HTMLButtonElement>(".practice-lyric-heading button")!);
    const lyric = scoreCard(1, 0).querySelector<HTMLInputElement>('[aria-label="1번째 음표 가사"]');
    click(lyric as HTMLInputElement);
    const firstRhythmNote = savedDraft().rhythmLayers[0].measures[0].notes[0];
    click(testButton(`practice-rhythm-note-${firstRhythmNote.id}`));
    placeCurrentNote(2, false);
    expect(savedDraft().measures[0].notes).toEqual(primary);
    expect(savedDraft().rhythmLayers[0].measures[0].notes.at(-1)?.duration)
      .toEqual({ numerator: 2, denominator: 1 });
    expect(button("소리 파일(MP3)").disabled).toBe(true);
    expect(button("음악 영상(MP4)").disabled).toBe(true);
    expect(melodyTab.getAttribute("aria-selected")).toBe("false");
    expect(melodyTab.disabled).toBe(true);
  });

  it("세 악보의 악기와 별도 음표를 복원하고 마디 수를 함께 늘리고 줄인다", () => {
    mount();
    changeValue("연습할 마디 수", "1");
    completeMeasure(0);
    changeValue("리듬 연주 악기", "beat:clap");
    click(button("악보 추가하기"));
    changeValue("2번 악보 리듬 연주 악기", "beat:shaker");
    completeScoreMeasure(1, 0, "작은새야");
    click(button("악보 추가하기"));
    changeValue("3번 악보 리듬 연주 악기", "beat:kick");
    completeScoreMeasure(2, 0, "노래하자");
    const original = savedDraft();
    unmount();
    mount();
    expect(savedDraft()).toEqual(original);
    expect(container?.querySelector<HTMLSelectElement>('[aria-label="2번 악보 리듬 연주 악기"]')?.value).toBe("beat:shaker");
    expect(container?.querySelector<HTMLSelectElement>('[aria-label="3번 악보 리듬 연주 악기"]')?.value).toBe("beat:kick");
    changeValue("연습할 마디 수", "2");
    expect(savedDraft().measures).toHaveLength(2);
    expect(savedDraft().rhythmLayers.every((layer) => layer.measures.length === 2)).toBe(true);
    completeScoreMeasure(2, 1, "봄이와요");
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    changeValue("연습할 마디 수", "1");
    expect(savedDraft().measures).toHaveLength(2);
    expect(savedDraft().rhythmLayers[1].measures[1].notes).toHaveLength(4);
    changeValue("연습할 마디 수", "1");
    expect(savedDraft().measures).toHaveLength(1);
    expect(savedDraft().rhythmLayers.map((layer) => layer.measures[0])).toEqual(original.rhythmLayers.map((layer) => layer.measures[0]));
  });

  it("음표가 든 악보 삭제를 취소하면 보존하고 승인하면 다른 악보를 유지한다", () => {
    mount();
    changeValue("연습할 마디 수", "1");
    completeMeasure(0);
    click(button("악보 추가하기"));
    completeScoreMeasure(1, 0, "작은새야");
    click(button("악보 추가하기"));
    completeScoreMeasure(2, 0, "노래하자");
    const before = savedDraft();
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    click(button("2번 악보 삭제"));
    expect(savedDraft()).toEqual(before);
    click(button("2번 악보 삭제"));
    expect(savedDraft().measures).toEqual(before.measures);
    expect(savedDraft().rhythmLayers).toEqual([before.rhythmLayers[1]]);
    expect(button("악보 추가하기").disabled).toBe(false);
    expect(container?.querySelector('[data-testid="practice-score-workspace-2"]')).toBeNull();
  });
});

describe("기능 연습하기 전체 흐름", () => {
  it("가사는 직접 만든 리듬에 넣고 자동으로 음표를 붙이는 버튼과 안내를 표시하지 않는다", () => {
    mount();
    changeValue("1마디 가사", "봄날아");
    expect(savedDraft().measures[0].notes).toHaveLength(0);
    click(button("악보 추가하기"));
    for (let scoreIndex = 0; scoreIndex < 2; scoreIndex += 1) {
      for (let measureIndex = 0; measureIndex < 2; measureIndex += 1) {
        expect(scoreCard(scoreIndex, measureIndex).textContent).not.toContain("가사에 음표 붙이기");
      }
    }
    placeNote(0, 0, 1);
    expect(savedDraft().measures[0].notes[0].lyric).toBe("봄");
    const first = savedDraft().measures[0].notes[0];
    changeValue("1마디 가사", "여름아");
    expect(savedDraft().measures[0].notes).toEqual([{ ...first, lyric: "여" }]);
    click(button("처음이라면? 연습 안내"));
    click(button("다음 안내"));
    const tutorial = container?.querySelector('[aria-label="연습 튜토리얼"]');
    expect(tutorial?.textContent).toContain("음표나 쉼표를 고른 뒤 원하는 빈칸을 눌러요");
    expect(tutorial?.textContent).not.toContain("가사에 음표 붙이기");
  });

  it("완성한 음표·쉼표·가사를 그대로 가락의 기본으로 쓰고 칸과 악보 사이에서 같은 음표를 편집한다", () => {
    mount();
    changeValue("연습할 마디 수", "1");
    changeValue("1마디 가사", "봄날아");
    placeNote(0, 0, 0.5);
    placeCurrentNote(0.5, true);
    placeNote(0, 0, 1);
    placeNote(0, 0, 2);
    const rhythmNotes = savedDraft().measures[0].notes;
    expect(rhythmNotes.map((note) => note.pitch)).toEqual([60, null, 60, 60]);
    expect(rhythmNotes.map((note) => note.lyric)).toEqual(["봄", undefined, "날", "아"]);
    expect(validateMeasure(rhythmNotes, savedDraft().meter).state).toBe("exact");
    click(container?.querySelector<HTMLElement>("#practice-melody-tab") as HTMLElement);
    expect(savedDraft().measures[0].notes).toEqual(rhythmNotes);
    expect(button("칸 채우기").getAttribute("aria-pressed")).toBe("true");
    click(testButton(`practice-melody-${rhythmNotes[0].id}-67`));
    const melodyNotes = savedDraft().measures[0].notes;
    expect(melodyNotes).toEqual([{ ...rhythmNotes[0], pitch: 67 }, ...rhythmNotes.slice(1)]);
    click(button("악보에 넣기"));
    expect(button("악보에 넣기").getAttribute("aria-pressed")).toBe("true");
    expect(measureCard(0).querySelector('[aria-label="연습 악보"]')).not.toBeNull();
    expect(measureCard(0).querySelector(".practice-melody-grid")).toBeNull();
    expect(savedDraft().measures[0].notes).toEqual(melodyNotes);
    click(button("칸 채우기"));
    expect(testButton(`practice-melody-${rhythmNotes[0].id}-67`).getAttribute("aria-pressed")).toBe("true");
    expect(savedDraft().measures[0].notes).toEqual(melodyNotes);
  });

  it("길이를 고르는 동안 음표는 그대로이고 빈칸에 선택한 종류로 배치한다", () => {
    mount();
    changeValue("연습할 마디 수", "1");
    changeValue("1마디 가사", "봄날아");
    click(testButton("practice-duration-0.5"));
    expect(savedDraft().measures[0].notes).toEqual([]);
    click(measureCard(0).querySelector<HTMLButtonElement>(".practice-empty-slot") as HTMLButtonElement);
    const first = savedDraft().measures[0].notes[0];
    expect(first).toMatchObject({ duration: { numerator: 1, denominator: 2 }, lyric: "봄" });
    click(measureCard(0).querySelector<HTMLButtonElement>(".practice-empty-slot") as HTMLButtonElement);
    const second = savedDraft().measures[0].notes[1];
    expect(second).toMatchObject({ pitch: 60, duration: { numerator: 1, denominator: 2 }, lyric: "날" });
    expect(savedDraft().measures[0].notes[0]).toEqual(first);
    click(button("글자 위치 고치기"));
    click(testButton("practice-choose-rest"));
    click(testButton("practice-rest-1"));
    expect(savedDraft().measures[0].notes).toEqual([first, second]);
    expect(testButton("practice-rest-1").getAttribute("aria-pressed")).toBe("true");
    click(measureCard(0).querySelector<HTMLButtonElement>(".practice-empty-slot") as HTMLButtonElement);
    click(measureCard(0).querySelector<HTMLButtonElement>(".practice-empty-slot") as HTMLButtonElement);
    const rests = savedDraft().measures[0].notes;
    expect(rests.slice(0, 2)).toEqual([first, second]);
    expect(rests.slice(2).map((note) => ({ pitch: note.pitch, duration: note.duration })))
      .toEqual(Array.from({ length: 2 }, () => ({ pitch: null, duration: { numerator: 1, denominator: 1 } })));
    click(testButton("practice-choose-note"));
    click(testButton("practice-duration-0.5"));
    expect(savedDraft().measures[0].notes).toEqual(rests);
    click(measureCard(0).querySelector<HTMLButtonElement>(".practice-empty-slot") as HTMLButtonElement);
    click(measureCard(0).querySelector<HTMLButtonElement>(".practice-empty-slot") as HTMLButtonElement);
    const notes = savedDraft().measures[0].notes;
    expect(notes.slice(0, 4)).toEqual(rests);
    expect(notes.slice(4).map((note) => note.pitch)).toEqual([60, 60]);
    expect(validateMeasure(notes, savedDraft().meter).state).toBe("exact");
    expect(button("소리 파일(MP3)").disabled).toBe(false);
  });

  it("가락 만들기나 가락 악기 선택 없이 완성한 리듬을 MP3와 MP4로 저장한다", () => {
    mount();
    changeValue("리듬 연주 악기", "beat:shaker");
    const melodyInstrument = savedDraft().melodyInstrumentId;
    completeOneMeasure();
    const before = savedDraft();
    expect(container?.querySelector("#practice-rhythm-tab")?.getAttribute("aria-selected")).toBe("true");
    expect(container?.querySelector('[aria-label="가락 연주 악기"]')).toBeNull();
    expect(button("소리 파일(MP3)").disabled).toBe(false);
    expect(button("음악 영상(MP4)").disabled).toBe(false);
    click(button("소리 파일(MP3)"));
    click(button("음악 영상(MP4)"));
    expect(audio.save.mock.calls).toEqual([["mp3"], ["mp4"]]);
    expect(latestAudioInput()).toMatchObject({ step: "rhythm", rhythmInstrumentId: "beat:shaker" });
    expect(savedDraft()).toEqual(before);
    expect(savedDraft().melodyInstrumentId).toBe(melodyInstrument);
    expect(container?.querySelector("#practice-melody-tab")?.getAttribute("aria-selected")).toBe("false");
  });

  it("가사 없이 박자를 완성해도 리듬 단계에서 MP4로 저장한다", () => {
    mount();
    changeValue("연습할 마디 수", "1");
    placeCurrentNote(4, false);
    const before = savedDraft();
    expect(before.measures[0].lyric).toBe("");
    expect(before.measures[0].notes.every((note) => !note.lyric)).toBe(true);
    expect(validateMeasure(before.measures[0].notes, before.meter).state).toBe("exact");
    expect(button("소리 파일(MP3)").disabled).toBe(false);
    expect(button("음악 영상(MP4)").disabled).toBe(false);
    click(button("음악 영상(MP4)"));
    expect(audio.save).toHaveBeenCalledWith("mp4");
    expect(latestAudioInput().step).toBe("rhythm");
    expect(savedDraft()).toEqual(before);
  });

  it("다른 마디가 비어 있어도 미완성 마디의 리듬을 듣고 가사와 음표를 그대로 유지한다", () => {
    mount();
    changeValue("연습할 마디 수", "4");
    expect(testButton("practice-measure-preview-2").disabled).toBe(true);
    click(testButton("practice-measure-2"));
    placeCurrentNote(1, false);
    changeValue("3마디 가사", "봄");
    const before = savedDraft();
    expect(validateMeasure(before.measures[2].notes, before.meter).state).toBe("short");
    expect(testButton("practice-measure-preview-2").disabled).toBe(false);
    expect(testButton("practice-measure-preview-0").disabled).toBe(true);
    click(testButton("practice-measure-preview-2"));
    expect(audio.previewMeasure.mock.calls).toEqual([[2, 0]]);
    expect(audio.preview).not.toHaveBeenCalled();
    expect(savedDraft()).toEqual(before);
    expect(button("리듬 미리듣기").disabled).toBe(true);
    expect(button("소리 파일(MP3)").disabled).toBe(true);
    expect(button("음악 영상(MP4)").disabled).toBe(true);
    expect(button("가락 만들기로").disabled).toBe(true);
    expect(container?.querySelector<HTMLButtonElement>("#practice-melody-tab")?.disabled).toBe(true);
  });

  it("소리 나는 음표가 있으면 초과 박자도 들을 수 있고 빈 마디와 쉼표뿐인 마디는 듣기를 막는다", () => {
    mount();
    changeValue("연습할 마디 수", "3");
    click(testButton("practice-measure-0"));
    placeCurrentNote(1, false);
    placeCurrentNote(4, false);
    expect(validateMeasure(savedDraft().measures[0].notes, savedDraft().meter).state).toBe("over");
    expect(testButton("practice-measure-preview-0").disabled).toBe(false);
    click(testButton("practice-measure-preview-0"));
    expect(audio.previewMeasure).toHaveBeenCalledWith(0, 0);
    click(testButton("practice-measure-1"));
    placeCurrentNote(4, true);
    expect(savedDraft().measures[1].notes.every((note) => note.pitch === null)).toBe(true);
    expect(testButton("practice-measure-preview-1").disabled).toBe(true);
    expect(testButton("practice-measure-preview-2").disabled).toBe(true);
    click(testButton("practice-measure-preview-1"));
    click(testButton("practice-measure-preview-2"));
    expect(audio.previewMeasure).toHaveBeenCalledTimes(1);
  });

  it("마디 연주를 준비하거나 듣는 동안 그 마디만 취소·멈춤을 허용하고 다른 연주와 저장은 잠근다", () => {
    mount();
    changeValue("연습할 마디 수", "2");
    completeMeasure(0);
    completeMeasure(1);
    const before = savedDraft();
    audio.busy = true;
    audio.previewMeasureIndex = 1;
    audio.previewScoreIndex = 0;
    rerender();
    const cancel = testButton("practice-measure-preview-1");
    expect(cancel.textContent?.trim()).toBe("준비 취소");
    expect(cancel.disabled).toBe(false);
    expect(testButton("practice-measure-preview-0").disabled).toBe(true);
    expect(button("리듬 미리듣기").disabled).toBe(true);
    expect(button("소리 파일(MP3)").disabled).toBe(true);
    expect(button("음악 영상(MP4)").disabled).toBe(true);
    click(cancel);
    expect(audio.stop).toHaveBeenCalledTimes(1);

    audio.busy = false;
    audio.playing = true;
    rerender();
    const stop = testButton("practice-measure-preview-1");
    expect(stop.textContent?.trim()).toBe("멈추기");
    expect(stop.disabled).toBe(false);
    expect(testButton("practice-measure-preview-0").disabled).toBe(true);
    expect(button("리듬 미리듣기").disabled).toBe(true);
    click(stop);
    expect(audio.stop).toHaveBeenCalledTimes(2);
    expect(audio.previewMeasure).not.toHaveBeenCalled();
    expect(savedDraft()).toEqual(before);

    audio.previewMeasureIndex = null;
    audio.previewScoreIndex = null;
    rerender();
    expect(testButton("practice-measure-preview-0").disabled).toBe(true);
    expect(testButton("practice-measure-preview-1").disabled).toBe(true);
    expect(button("연주 멈추기").disabled).toBe(false);
    audio.playing = false;
    audio.busy = true;
    rerender();
    expect(testButton("practice-measure-preview-0").disabled).toBe(true);
    expect(testButton("practice-measure-preview-1").disabled).toBe(true);
  });

  it("가락 단계에서 박자를 미완성으로 고친 뒤에도 해당 마디의 가락 듣기를 유지한다", () => {
    mount(undefined, "melody");
    completeOneMeasure();
    changeValue("선택한 음표 길이", "2");
    const before = savedDraft();
    expect(validateMeasure(before.measures[0].notes, before.meter).state).toBe("over");
    expect(testButton("practice-measure-preview-0").disabled).toBe(false);
    click(testButton("practice-measure-preview-0"));
    expect(audio.previewMeasure).toHaveBeenCalledWith(0, 0);
    expect(latestAudioInput().step).toBe("melody");
    expect(savedDraft()).toEqual(before);
    expect(button("가락 미리듣기").disabled).toBe(true);
    expect(button("소리 파일(MP3)").disabled).toBe(true);
  });

  it.each(SUPPORTED_METERS)("$beats/$beatUnit박자에서 직접 만든 리듬과 가사를 그대로 가락의 높은 도에 놓는다", (meter) => {
    mount();
    changeValue("연습할 마디 수", "1");
    changeValue("연습 박자", `${meter.beats}/${meter.beatUnit}`);
    changeValue("1마디 가사", "반짝별아");
    const durations = meter.beats === 4 ? [1, 1, 1, 1]
      : meter.beats === 2 ? [0.5, 0.5, 0.5, 0.5] : [0.5, 0.5, 1, 1];
    durations.forEach((beats) => placeNote(0, 0, beats));

    expect(container?.textContent).toContain("1 / 1마디 박자 완성");
    expect(button("소리 파일(MP3)").disabled).toBe(false);
    expect(button("음악 영상(MP4)").disabled).toBe(false);
    const rhythmNotes = savedDraft().measures[0].notes;
    expect(validateMeasure(rhythmNotes, meter).state).toBe("exact");

    click(container?.querySelector<HTMLElement>("#practice-melody-tab") as HTMLElement);
    expect(container?.querySelector("#practice-melody-tab")?.getAttribute("aria-selected")).toBe("true");
    expect(savedDraft().measures[0].notes).toEqual(rhythmNotes);
    expect(container?.querySelectorAll(".practice-melody-row")).toHaveLength(8);
    expect(container?.querySelectorAll(".practice-pitch-row-label")[0]?.textContent).toBe("높은 도");
    expect(container?.querySelectorAll(".practice-pitch-row-label")[7]?.textContent).toBe("낮은 도");
    const firstId = rhythmNotes[0].id;
    click(testButton(`practice-melody-${firstId}-72`));
    const melodyNotes = savedDraft().measures[0].notes;
    expect(melodyNotes[0].pitch).toBe(72);
    expect(melodyNotes.map((note) => ({ id: note.id, duration: note.duration, lyric: note.lyric })))
      .toEqual(rhythmNotes.map((note) => ({ id: note.id, duration: note.duration, lyric: note.lyric })));
    expect(testButton(`practice-melody-${firstId}-72`).getAttribute("aria-pressed")).toBe("true");
    expect(testButton(`practice-melody-${firstId}-72`).getAttribute("aria-label")).toContain("높은 도");
    expect(latestAudioInput().step).toBe("melody");
    expect(latestAudioInput().measures[0].notes).toEqual(melodyNotes);

    click(button("가락 미리듣기"));
    click(button("소리 파일(MP3)"));
    click(button("음악 영상(MP4)"));
    expect(audio.preview).toHaveBeenCalledTimes(1);
    expect(audio.save.mock.calls).toEqual([["mp3"], ["mp4"]]);
  });

  it("설정한 네 마디를 함께 보여 주고 리듬을 모두 완성한 뒤 가락 단계로 넘어간다", () => {
    mount();
    changeValue("연습할 마디 수", "4");
    expect(container?.querySelectorAll(".practice-measure-card")).toHaveLength(4);
    expect(container?.querySelectorAll('[data-testid="practice-duration-0.5"]')).toHaveLength(1);
    const melodyTab = container?.querySelector<HTMLButtonElement>("#practice-melody-tab") as HTMLButtonElement;
    for (let index = 0; index < 4; index += 1) {
      expect(measureCard(index).querySelector(`[aria-label="${index + 1}마디 가사"]`)).not.toBeNull();
      expect(measureCard(index).querySelector(".practice-rhythm-timeline")).not.toBeNull();
    }
    completeMeasure(0);
    expect(container?.textContent).toContain("1 / 4마디 박자 완성");
    expect(melodyTab.disabled).toBe(true);
    click(melodyTab);
    expect(melodyTab.getAttribute("aria-selected")).toBe("false");
    expect(button("소리 파일(MP3)").disabled).toBe(true);
    expect(button("음악 영상(MP4)").disabled).toBe(true);
    expect(button("리듬 미리듣기").disabled).toBe(true);
    click(button("소리 파일(MP3)"));
    expect(audio.save).not.toHaveBeenCalled();
    for (let index = 1; index < 4; index += 1) {
      completeMeasure(index);
      expect(melodyTab.disabled).toBe(index < 3);
    }
    expect(container?.textContent).toContain("4 / 4마디 박자 완성");
    click(melodyTab);
    expect(melodyTab.getAttribute("aria-selected")).toBe("true");
    expect(container?.querySelectorAll(".practice-measure-card")).toHaveLength(4);
    expect(container?.querySelectorAll(".practice-melody-row")).toHaveLength(32);
  });

  it("박자 칸 아래 가사를 입력하고 모든 마디 아래에서 악기와 듣기를 설정한다", () => {
    mount();
    changeValue("연습할 마디 수", "4");
    const follows = (earlier: Element, later: Element) =>
      Boolean(earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING);
    for (let index = 0; index < 4; index += 1) {
      const card = measureCard(index);
      const rhythm = card.querySelector(".practice-rhythm-timeline") as Element;
      const lyric = card.querySelector(`[aria-label="${index + 1}마디 가사"]`) as Element;
      expect(follows(rhythm, lyric)).toBe(true);
      expect(follows(card, container?.querySelector(".practice-listen-card") as Element)).toBe(true);
    }
    expect(container?.querySelector(".practice-listen-card")?.closest("aside")).toBeNull();
    const shortestDuration = testButton("practice-duration-0.5");
    expect(shortestDuration.querySelector("small")?.textContent).toBe("0.5박");
    expect([...shortestDuration.querySelectorAll("span")].map((item) => item.textContent))
      .toContain("8분음표");
    expect(shortestDuration.textContent).not.toContain("반 박");
    expect(shortestDuration.textContent).not.toContain("·");
  });

  it("가락만들기에서 길이와 쉼표를 고치고 박자 오류를 바로 알리며 가사와 높이를 보존한다", () => {
    mount(undefined, "melody");
    completeOneMeasure();
    const original = savedDraft().measures[0].notes;
    click(button("글자 위치 고치기"));
    changeValue("1번째 음표 가사", "");
    expect(savedDraft().measures[0].notes[0].lyric).toBe("");
    expect(savedDraft().measures[0].notes.slice(1)).toEqual(original.slice(1));
    click(testButton(`practice-melody-${original[0].id}-67`));
    const selected = savedDraft().measures[0].notes;
    changeValue("선택한 음표 길이", "2");
    expect(validateMeasure(savedDraft().measures[0].notes, savedDraft().meter).state).toBe("over");
    expect(measureCard(0).querySelector(".practice-measure-validation")?.textContent).toContain("1박 넘쳤어요");
    expect(button("소리 파일(MP3)").disabled).toBe(true);
    expect(button("음악 영상(MP4)").disabled).toBe(true);
    expect(container?.querySelector("#practice-melody-tab")?.getAttribute("aria-selected")).toBe("true");
    expect(savedDraft().measures[0].notes.map((note) => ({ id: note.id, pitch: note.pitch, lyric: note.lyric })))
      .toEqual(selected.map((note) => ({ id: note.id, pitch: note.pitch, lyric: note.lyric })));
    changeValue("선택한 음표 길이", "1");
    expect(button("소리 파일(MP3)").disabled).toBe(false);
    click(testButton("practice-choose-rest"));
    click(testButton("practice-rest-1"));
    expect(savedDraft().measures[0].notes).toEqual(selected);
    expect(measureCard(0).querySelector(".practice-empty-slot")).toBeNull();
    changeValue("선택한 음표 길이", "0.5");
    const shortened = savedDraft().measures[0].notes;
    placeCurrentNote(0.5, true);
    const rest = savedDraft().measures[0].notes.at(-1);
    expect(rest?.pitch).toBeNull();
    expect(savedDraft().measures[0].notes.slice(0, -1)).toEqual(shortened);
    expect(button("소리 파일(MP3)").disabled).toBe(false);
    click(testButton("practice-delete-note"));
    expect(savedDraft().measures[0].notes).toEqual(shortened);
    expect(button("소리 파일(MP3)").disabled).toBe(true);
    click(testButton(`practice-melody-${original[0].id}-67`));
    changeValue("선택한 음표 길이", "1");
    expect(savedDraft().measures[0].notes).toEqual(selected);
    unmount();
    mount();
    expect(savedDraft().measures[0].notes).toEqual(selected);
    click(button("글자 위치 고치기"));
    expect(container?.querySelector<HTMLInputElement>('[aria-label="1번째 음표 가사"]')?.value).toBe("");
  });

  it("박자는 완성해도 가사 글자가 음표보다 많으면 MP4를 막고 필요한 글자 수를 알린다", () => {
    mount();
    completeOneMeasure();
    expect(button("음악 영상(MP4)").disabled).toBe(false);
    changeValue("1마디 가사", "반짝이는우리별");
    expect(measureCard(0).querySelector(".practice-lyric-warning strong")?.textContent).toBe("우리별");
    expect(container?.textContent).toContain("영상에 넣을 가사 3글자가 남았어요.");
    expect(button("소리 파일(MP3)").disabled).toBe(false);
    expect(button("음악 영상(MP4)").disabled).toBe(true);
    click(button("음악 영상(MP4)"));
    expect(audio.save).not.toHaveBeenCalled();
    expect(validateMeasure(savedDraft().measures[0].notes, savedDraft().meter).state).toBe("exact");
  });

  it("자동 저장한 가사·높이·악기·빠르기와 이름을 다시 열어 복원한다", () => {
    mount();
    completeOneMeasure();
    changeValue("연습 가락 이름", "우리들의 봄 가락");
    changeValue("연습 빠르기", "72");
    changeValue("리듬 연주 악기", "beat:clap");
    click(container?.querySelector<HTMLElement>("#practice-melody-tab") as HTMLElement);
    changeValue("가락 연주 악기", "violin");
    const firstId = savedDraft().measures[0].notes[0].id;
    click(testButton(`practice-melody-${firstId}-67`));
    const before = savedDraft();
    unmount();
    mount();

    expect(container?.querySelector<HTMLInputElement>('[aria-label="연습 가락 이름"]')?.value).toBe("우리들의 봄 가락");
    expect(container?.querySelector<HTMLInputElement>('[aria-label="1마디 가사"]')?.value).toBe("반짝별아");
    expect(savedDraft().melodyInstrumentId).toBe("violin");
    expect(container?.querySelector<HTMLSelectElement>('[aria-label="리듬 연주 악기"]')?.value).toBe("beat:clap");
    expect(container?.querySelector<HTMLSelectElement>('[aria-label="연습 빠르기"]')?.value).toBe("72");
    expect(latestAudioInput().measures).toEqual(before.measures);
    expect(latestAudioInput().title).toBe("우리들의 봄 가락");
    expect(button("소리 파일(MP3)").disabled).toBe(false);
    click(container?.querySelector<HTMLElement>("#practice-melody-tab") as HTMLElement);
    expect(container?.querySelector<HTMLSelectElement>('[aria-label="가락 연주 악기"]')?.value).toBe("violin");
    expect(testButton(`practice-melody-${firstId}-67`).getAttribute("aria-pressed")).toBe("true");
  });

  it("불안정한 음에 간접 힌트를 보여 주고 힌트를 눌러도 가락을 자동으로 바꾸지 않는다", () => {
    mount();
    completeOneMeasure();
    click(container?.querySelector<HTMLElement>("#practice-melody-tab") as HTMLElement);
    const firstId = savedDraft().measures[0].notes[0].id;
    click(testButton(`practice-melody-${firstId}-71`));
    const beforeHint = savedDraft().measures[0].notes;
    expect(container?.textContent).toContain("가락과 화음을 함께 살펴봐요");
    const hint = container?.querySelector<HTMLButtonElement>(".practice-harmony-warning button");
    expect(hint?.textContent).toMatch(/가까운.*음/);
    click(hint as HTMLButtonElement);
    expect(savedDraft().measures[0].notes).toEqual(beforeHint);
    expect(testButton(`practice-melody-${firstId}-71`).classList.contains("is-selected")).toBe(true);
  });

  it("네 단계 안내를 순서대로 보여 주고 마지막 안내에서 닫는다", () => {
    mount();
    click(button("처음이라면? 연습 안내"));
    const expectedTitles = ["한 마디부터 만들어요", "음표를 고르고 빈칸을 눌러요", "높낮이로 가락을 만들어요", "귀로 확인하고 간직해요"];
    expectedTitles.forEach((title, index) => {
      const tutorial = container?.querySelector('[aria-label="연습 튜토리얼"]');
      expect(tutorial?.querySelector("h2")?.textContent).toBe(title);
      expect(tutorial?.textContent).toContain(`${index + 1} / 4`);
      click(button(index === 3 ? "연습해 볼게요" : "다음 안내"));
    });
    expect(container?.querySelector('[aria-label="연습 튜토리얼"]')).toBeNull();
    expect(button("처음이라면? 연습 안내").getAttribute("aria-expanded")).toBe("false");
  });

  it("돌아갈 때 연주를 먼저 멈추고 상위 화면 닫기 함수를 호출한다", () => {
    audio.playing = true;
    const onClose = mount();
    click(button("돌아가기"));
    expect(audio.stop).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(audio.stop.mock.invocationCallOrder[0]).toBeLessThan(onClose.mock.invocationCallOrder[0]);
    expect(window.confirm).not.toHaveBeenCalled();
  });
});

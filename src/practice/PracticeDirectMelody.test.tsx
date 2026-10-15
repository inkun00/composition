import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  button, changeValue, click, completeOneMeasure, completeScoreMeasure, container, latestAudioInput, mount, rerender,
  savedDraft, scoreButton, testButton, unmount
} from "./PracticeMode.test.helpers";
import { PRACTICE_CREATION_MODES } from "./practiceCreationMode";
import { emptyPracticeDraft, PRACTICE_STORAGE_KEY } from "./practiceStorage";

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

function stage(id: "rhythm" | "melody" | "save"): HTMLButtonElement {
  const found = container?.querySelector<HTMLButtonElement>(`#practice-${id}-tab`);
  if (!found) throw new Error(`${id} 단계를 찾지 못했습니다.`);
  return found;
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  audio.busy = false;
  audio.playing = false;
  audio.previewMeasureIndex = null;
  audio.previewScoreIndex = null;
  audio.previewRhythmMixing = false;
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

afterEach(() => {
  unmount();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("음악 만들기 시작 모드", () => {
  it("처음에는 편집 화면 위 팝업으로 세 모드를 고르고 뒤의 화면은 잠근다", () => {
    mount(undefined, null);
    expect(savedDraft().mode).toBeNull();
    expect(container?.textContent).toContain("어떻게 만들까요?");
    for (const mode of PRACTICE_CREATION_MODES) expect(button(mode.label)).toBeTruthy();
    const screen = container?.querySelector(".practice-screen");
    expect(screen?.hasAttribute("inert")).toBe(true);
    expect(screen?.getAttribute("aria-hidden")).toBe("true");
    expect(screen?.querySelector("#practice-workspace")).not.toBeNull();
    expect(container?.querySelector('[role="dialog"]')?.getAttribute("aria-modal")).toBe("true");
    click(button("가락만들기"));
    expect(container?.querySelector('[role="dialog"]')).toBeNull();
    expect(screen?.hasAttribute("inert")).toBe(false);
    expect(screen?.getAttribute("aria-hidden")).not.toBe("true");
    click(testButton("practice-melody-empty-67-0"));
    expect(savedDraft().measures[0].notes[0].pitch).toBe(67);
  });

  it.each(["close", "escape", "backdrop"] as const)("처음 모드를 정하지 않고 %s로 닫으면 시작 화면으로 돌아간다", (method) => {
    const onClose = mount(vi.fn(), null);
    if (method === "close") click(button("모드 선택 창 닫기"));
    if (method === "escape") {
      act(() => document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    }
    if (method === "backdrop") {
      const backdrop = container?.querySelector<HTMLElement>(".practice-mode-overlay");
      if (!backdrop) throw new Error("모드 선택 팝업 배경을 찾지 못했습니다.");
      click(backdrop);
    }
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(savedDraft().mode).toBeNull();
    expect(savedDraft().measures.every((measure) => measure.notes.length === 0)).toBe(true);
  });

  it.each(["close", "escape", "backdrop"] as const)("모드 변경 팝업을 %s로 취소해도 같은 악보와 가사를 유지한다", (method) => {
    mount(undefined, "melody");
    click(testButton("practice-melody-empty-67-0"));
    changeValue("연습 가락 이름", "그대로 남는 노래");
    const original = savedDraft();
    const workspace = container?.querySelector("#practice-workspace");
    const opener = button("모드 바꾸기");
    opener.focus();
    click(opener);
    expect(container?.querySelector('[role="dialog"]')).not.toBeNull();
    expect(workspace).toBe(container?.querySelector("#practice-workspace"));
    if (method === "close") click(button("모드 선택 창 닫기"));
    if (method === "escape") {
      act(() => document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    }
    if (method === "backdrop") {
      const backdrop = container?.querySelector<HTMLElement>(".practice-mode-overlay");
      if (!backdrop) throw new Error("모드 선택 팝업 배경을 찾지 못했습니다.");
      click(backdrop);
    }
    expect(container?.querySelector('[role="dialog"]')).toBeNull();
    expect(container?.querySelector("#practice-workspace")).toBe(workspace);
    expect(savedDraft()).toEqual(original);
    expect(document.activeElement).toBe(opener);
  });

  it("리듬만들기는 가락 전환 없이 리듬만 듣고 저장한다", () => {
    mount(undefined, "rhythm");
    expect(savedDraft().mode).toBe("rhythm");
    expect(container?.querySelector("#practice-melody-tab")).toBeNull();
    expect(container?.querySelector('[aria-label="가락 연주 악기"]')).toBeNull();
    completeOneMeasure();
    click(button("리듬 미리듣기"));
    click(button("MP3 저장"));
    expect(audio.preview).toHaveBeenCalledTimes(1);
    expect(audio.save).toHaveBeenCalledWith("mp3");
    expect(latestAudioInput()).toMatchObject({ mode: "rhythm", step: "rhythm" });
  });

  it("리듬만들고 가락넣기는 먼저 박자를 완성하고 높낮이만 바꾸며 가락 악기로 듣는다", () => {
    mount(undefined, "rhythm-melody");
    expect(stage("melody").disabled).toBe(true);
    expect(button("가락 만들기로").disabled).toBe(true);
    completeOneMeasure();
    const original = savedDraft().measures[0].notes;
    click(button("가락 만들기로"));
    expect(stage("melody").getAttribute("aria-selected")).toBe("true");
    expect(container?.querySelector('[data-testid="practice-duration-1"]')).toBeNull();
    expect(container?.querySelector('[data-testid="practice-delete-note"]')).toBeNull();
    expect(container?.querySelector('[aria-label="선택한 음표 길이"]')).toBeNull();
    click(testButton(`practice-melody-${original[0].id}-67`));
    const melody = savedDraft().measures[0].notes;
    expect(melody[0].pitch).toBe(67);
    expect(melody.map((note) => ({ id: note.id, duration: note.duration, lyric: note.lyric })))
      .toEqual(original.map((note) => ({ id: note.id, duration: note.duration, lyric: note.lyric })));
    click(button("가락 미리듣기"));
    expect(latestAudioInput()).toMatchObject({ mode: "rhythm-melody", step: "melody", measures: savedDraft().measures });
    expect(audio.preview).toHaveBeenCalledTimes(1);
    click(button("리듬 만들기로"));
    expect(testButton("practice-duration-1")).toBeTruthy();
    expect(savedDraft().measures[0].notes).toEqual(melody);
  });

  it("가락 단계에서는 리듬 악보를 숨기고 원본을 보존하며 가락 악보만 편집하고 듣는다", () => {
    mount(undefined, "rhythm-melody");
    completeOneMeasure("우리노래");
    click(button("악보 추가하기"));
    completeScoreMeasure(1, 0, "같이해요");
    click(button("악보 추가하기"));
    completeScoreMeasure(2, 0, "반짝별아");
    const rhythms = savedDraft().rhythmLayers;
    expect(container?.querySelectorAll(".practice-score-workspace")).toHaveLength(3);
    expect(button("리듬 함께 듣기")).toBeTruthy();

    click(button("가락 만들기로"));
    expect(container?.querySelectorAll(".practice-score-workspace")).toHaveLength(1);
    expect(container?.querySelector('[aria-label="리듬 연주 악기"]')).toBeNull();
    expect(container?.querySelector('[aria-label="2번 악보 리듬 연주 악기"]')).toBeNull();
    expect(container?.querySelector(".practice-add-score")).toBeNull();
    expect(container?.textContent).not.toContain("리듬 함께 듣기");
    expect(container?.textContent).not.toContain("리듬과 가락");
    expect(container?.textContent).toContain("1 / 1마디 박자 완성");
    expect(container?.textContent).toContain("가락 듣고 저장하기");
    expect(container?.textContent).toContain("만든 리듬이 가락에 담겼어요. 가락 악기로만 연주해요.");
    changeValue("가락 연주 악기", "flute");
    const firstNote = savedDraft().measures[0].notes[0];
    click(testButton(`practice-melody-${firstNote.id}-67`));
    click(testButton("practice-measure-preview-0"));
    click(testButton("practice-score-preview-0"));
    click(button("가락 미리듣기"));
    expect(audio.previewMeasure).toHaveBeenCalledWith(0, 0);
    expect(audio.previewScore).toHaveBeenCalledWith(0);
    expect(audio.preview).toHaveBeenCalledTimes(1);
    expect(latestAudioInput()).toMatchObject({
      mode: "rhythm-melody", step: "melody", melodyInstrumentId: "flute", rhythmLayers: rhythms
    });
    expect(savedDraft().rhythmLayers).toEqual(rhythms);

    click(button("리듬 만들기로"));
    expect(container?.querySelectorAll(".practice-score-workspace")).toHaveLength(3);
    expect(container?.querySelector('[aria-label="리듬 연주 악기"]')).not.toBeNull();
    expect(container?.querySelector('[aria-label="가락 연주 악기"]')).toBeNull();
    expect(button("리듬 함께 듣기")).toBeTruthy();
    expect(savedDraft().rhythmLayers).toEqual(rhythms);
    expect(savedDraft().measures[0].notes[0].pitch).toBe(67);
    expect(latestAudioInput().step).toBe("rhythm");
  });

  it("주악보가 쉼표뿐이면 박자를 완성해도 가락을 붙일 음표가 필요하다고 안내한다", () => {
    mount(undefined, "rhythm-melody");
    changeValue("연습할 마디 수", "1");
    click(testButton("practice-rest-4"));
    click(button("악보 추가하기"));
    click(scoreButton(1, "practice-duration-4"));
    expect(button("MP3 저장").disabled).toBe(false);
    expect(stage("melody").disabled).toBe(true);
    expect(container?.textContent).toContain("가락을 붙일 악보 1에 소리 나는 음표를 넣어 주세요.");
  });

  it("기존 가락을 모드 전환으로 지우지 않고 가락만들기는 숨겨진 리듬 악보를 함께 듣지 않는다", () => {
    mount(undefined, "rhythm");
    click(button("악보 추가하기"));
    click(scoreButton(1, "practice-duration-1"));
    const originalLayers = savedDraft().rhythmLayers;
    click(button("모드 바꾸기"));
    click(button("가락만들기"));
    expect(savedDraft().mode).toBe("melody");
    expect(savedDraft().rhythmLayers).toEqual(originalLayers);
    expect(container?.querySelector('[data-testid="practice-score-workspace-1"]')).toBeNull();
    expect(container?.querySelector("#practice-rhythm-tab")).toBeNull();
    expect(container?.querySelector(".practice-add-score")).toBeNull();
    click(testButton("practice-melody-empty-67-0"));
    expect(savedDraft().measures[0].notes[0].pitch).toBe(67);
    expect(latestAudioInput().mode).toBe("melody");
    click(button("모드 바꾸기"));
    click(button("리듬만들기"));
    expect(savedDraft().rhythmLayers).toEqual(originalLayers);
    expect(savedDraft().measures[0].notes[0].pitch).toBe(67);
    expect(container?.querySelector('[data-testid="practice-score-workspace-1"]')).not.toBeNull();
  });

  it("모드 정보가 없던 이전 악보도 삭제하지 않고 모드를 고르게 한다", () => {
    const draft = emptyPracticeDraft();
    draft.measures[0].notes = [{ id: "existing", pitch: 67, duration: { numerator: 1, denominator: 1 } }];
    const { mode: _mode, ...legacyDraft } = draft;
    localStorage.setItem(PRACTICE_STORAGE_KEY, JSON.stringify(legacyDraft));
    mount(undefined, null);
    expect(savedDraft().measures[0].notes[0].id).toBe("existing");
    expect(container?.querySelector(".practice-mode-chooser")).not.toBeNull();
    click(button("가락만들기"));
    expect(savedDraft().measures[0].notes[0].pitch).toBe(67);
  });
});

describe("리듬 없이 바로 가락 만들기", () => {
  it("빈칸에서 첫 음을 넣고 원하는 높낮이와 쉼표를 더해 미리 듣고 저장한다", () => {
    mount(undefined, "melody");
    changeValue("연습할 마디 수", "1");
    expect(stage("melody").getAttribute("aria-selected")).toBe("true");
    expect(testButton("practice-measure-preview-0").textContent?.trim()).toBe("미리 듣기");
    expect(testButton("practice-measure-preview-0").disabled).toBe(true);
    changeValue("가락 연주 악기", "flute");
    click(testButton("practice-melody-empty-67-0"));
    click(testButton("practice-melody-empty-64-2"));
    const partial = savedDraft();
    expect(partial.measures[0].notes.map((note) => note.pitch)).toEqual([67, 64]);
    expect(button("MP3 저장").disabled).toBe(true);
    click(testButton("practice-measure-preview-0"));
    expect(audio.previewMeasure).toHaveBeenCalledWith(0, 0);
    expect(latestAudioInput()).toMatchObject({ mode: "melody", step: "melody", melodyInstrumentId: "flute" });
    click(testButton("practice-rest-1"));
    click(testButton("practice-duration-1"));
    expect(savedDraft().measures[0].notes.map((note) => note.pitch)).toEqual([67, 64, null, 60]);
    expect(button("MP3 저장").disabled).toBe(false);
    expect(button("MP4 저장").disabled).toBe(false);
    click(button("가락 미리듣기"));
    click(button("MP3 저장"));
    expect(audio.preview).toHaveBeenCalledTimes(1);
    expect(audio.save).toHaveBeenCalledWith("mp3");
  });

  it("빈 악보에서 팔레트로 첫 음을 넣고 다시 열어도 가락 모드와 음높이를 복원한다", () => {
    mount(undefined, "melody");
    click(testButton("practice-pitch-72"));
    const original = savedDraft();
    expect(original.measures[0].notes[0].pitch).toBe(72);
    unmount();
    mount();
    expect(savedDraft()).toEqual(original);
    expect(stage("melody").getAttribute("aria-selected")).toBe("true");
    expect(container?.querySelector(".practice-mode-chooser")).toBeNull();
    expect(container?.querySelector(".practice-rhythm-timeline")).toBeNull();
  });

  it("가락만들기에서 쉼표만 넣으면 소리 없는 미리 듣기와 저장을 잠근다", () => {
    mount(undefined, "melody");
    changeValue("연습할 마디 수", "1");
    click(testButton("practice-rest-4"));
    expect(stage("melody").getAttribute("aria-selected")).toBe("true");
    expect(testButton("practice-measure-preview-0").disabled).toBe(true);
    expect(button("MP3 저장").disabled).toBe(true);
    expect(button("MP4 저장").disabled).toBe(true);
  });

  it("가락만들기에서는 저장으로 키보드 이동하고 연주 중에는 빈칸·모드 전환을 잠근다", () => {
    mount(undefined, "melody");
    act(() => stage("melody").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    expect(stage("save").getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(stage("save"));
    click(stage("melody"));
    audio.busy = true;
    rerender();
    expect(button("모드 바꾸기").disabled).toBe(true);
    expect(testButton("practice-melody-empty-67-0").disabled).toBe(true);
    expect(testButton("practice-pitch-72").disabled).toBe(true);
  });
});

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  button, changeValue, click, container, latestAudioInput, mount, rerender,
  savedDraft, scoreButton, testButton, unmount
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

describe("리듬을 먼저 만들지 않는 가락 연습", () => {
  it("빈 악보에서 바로 가락을 넣고 높낮이를 듣다가 다시 돌아와도 음표를 보존한다", () => {
    mount();
    changeValue("연습할 마디 수", "1");
    const empty = savedDraft();
    expect(stage("melody").disabled).toBe(false);
    expect(button("가락 만들기로").disabled).toBe(false);
    click(button("가락 만들기로"));
    expect(stage("melody").getAttribute("aria-selected")).toBe("true");
    expect(savedDraft()).toEqual(empty);
    expect(testButton("practice-measure-preview-0").textContent?.trim()).toBe("미리 듣기");
    expect(testButton("practice-measure-preview-0").getAttribute("aria-label"))
      .toBe("1마디 가락 미리 듣기");
    expect(testButton("practice-measure-preview-0").disabled).toBe(true);

    changeValue("가락 연주 악기", "flute");
    click(testButton("practice-duration-0.25"));
    const first = savedDraft().measures[0].notes[0];
    click(testButton(`practice-melody-${first.id}-67`));
    click(testButton("practice-duration-1"));
    const second = savedDraft().measures[0].notes[1];
    click(testButton(`practice-melody-${second.id}-64`));
    const partial = savedDraft();
    expect(partial.measures[0].notes.map((note) => note.pitch)).toEqual([67, 64]);
    expect(button("MP3 저장").disabled).toBe(true);
    expect(button("MP4 저장").disabled).toBe(true);
    click(testButton("practice-measure-preview-0"));
    expect(audio.previewMeasure).toHaveBeenCalledWith(0, 0);
    expect(latestAudioInput()).toMatchObject({
      step: "melody", melodyInstrumentId: "flute", measures: partial.measures
    });

    click(stage("rhythm"));
    expect(testButton("practice-measure-preview-0").textContent?.trim()).toBe("미리듣기");
    expect(savedDraft()).toEqual(partial);
    click(stage("melody"));
    expect(savedDraft()).toEqual(partial);
    expect(testButton(`practice-melody-${first.id}-67`).getAttribute("aria-pressed")).toBe("true");
    click(testButton("practice-rest-0.25"));
    click(testButton("practice-duration-0.5"));
    click(testButton("practice-duration-2"));
    expect(savedDraft().measures[0].notes.map((note) => note.duration)).toEqual([
      { numerator: 1, denominator: 4 }, { numerator: 1, denominator: 1 },
      { numerator: 1, denominator: 4 }, { numerator: 1, denominator: 2 },
      { numerator: 2, denominator: 1 }
    ]);
    expect(button("MP3 저장").disabled).toBe(false);
    expect(button("MP4 저장").disabled).toBe(false);
    click(button("MP3 저장"));
    expect(audio.save).toHaveBeenCalledWith("mp3");
  });

  it("추가 악보를 편집하다 가락으로 가면 첫 악보를 선택하고 추가 리듬의 이름을 보존한다", () => {
    mount();
    click(button("악보 추가하기"));
    click(scoreButton(1, "practice-duration-1"));
    const before = savedDraft();
    expect(testButton("practice-score-select-1").getAttribute("aria-pressed")).toBe("true");
    click(stage("melody"));
    expect(testButton("practice-score-select-0").getAttribute("aria-pressed")).toBe("true");
    expect(savedDraft()).toEqual(before);
    expect(testButton("practice-score-1-measure-preview-0").textContent?.trim()).toBe("미리듣기");
    expect(testButton("practice-score-1-measure-preview-0").getAttribute("aria-label"))
      .toBe("2번 악보 1마디 리듬 미리듣기");
    click(testButton("practice-duration-1"));
    expect(savedDraft().measures[0].notes).toHaveLength(1);
    expect(savedDraft().rhythmLayers).toEqual(before.rhythmLayers);
    expect(button("MP3 저장").disabled).toBe(true);
  });

  it("쉼표만 있는 마디도 가락을 열지만 소리 없는 미리 듣기와 저장은 잠근다", () => {
    mount();
    changeValue("연습할 마디 수", "1");
    click(testButton("practice-rest-4"));
    const before = savedDraft();
    click(stage("melody"));
    expect(stage("melody").getAttribute("aria-selected")).toBe("true");
    expect(savedDraft()).toEqual(before);
    expect(testButton("practice-measure-preview-0").disabled).toBe(true);
    expect(button("MP3 저장").disabled).toBe(true);
    expect(button("MP4 저장").disabled).toBe(true);
  });

  it("빈 악보에서도 키보드 단계 이동에 가락을 포함하고 재생 중에는 전환을 막는다", () => {
    mount();
    click(stage("rhythm"));
    act(() => stage("rhythm").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    expect(stage("melody").getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(stage("melody"));
    expect(savedDraft().measures.every((measure) => measure.notes.length === 0)).toBe(true);
    click(stage("rhythm"));
    audio.busy = true;
    rerender();
    expect(stage("melody").disabled).toBe(true);
    expect(button("가락 만들기로").disabled).toBe(true);
    click(stage("melody"));
    expect(stage("rhythm").getAttribute("aria-selected")).toBe("true");
  });
});

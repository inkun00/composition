import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  button, click, container, latestAudioInput, mount, rerender, savedDraft,
  testButton, unmount
} from "./PracticeMode.test.helpers";
import { practiceCreationModeLabel, type PracticeCreationMode } from "./practiceCreationMode";
import { createPracticeMeasures } from "./practiceModel";
import { emptyPracticeDraft, PRACTICE_STORAGE_KEY, type PracticeDraft } from "./practiceStorage";

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
vi.mock("./PracticeVideoPreview", () => ({
  default: () => <div data-testid="restart-video-preview" />
}));
vi.mock("../components/ScoreMeasure", () => ({ default: () => <div aria-label="연습 악보" /> }));

const creationModes: PracticeCreationMode[] = ["rhythm", "rhythm-melody", "melody"];

function storedPractice(mode: PracticeCreationMode): PracticeDraft {
  const measures = (prefix: string) => createPracticeMeasures(4).map((measure, index) => ({
    ...measure,
    id: `${prefix}-measure-${index + 1}`,
    lyric: "새",
    notes: [
      { id: `${prefix}-note-${index}`, pitch: 67, duration: { numerator: 2, denominator: 1 }, lyric: "새" },
      { id: `${prefix}-rest-${index}`, pitch: null, duration: { numerator: 1, denominator: 1 } }
    ]
  }));
  return {
    ...emptyPracticeDraft(),
    mode,
    title: "다시 열었던 음악",
    meter: { beats: 3, beatUnit: 4 },
    bpm: 144,
    melodyInstrumentId: "flute",
    rhythmInstrumentId: "beat:clap",
    measures: measures("practice"),
    rhythmLayers: [
      { id: "saved-layer-1", instrumentId: "beat:shaker", measures: measures("saved-layer-1") },
      { id: "saved-layer-2", instrumentId: "beat:kick", measures: measures("saved-layer-2") }
    ]
  };
}

function restore(mode: PracticeCreationMode): void {
  localStorage.setItem(PRACTICE_STORAGE_KEY, JSON.stringify(storedPractice(mode)));
  mount(undefined, mode);
}

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
  audio.status = "";
  audio.progress = 0;
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

afterEach(() => {
  unmount();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("기능 연습하기 새로 시작", () => {
  it.each(creationModes)("%s의 모드 바꾸기 바로 왼쪽에 새로 시작하기를 배치한다", (mode) => {
    restore(mode);
    const restart = button("새로 시작하기");
    const modeChange = button("모드 바꾸기");
    expect(restart.parentElement).toBe(modeChange.parentElement);
    expect(restart.nextElementSibling).toBe(modeChange);
    expect(restart.disabled).toBe(false);
  });

  it.each(creationModes)("%s에서 새로 시작을 취소하면 음표·쉼표·가사·설정을 전부 보존한다", (mode) => {
    restore(mode);
    const original = savedDraft();
    const workspace = container?.querySelector("#practice-workspace");
    vi.mocked(window.confirm).mockReturnValueOnce(false);

    click(button("새로 시작하기"));

    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(savedDraft()).toEqual(original);
    expect(container?.querySelector("#practice-workspace")).toBe(workspace);
    expect(container?.querySelector('[role="dialog"]')).toBeNull();
    expect(container?.querySelector(".practice-mode-current strong")?.textContent)
      .toBe(practiceCreationModeLabel(mode));
    expect(latestAudioInput().measures).toEqual(original.measures);
  });

  it.each(creationModes)("%s에서 확인하면 숨긴 악보까지 지우고 모드를 새로 고르게 한다", (mode) => {
    restore(mode);
    localStorage.setItem("other-composition-project", "보존할 작곡 프로젝트");
    if (mode === "rhythm-melody") click(stage("melody"));
    if (mode !== "rhythm") {
      expect(container?.querySelector('[data-testid="practice-score-workspace-1"]')).toBeNull();
      expect(savedDraft().rhythmLayers).toHaveLength(2);
    }

    click(button("새로 시작하기"));

    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(savedDraft()).toEqual(emptyPracticeDraft());
    expect(container?.querySelector('[role="dialog"]')).not.toBeNull();
    expect(container?.querySelector(".practice-screen")?.hasAttribute("inert")).toBe(true);
    expect(container?.querySelector(".practice-mode-current strong")?.textContent).toBe("만들 방법을 골라 주세요");
    expect(latestAudioInput()).toMatchObject({ step: "rhythm", rhythmLayers: [] });
    expect(localStorage.getItem("other-composition-project")).toBe("보존할 작곡 프로젝트");

    click(button("가락만들기"));
    expect(savedDraft()).toEqual({ ...emptyPracticeDraft(), mode: "melody" });
    expect(stage("melody").getAttribute("aria-selected")).toBe("true");
    expect(button("MP3 저장").disabled).toBe(true);
    expect(button("MP4 저장").disabled).toBe(true);
    expect(container?.querySelectorAll(".practice-score-workspace")).toHaveLength(1);
    expect(container?.querySelectorAll(".practice-measure-card")).toHaveLength(2);
    expect(container?.querySelectorAll(".practice-lyric-entry input")).toHaveLength(2);
    for (const input of container?.querySelectorAll<HTMLInputElement>(".practice-lyric-entry input") ?? []) {
      expect(input.value).toBe("");
    }
  });

  it("추가 악보의 뒤 마디·악보 입력·영상 저장 설정에서 새로 시작해도 첫 마디의 기본 편집으로 돌아간다", () => {
    restore("rhythm-melody");
    click(testButton("practice-score-2-measure-3"));
    click(button("악보에 넣기"));
    click(stage("melody"));
    click(stage("save"));
    const scoreMode = [...(container?.querySelectorAll<HTMLButtonElement>(".practice-video-modes button") ?? [])]
      .find((item) => item.textContent?.includes("악보 모드"));
    if (!scoreMode) throw new Error("영상의 악보 모드를 찾지 못했습니다.");
    click(scoreMode);
    expect(latestAudioInput().videoMode).toBe("score");
    expect(container?.querySelector('[data-testid="restart-video-preview"]')).not.toBeNull();

    click(button("새로 시작하기"));
    click(button("리듬만들기"));

    expect(latestAudioInput()).toMatchObject({ step: "rhythm", videoMode: "bars", rhythmLayers: [] });
    expect(stage("rhythm").getAttribute("aria-selected")).toBe("true");
    expect(stage("save").getAttribute("aria-selected")).toBe("false");
    expect(container?.querySelector<HTMLElement>("#practice-workspace")?.hidden).toBe(false);
    expect(container?.querySelector('[data-testid="restart-video-preview"]')).toBeNull();
    expect(testButton("practice-measure-0").getAttribute("aria-pressed")).toBe("true");
    expect(testButton("practice-measure-1").getAttribute("aria-pressed")).toBe("false");
    expect(button("칸 채우기").getAttribute("aria-pressed")).toBe("true");
    expect(button("악보에 넣기").getAttribute("aria-pressed")).toBe("false");
    expect(testButton("practice-delete-note").disabled).toBe(true);
    click(testButton("practice-duration-1"));
    expect(savedDraft().measures[0].notes).toHaveLength(1);
    expect(savedDraft().measures[1].notes).toHaveLength(0);
    expect(savedDraft().rhythmLayers).toEqual([]);
  });

  it("초기화 직후 나갔다 다시 열어도 옛 음표와 리듬 악보를 복구하지 않는다", () => {
    restore("melody");
    click(button("새로 시작하기"));
    expect(savedDraft()).toEqual(emptyPracticeDraft());
    unmount();
    mount(undefined, null);

    expect(savedDraft()).toEqual(emptyPracticeDraft());
    expect(container?.querySelector('[role="dialog"]')).not.toBeNull();
    click(button("리듬만들고 가락넣기"));
    expect(savedDraft().rhythmLayers).toEqual([]);
    expect(savedDraft().measures.every((measure) => measure.notes.length === 0 && measure.lyric === "")).toBe(true);
    expect(stage("melody").disabled).toBe(true);
    expect(latestAudioInput().step).toBe("rhythm");
  });

  it("새로 시작하면 마지막에 고른 짧은 쉼표 대신 기본 1박 음표로 다시 입력한다", () => {
    restore("melody");
    click(testButton("practice-rest-0.25"));
    expect(testButton("practice-rest-0.25").getAttribute("aria-pressed")).toBe("true");

    click(button("새로 시작하기"));
    click(button("가락만들기"));

    expect(testButton("practice-duration-1").getAttribute("aria-pressed")).toBe("true");
    expect(testButton("practice-rest-0.25").getAttribute("aria-pressed")).toBe("false");
    click(testButton("practice-melody-empty-67-0"));
    expect(savedDraft().measures[0].notes).toHaveLength(1);
    expect(savedDraft().measures[0].notes[0]).toMatchObject({
      pitch: 67,
      duration: { numerator: 1, denominator: 1 }
    });
  });

  it.each(["busy", "playing"] as const)("%s 중에는 새로 시작을 잠가 작업과 재생을 보호한다", (state) => {
    restore("rhythm-melody");
    const original = savedDraft();
    audio[state] = true;
    rerender();

    expect(button("새로 시작하기").disabled).toBe(true);
    click(button("새로 시작하기"));
    expect(window.confirm).not.toHaveBeenCalled();
    expect(savedDraft()).toEqual(original);

    audio[state] = false;
    rerender();
    expect(button("새로 시작하기").disabled).toBe(false);
    click(button("새로 시작하기"));
    expect(savedDraft()).toEqual(emptyPracticeDraft());
  });
});

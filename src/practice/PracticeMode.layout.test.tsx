import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NoteEvent } from "../music/types";
import {
  button, changeValue, click, completeScoreMeasure, container, mount, placeNote,
  rerender, savedDraft, scoreCard, testButton, unmount
} from "./PracticeMode.test.helpers";

const audio = vi.hoisted(() => ({
  busy: false,
  playing: false,
  previewMeasureIndex: null as number | null,
  previewScoreIndex: null as number | null,
  previewRhythmMixing: false,
  playingNoteId: null as string | null,
  playingNoteIds: [] as readonly string[],
  status: "",
  progress: 0,
  preview: vi.fn(),
  previewMeasure: vi.fn(),
  previewRhythmMix: vi.fn(),
  save: vi.fn(),
  stop: vi.fn()
}));

vi.mock("./usePracticeAudio", () => ({ usePracticeAudio: vi.fn(() => audio) }));
vi.mock("../components/ScoreMeasure", () => ({
  default: ({ notes }: { notes: readonly NoteEvent[] }) => (
    <div data-testid="layout-mock-score" data-notes={JSON.stringify(notes)} />
  )
}));

function inputGroups(): HTMLElement[] {
  return [...(container?.querySelectorAll<HTMLElement>(".practice-input-toggle") ?? [])];
}

function groupButton(group: HTMLElement, label: string): HTMLButtonElement {
  const result = [...group.querySelectorAll<HTMLButtonElement>("button")]
    .find((item) => item.textContent === label);
  if (!result) throw new Error(`${label} 버튼을 찾지 못했습니다.`);
  return result;
}

function expectModeGroups(scoreCount: number, mode: "grid" | "score"): void {
  expect(container?.querySelector(".practice-workspace-heading .practice-input-toggle")).toBeNull();
  const groups = inputGroups();
  expect(groups).toHaveLength(scoreCount);
  groups.forEach((group, index) => {
    expect(group.getAttribute("role")).toBe("group");
    expect(group.getAttribute("aria-label")).toBe(index === 0 ? "음표 입력 방식" : `${index + 1}번 악보 음표 입력 방식`);
    expect(group.parentElement?.getAttribute("data-testid")).toBe(`practice-score-workspace-${index}`);
    expect(group.nextElementSibling?.classList.contains("practice-measures-overview")).toBe(true);
    expect(groupButton(group, "칸 채우기").getAttribute("aria-pressed")).toBe(String(mode === "grid"));
    expect(groupButton(group, "악보에 넣기").getAttribute("aria-pressed")).toBe(String(mode === "score"));
  });
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  audio.busy = false;
  audio.playing = false;
  audio.previewMeasureIndex = null;
  audio.previewScoreIndex = null;
  audio.playingNoteId = null;
  audio.playingNoteIds = [];
  audio.status = "";
  audio.progress = 0;
});

afterEach(() => {
  unmount();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("마디 바로 위의 입력 방식과 재생 표시", () => {
  it.each([1, 3])("악보 %i개의 마디 바로 위에서 입력 방식을 바꾸며 완성한 리듬과 가락을 보존한다", (scoreCount) => {
    mount();
    changeValue("연습할 마디 수", "1");
    for (let index = 1; index < scoreCount; index += 1) click(button("악보 추가하기"));
    for (let index = 0; index < scoreCount; index += 1) completeScoreMeasure(index, 0, "우리노래");
    expectModeGroups(scoreCount, "grid");
    const rhythmDraft = savedDraft();
    click(groupButton(inputGroups().at(-1) as HTMLElement, "악보에 넣기"));
    expectModeGroups(scoreCount, "score");
    expect(container?.querySelectorAll('[data-testid="layout-mock-score"]')).toHaveLength(scoreCount);
    expect(savedDraft()).toEqual(rhythmDraft);
    click(groupButton(inputGroups()[0], "칸 채우기"));
    click(container?.querySelector<HTMLElement>("#practice-melody-tab") as HTMLElement);
    const firstId = savedDraft().measures[0].notes[0].id;
    click(testButton(`practice-melody-${firstId}-67`));
    const melodyDraft = savedDraft();
    click(groupButton(inputGroups().at(-1) as HTMLElement, "악보에 넣기"));
    expectModeGroups(scoreCount, "score");
    expect(savedDraft()).toEqual(melodyDraft);
    expect(scoreCard(0, 0).querySelector('[data-testid="layout-mock-score"]')?.getAttribute("data-notes"))
      .toBe(JSON.stringify(melodyDraft.measures[0].notes));
    click(groupButton(inputGroups()[0], "칸 채우기"));
    expectModeGroups(scoreCount, "grid");
    expect(testButton(`practice-melody-${firstId}-67`).classList.contains("is-filled")).toBe(true);
    expect(savedDraft()).toEqual(melodyDraft);
    expect(container?.querySelector(".practice-beat-header")).toBeNull();
  });

  it.each(["busy", "playing"] as const)("%s 중에는 각 악보의 입력 방식 버튼이 편집을 막는다", (state) => {
    mount();
    click(button("악보 추가하기"));
    click(button("악보 추가하기"));
    const before = savedDraft();
    audio[state] = true;
    rerender();
    inputGroups().forEach((group) => {
      expect(groupButton(group, "칸 채우기").disabled).toBe(true);
      expect(groupButton(group, "악보에 넣기").disabled).toBe(true);
      click(groupButton(group, "악보에 넣기"));
    });
    expectModeGroups(3, "grid");
    expect(container?.querySelector('[data-testid="layout-mock-score"]')).toBeNull();
    expect(savedDraft()).toEqual(before);
  });

  it("칸 위 숫자 없이도 미완성 마디의 현재 박자 위치와 쉼표·가사 강조를 표시한다", () => {
    mount();
    changeValue("연습할 마디 수", "1");
    changeValue("1마디 가사", "봄빛");
    placeNote(0, 0, .5);
    click(testButton("practice-duration-1"));
    click(testButton("practice-add-rest"));
    placeNote(0, 0, .5);
    const rest = savedDraft().measures[0].notes[1];
    click(testButton("practice-measure-preview-0"));
    expect(audio.previewMeasure).toHaveBeenCalledWith(0, 0);
    audio.playing = true;
    audio.previewMeasureIndex = 0;
    audio.previewScoreIndex = 0;
    audio.playingNoteId = rest.id;
    audio.playingNoteIds = [rest.id];
    rerender();
    expect(scoreCard(0, 0).querySelector(".practice-playback-indicator")?.textContent)
      .toContain("재생 중 · 2번째 쉼표 · 1.5박부터 1박");
    expect(testButton(`practice-rhythm-note-${rest.id}`).classList.contains("is-playing")).toBe(true);
    expect(scoreCard(0, 0).querySelector(".practice-lyric-rest.is-playing")).not.toBeNull();
    expect(container?.querySelector(".practice-beat-header")).toBeNull();
    audio.playing = false;
    audio.previewMeasureIndex = null;
    audio.previewScoreIndex = null;
    audio.playingNoteId = null;
    audio.playingNoteIds = [];
    rerender();
    expect(container?.querySelector(".practice-playback-indicator")).toBeNull();
    expect(scoreCard(0, 0).querySelector(".practice-rhythm-block.is-playing")).toBeNull();
    expect(scoreCard(0, 0).querySelector(".practice-lyric-cell.is-playing")).toBeNull();
  });
});

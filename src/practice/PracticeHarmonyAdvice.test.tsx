import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rational } from "../music/rational";
import type { NoteEvent } from "../music/types";
import {
  click, container, measureCard, mount, savedDraft, testButton, unmount
} from "./PracticeMode.test.helpers";
import { emptyPracticeDraft, PRACTICE_STORAGE_KEY } from "./practiceStorage";
import type { PracticeMeasure } from "./practiceModel";

vi.mock("./usePracticeAudio", () => ({
  usePracticeAudio: vi.fn(() => ({
    busy: false, playing: false, previewMeasureIndex: null, previewScoreIndex: null,
    previewRhythmMixing: false, playingNoteId: null, playingNoteIds: [],
    status: "", progress: 0, preview: vi.fn(), previewMeasure: vi.fn(),
    previewRhythmMix: vi.fn(), save: vi.fn(), stop: vi.fn()
  }))
}));
vi.mock("../components/ScoreMeasure", () => ({ default: () => <div aria-label="연습 악보" /> }));

function note(id: string, pitch: number | null, beats: number): NoteEvent {
  return { id, pitch, duration: rational(beats * 2, 2), lyric: "" };
}

function openMelody(measures: PracticeMeasure[]): void {
  const draft = { ...emptyPracticeDraft(), measures };
  localStorage.setItem(PRACTICE_STORAGE_KEY, JSON.stringify(draft));
  mount();
  click(container?.querySelector<HTMLElement>("#practice-melody-tab") as HTMLElement);
}

function measure(id: string, notes: NoteEvent[], chord = "C"): PracticeMeasure {
  return { id, notes, chord, lyric: "" };
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

afterEach(() => {
  unmount();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("화음 안내를 실제 가락의 맥락에 맞춰 보여 주기", () => {
  it("화음 구성음만 있는 가락은 사실을 설명하고 소리의 편안함을 보장하지 않는다", () => {
    openMelody([measure("first", [note("c", 60, 1), note("e", 64, 1), note("g", 67, 2)])]);
    const summary = measureCard(0).querySelector(".practice-measure-harmony-good");
    expect(summary?.textContent).toContain("구성음");
    expect(summary?.textContent).not.toContain("편안하게 어울려요");
    expect(measureCard(0).querySelector(".practice-harmony-warning")).toBeNull();
  });

  it("다음 마디의 화음 구성음으로 이어지는 음을 곡의 마지막 음처럼 경고하지 않는다", () => {
    openMelody([
      measure("first", [note("c", 60, 3), note("d", 62, 1)]),
      measure("second", [note("e", 64, 4)])
    ]);
    const firstCard = measureCard(0);
    expect(firstCard.querySelector(".practice-harmony-warning")).toBeNull();
    expect(firstCard.textContent).not.toContain("편안하게 마치고 싶다면");
    expect(firstCard.querySelector(".practice-measure-harmony-good")?.textContent).not.toContain("편안하게 어울려요");
  });

  it("첨부 화면처럼 약박의 반 박 음이 순차 진행으로 풀리지 않으면 무조건 어울린다고 안내하지 않는다", () => {
    openMelody([
      measure("first", [
        note("e1", 64, 1), note("f1", 65, 1), note("g1", 67, 0.5),
        note("e2", 64, 0.5), note("a1", 69, 0.5), note("f2", 65, 0.5)
      ]),
      measure("second", [
        note("a2", 69, 2), note("f3", 65, 0.5), note("e3", 64, 0.5), note("a3", 69, 1)
      ], "G")
    ]);
    expect(measureCard(0).querySelector(".practice-harmony-warning")).not.toBeNull();
    expect(measureCard(0).textContent).not.toContain("화음과 편안하게 어울려요");
    const warnings = measureCard(1).querySelectorAll(".practice-harmony-warning button");
    const messages = [...warnings].map((button) => button.textContent);
    expect(messages.length).toBeGreaterThan(0);
    expect(new Set(messages).size).toBe(messages.length);
  });

  it("힌트를 선택해도 가락을 자동으로 바꾸지 않으며 평가처럼 단정하지 않는다", () => {
    openMelody([measure("first", [note("d", 62, 1), note("g", 67, 3)])]);
    const before = savedDraft().measures[0].notes;
    const warning = measureCard(0).querySelector(".practice-harmony-warning");
    expect(warning?.querySelector("strong")?.textContent).toBe("가락과 화음을 함께 살펴봐요");
    const hint = warning?.querySelector<HTMLButtonElement>("button");
    expect(hint).not.toBeNull();
    click(hint as HTMLButtonElement);
    expect(savedDraft().measures[0].notes).toEqual(before);
    expect(testButton("practice-melody-d-62").classList.contains("is-selected")).toBe(true);
  });
});

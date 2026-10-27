// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MeasureDraft } from "../music/composerDraft";
import ComposerMeasureNavigator from "./ComposerMeasureNavigator";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const blankMeasure: MeasureDraft = {
  story: "home",
  storyHint: "편안하게 시작",
  chords: ["C"],
  candidateId: null,
  candidateName: null,
  notes: null,
  effects: []
};

const measures: readonly MeasureDraft[] = [
  blankMeasure,
  { ...blankMeasure, notes: [] },
  { ...blankMeasure, notes: [{ id: "note-1", pitch: 60, duration: { numerator: 1, denominator: 1 } }] }
];

function mount(activeIndex = 0, playingIndex: number | null = null, onSelect = vi.fn()) {
  if (!container) {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  }
  act(() => root?.render(
    <ComposerMeasureNavigator measures={measures} activeIndex={activeIndex} playingIndex={playingIndex} onSelect={onSelect} />
  ));
  return onSelect;
}

function buttons() {
  return [...container!.querySelectorAll<HTMLButtonElement>(".composer-measure-nav-item")];
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("작곡 마디 탐색", () => {
  it("모든 마디를 선택할 수 있고 선택한 위치를 부모에게 전달한다", () => {
    const onSelect = mount();
    const items = buttons();
    expect(items).toHaveLength(3);
    expect(items[0].getAttribute("aria-pressed")).toBe("true");
    expect(items[2].dataset.testid).toBe("select-measure-3");
    act(() => items[2].click());
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(2);
    mount(2, null, onSelect);
    expect(buttons()[0].getAttribute("aria-pressed")).toBe("false");
    expect(buttons()[2].getAttribute("aria-pressed")).toBe("true");
  });

  it("기존 작곡 화면과 같은 기준으로 가락 선택 완료 여부와 개수를 표시한다", () => {
    mount();
    expect(container!.querySelector(".composer-measure-nav-header")!.textContent).toContain("2/3 완료");
    expect(buttons().map((button) => button.getAttribute("aria-label"))).toEqual([
      "1마디 선택, 가락 선택 전",
      "2마디 선택, 가락 선택 완료",
      "3마디 선택, 가락 선택 완료"
    ]);
    expect(buttons()[0].classList.contains("is-complete")).toBe(false);
    expect(buttons()[1].classList.contains("is-complete")).toBe(true);
  });

  it("재생 중인 마디와 편집 중인 마디를 구별하고 재생 종료를 반영한다", () => {
    mount(0, 2);
    expect(buttons().map((button) => button.dataset.playing)).toEqual(["false", "false", "true"]);
    expect(buttons()[0].getAttribute("aria-pressed")).toBe("true");
    expect(buttons()[2].getAttribute("aria-pressed")).toBe("false");
    expect(buttons().every((button) => !button.disabled)).toBe(true);
    mount(0, null);
    expect(buttons().every((button) => button.dataset.playing === "false")).toBe(true);
  });
});

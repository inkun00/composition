// @vitest-environment jsdom

import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getMusicVideoMeasures, type MusicVideoScene } from "../video/musicVideoModel";
import SceneStoryboard from "./SceneStoryboard";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const scenes: readonly MusicVideoScene[] = [1, 3].map((endMeasureIndex, index) => ({
  id: `scene-${index}`,
  background: "#ffffff",
  endLyric: null,
  endMeasureIndex,
  motion: "still",
  elements: []
}));
const measures = getMusicVideoMeasures(Array.from({ length: 4 }, (_, measureIndex) => ({
  measureIndex,
  notes: [{ id: `note-${measureIndex}`, pitch: 60, duration: { numerator: 4, denominator: 1 }, lyric: "노래" }]
})), 120);

let host: HTMLDivElement;
let root: Root;
let callbacks: {
  onSelect: ReturnType<typeof vi.fn>;
  onAdd: ReturnType<typeof vi.fn>;
  onInsertBefore: ReturnType<typeof vi.fn>;
  onInsertAfter: ReturnType<typeof vi.fn>;
  onDelete: ReturnType<typeof vi.fn>;
};

function render(props: Partial<ComponentProps<typeof SceneStoryboard>> = {}) {
  act(() => root.render(<SceneStoryboard scenes={scenes} measures={measures} selected={0}
    disabled={false} {...callbacks} {...props} />));
}

function button(testId: string) {
  return host.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`)!;
}

function click(element: HTMLElement) {
  act(() => element.click());
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  callbacks = { onSelect: vi.fn(), onAdd: vi.fn(), onInsertBefore: vi.fn(),
    onInsertAfter: vi.fn(), onDelete: vi.fn() };
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("선택한 타임라인 장면 편집", () => {
  it("앞 삽입, 뒤 삽입, 삭제를 각각 실행하며 장면 선택 버튼 안에 중첩하지 않는다", () => {
    render({ selected: 1 });
    const actions = host.querySelector('[role="group"]')!;
    expect(actions.getAttribute("aria-label")).toBe("선택한 장면 2 편집");
    expect(actions.textContent).toContain("장면 2 선택");
    click(button("insert-music-video-scene-before"));
    click(button("insert-music-video-scene-after"));
    click(button("delete-storyboard-scene"));
    expect(callbacks.onInsertBefore).toHaveBeenCalledTimes(1);
    expect(callbacks.onInsertAfter).toHaveBeenCalledTimes(1);
    expect(callbacks.onDelete).toHaveBeenCalledTimes(1);
    expect(callbacks.onSelect).not.toHaveBeenCalled();
    expect(host.querySelector("button button")).toBeNull();
    expect(host.querySelectorAll(".mv-scene-card")).toHaveLength(2);
  });

  it("마디가 부족하거나 마지막 본곡일 때 제한 이유를 표시하고 실행을 막는다", () => {
    render({ insertBeforeReason: "나눌 수 있는 마디가 없어요.",
      deleteReason: "본곡 장면은 하나 이상 남겨 주세요." });
    const before = button("insert-music-video-scene-before");
    const after = button("insert-music-video-scene-after");
    const remove = button("delete-storyboard-scene");
    expect(before.disabled).toBe(true);
    expect(before.title).toBe("나눌 수 있는 마디가 없어요.");
    expect(remove.disabled).toBe(true);
    expect(remove.title).toBe("본곡 장면은 하나 이상 남겨 주세요.");
    expect(after.disabled).toBe(false);
    click(before);
    click(remove);
    expect(callbacks.onInsertBefore).not.toHaveBeenCalled();
    expect(callbacks.onDelete).not.toHaveBeenCalled();
  });

  it("전체 편집 잠금이 삽입과 삭제에도 적용된다", () => {
    render({ disabled: true });
    for (const testId of ["insert-music-video-scene-before", "insert-music-video-scene-after", "delete-storyboard-scene"]) {
      const action = button(testId);
      expect(action.disabled).toBe(true);
      expect(action.title).toBe("현재 작업을 마친 후 사용할 수 있어요.");
      click(action);
    }
    expect(callbacks.onInsertBefore).not.toHaveBeenCalled();
    expect(callbacks.onInsertAfter).not.toHaveBeenCalled();
    expect(callbacks.onDelete).not.toHaveBeenCalled();
  });

  it("전주 선택과 제한 이유를 표시하고 본곡을 선택하면 새 선택 장면을 안내한다", () => {
    const intro: MusicVideoScene = { ...scenes[0], id: "intro", section: "intro", endMeasureIndex: undefined };
    render({ scenes: [intro, ...scenes], insertBeforeReason: "전주 앞에는 장면을 넣을 수 없어요." });
    expect(host.querySelector('[role="group"]')!.getAttribute("aria-label")).toBe("선택한 전주 편집");
    expect(button("insert-music-video-scene-before").title).toBe("전주 앞에는 장면을 넣을 수 없어요.");
    click(host.querySelector<HTMLButtonElement>('[aria-label="2번 장면 선택"]')!);
    expect(callbacks.onSelect).toHaveBeenCalledWith(1);
    render({ scenes: [intro, ...scenes], selected: 1 });
    expect(host.querySelector('[role="group"]')!.getAttribute("aria-label")).toBe("선택한 장면 2 편집");
    expect(button("insert-music-video-scene-before").disabled).toBe(false);
  });

  it("장면이 없으면 편집을 막고 기존 추가 버튼은 유지한다", () => {
    render({ scenes: [] });
    expect(host.querySelector(".mv-storyboard-selection")!.textContent).toBe("선택한 장면 없음");
    expect(button("insert-music-video-scene-before").disabled).toBe(true);
    expect(button("insert-music-video-scene-after").disabled).toBe(true);
    expect(button("delete-storyboard-scene").disabled).toBe(true);
    expect(button("insert-music-video-scene-before").title).toBe("장면을 먼저 선택해 주세요.");
    expect(button("add-music-video-scene").disabled).toBe(false);
  });

  it("편집 콜백이 없는 기존 사용처에는 추가 동작을 표시하지 않는다", () => {
    render({ onInsertBefore: undefined, onInsertAfter: undefined, onDelete: undefined });
    expect(host.querySelector('[role="group"]')).toBeNull();
    click(button("add-music-video-scene"));
    expect(callbacks.onAdd).toHaveBeenCalledTimes(1);
  });

  it("명시한 시작 마디를 표시하고 실제 겹친 장면을 선택 가능한 상태로 경고한다", () => {
    const overlap = [scenes[0], { ...scenes[1], startMeasureIndex: 1 }];
    render({ scenes: overlap, selected: 1 });
    const cards = host.querySelectorAll<HTMLButtonElement>(".mv-scene-card");
    expect(cards[1].textContent).toContain("2–4마디");
    for (const card of cards) {
      expect(card.dataset.rangeConflict).toBe("true");
      expect(card.getAttribute("aria-description")).toContain("마디 겹침");
      expect(card.querySelector(".mv-scene-conflict-badge")!.textContent).toBe("마디 겹침");
      expect(card.disabled).toBe(false);
    }
    click(cards[0]);
    expect(callbacks.onSelect).toHaveBeenCalledWith(0);
  });

  it("겹치지 않는 전주와 본곡에는 경고 배지를 표시하지 않는다", () => {
    const intro: MusicVideoScene = { ...scenes[0], id: "intro", section: "intro", endMeasureIndex: undefined };
    render({ scenes: [intro, ...scenes], introSeconds: 4 });
    expect(host.querySelectorAll(".mv-scene-conflict-badge")).toHaveLength(0);
    expect(host.querySelectorAll(".mv-scene-card")[2].textContent).toContain("3–4마디");
  });
});

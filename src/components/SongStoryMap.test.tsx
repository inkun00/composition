// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { songStructurePlan } from "../music/songStructure";
import SongStoryMap from "./SongStoryMap";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("선택한 노래 모양 지도", () => {
  it("선택한 템플릿의 실제 길이를 표시하고 누른 부분으로 이동한다", () => {
    const onSelect = vi.fn();
    const plan = songStructurePlan("return", 16)!;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root?.render(<SongStoryMap plan={plan} activeIndex={1}
      completed={Array(16).fill(false)} onSelect={onSelect} />));
    expect(container.querySelectorAll(".song-story-part")).toHaveLength(3);
    expect(container.textContent).toContain("5~12마디");
    act(() => (container?.querySelectorAll(".song-story-part")[2] as HTMLButtonElement).click());
    expect(onSelect).toHaveBeenCalledWith(12);
  });
});

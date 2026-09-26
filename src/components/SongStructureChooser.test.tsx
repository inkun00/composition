// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import SongStructureChooser from "./SongStructureChooser";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("선택형 노래 모양", () => {
  it("자유롭게 만들기가 기본이고 길이에 맞는 템플릿만 고른다", () => {
    const onSelect = vi.fn();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root?.render(<SongStructureChooser length={8} selectedId={null} onSelect={onSelect} />));
    expect(container.querySelector('[data-testid="structure-free"]')?.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector('[data-testid="structure-aaba"]')).toBeNull();
    act(() => container?.querySelector<HTMLButtonElement>('[data-testid="structure-varied_repeat"]')?.click());
    expect(onSelect).toHaveBeenCalledWith("varied_repeat");
  });

  it("모양이 많을 때는 쉬운 선택지만 먼저 보여 주고 더 볼 수 있다", () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root?.render(<SongStructureChooser length={16} selectedId={null} onSelect={() => undefined} />));
    expect(container.querySelector('[data-testid="structure-aaba"]')).toBeNull();
    act(() => container?.querySelector<HTMLButtonElement>(".song-structure-more")?.click());
    expect(container.querySelector('[data-testid="structure-aaba"]')).not.toBeNull();
  });
});

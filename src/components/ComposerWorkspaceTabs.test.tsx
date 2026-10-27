import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import ComposerWorkspaceTabs, { type ComposerWorkspaceView } from "./ComposerWorkspaceTabs";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

function mount(initial: ComposerWorkspaceView = "melody", arrangementAvailable = true) {
  const onChange = vi.fn();
  function Example() {
    const [value, setValue] = useState(initial);
    return <ComposerWorkspaceTabs value={value} arrangementAvailable={arrangementAvailable}
      onChange={(next) => { onChange(next); setValue(next); }} />;
  }
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(<Example />));
  return { onChange, tabs: [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')] };
}

function press(tab: HTMLButtonElement, key: string, options: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options });
  act(() => tab.dispatchEvent(event));
  return event;
}

function expectSelected(tabs: HTMLButtonElement[], index: number) {
  expect(tabs.map((tab) => tab.getAttribute("aria-selected")))
    .toEqual(tabs.map((_, item) => String(index === item)));
  expect(tabs.map((tab) => tab.tabIndex)).toEqual(tabs.map((_, item) => index === item ? 0 : -1));
}

describe("작곡 작업 보기 탭", () => {
  it("각 보기와 패널을 연결하고 현재 보기만 키보드 진입점으로 제공한다", () => {
    const { tabs } = mount("arrange");
    expect(container?.querySelector('[role="tablist"]')?.getAttribute("aria-label"))
      .toBe("노래 만들기 작업");
    expect(tabs.map((tab) => tab.getAttribute("aria-label")))
      .toEqual(["가락 만들기", "반주·가사", "저장·발표"]);
    expect(tabs.map((tab) => tab.id))
      .toEqual(["composer-tab-melody", "composer-tab-arrange", "composer-tab-publish"]);
    expect(tabs.map((tab) => tab.getAttribute("aria-controls")))
      .toEqual(["composer-panel-melody", "composer-panel-arrange", "composer-panel-publish"]);
    expectSelected(tabs, 1);
  });

  it("가락 완성 전에도 반주와 저장 보기를 클릭할 수 있다", () => {
    const { tabs, onChange } = mount("melody", false);
    expect(tabs.every((tab) => !tab.disabled)).toBe(true);
    expect(tabs[0].hasAttribute("aria-describedby")).toBe(false);
    for (const index of [1, 2]) {
      const description = tabs[index].getAttribute("aria-describedby");
      expect(description && document.getElementById(description)?.textContent).toBe("미리 살펴보기");
      act(() => tabs[index].click());
      expectSelected(tabs, index);
    }
    expect(onChange.mock.calls.map(([value]) => value)).toEqual(["arrange", "publish"]);
  });

  it("좌우 방향키는 순환하며 포커스와 선택을 함께 옮긴다", () => {
    const { tabs, onChange } = mount("melody", false);
    tabs[0].focus();
    expect(press(tabs[0], "ArrowLeft").defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(tabs[2]);
    expectSelected(tabs, 2);
    press(tabs[2], "ArrowRight");
    expect(document.activeElement).toBe(tabs[0]);
    expectSelected(tabs, 0);
    press(tabs[0], "ArrowRight");
    expect(document.activeElement).toBe(tabs[1]);
    expectSelected(tabs, 1);
    expect(onChange.mock.calls.map(([value]) => value)).toEqual(["publish", "melody", "arrange"]);
  });

  it("Home과 End는 처음과 끝으로 이동하고 다른 단축키는 가로채지 않는다", () => {
    const { tabs, onChange } = mount("arrange");
    tabs[1].focus();
    press(tabs[1], "End");
    expect(document.activeElement).toBe(tabs[2]);
    expectSelected(tabs, 2);
    press(tabs[2], "Home");
    expect(document.activeElement).toBe(tabs[0]);
    expectSelected(tabs, 0);
    expect(press(tabs[0], "Tab").defaultPrevented).toBe(false);
    expect(press(tabs[0], "ArrowDown").defaultPrevented).toBe(false);
    expect(press(tabs[0], "ArrowLeft", { altKey: true }).defaultPrevented).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});

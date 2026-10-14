import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PracticeModeChooser from "./PracticeModeChooser";
import { PRACTICE_CREATION_MODES, type PracticeCreationMode } from "./practiceCreationMode";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
let opener: HTMLButtonElement;
let originalOverflow: string;
const onClose = vi.fn();
const onSelect = vi.fn();

function mount(currentMode: PracticeCreationMode | null = null): void {
  act(() => root.render(<PracticeModeChooser currentMode={currentMode} onSelect={onSelect} onClose={onClose} />));
}

function dialog(): HTMLElement {
  const element = host.querySelector<HTMLElement>('[role="dialog"]');
  if (!element) throw new Error("모드 선택 팝업을 찾지 못했습니다.");
  return element;
}

function choice(label: string): HTMLButtonElement {
  const element = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!element) throw new Error(`${label} 선택을 찾지 못했습니다.`);
  return element;
}

function keydown(key: string, shiftKey = false): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true });
  act(() => document.activeElement?.dispatchEvent(event));
  return event;
}

beforeEach(() => {
  vi.clearAllMocks();
  originalOverflow = document.body.style.overflow;
  document.body.style.overflow = "clip";
  opener = document.createElement("button");
  opener.textContent = "모드 바꾸기";
  document.body.append(opener);
  opener.focus();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  opener.remove();
  document.body.style.overflow = originalOverflow;
});

describe("만들기 모드 선택 팝업", () => {
  it("이름과 모달 의미를 제공하고 세 활동 중 고른 모드만 전달한다", () => {
    mount("rhythm-melody");
    expect(dialog().getAttribute("aria-modal")).toBe("true");
    expect(dialog().getAttribute("aria-labelledby")).toBe("practice-mode-choice-title");
    expect(host.querySelector("#practice-mode-choice-title")?.textContent).toBe("어떻게 만들까요?");
    for (const mode of PRACTICE_CREATION_MODES) {
      const button = choice(mode.label);
      expect(button.getAttribute("aria-pressed")).toBe(String(mode.id === "rhythm-melody"));
      act(() => button.click());
      expect(onSelect).toHaveBeenLastCalledWith(mode.id);
    }
    expect(onClose).not.toHaveBeenCalled();
    expect(dialog().textContent).toContain("모드를 바꿔도 만든 음표와 가사는 그대로 남아요.");
  });

  it("첫 활동으로 초점을 옮기고 마지막과 처음에서 Tab 초점이 팝업 안을 순환한다", () => {
    mount();
    expect(document.activeElement).toBe(choice("리듬만들기"));
    const buttons = [...dialog().querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
    expect(buttons.length).toBe(4);
    const first = buttons[0];
    const last = buttons.at(-1)!;
    last.focus();
    expect(keydown("Tab").defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);
    first.focus();
    expect(keydown("Tab", true).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("닫기 버튼과 Escape로 취소할 수 있고 모드는 선택되지 않는다", () => {
    mount();
    act(() => choice("모드 선택 창 닫기").click());
    expect(onClose).toHaveBeenCalledTimes(1);
    keydown("Escape");
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("팝업 안 클릭은 취소하지 않고 바깥 배경 클릭만 취소한다", () => {
    mount();
    act(() => dialog().click());
    expect(onClose).not.toHaveBeenCalled();
    const backdrop = host.querySelector<HTMLElement>(".practice-mode-overlay");
    if (!backdrop) throw new Error("모드 팝업 배경을 찾지 못했습니다.");
    act(() => backdrop.click());
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("열린 동안 배경 스크롤을 잠그고 닫히면 이전 스크롤 스타일과 초점을 복구한다", () => {
    mount();
    expect(document.body.style.overflow).toBe("hidden");
    act(() => root.render(null));
    expect(document.body.style.overflow).toBe("clip");
    expect(document.activeElement).toBe(opener);
  });
});

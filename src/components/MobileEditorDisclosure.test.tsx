// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import MobileEditorDisclosure from "./MobileEditorDisclosure";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function renderDisclosure(mobile: boolean, enabled = true) {
  vi.stubGlobal("matchMedia", vi.fn(() => ({
    matches: mobile,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  })));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(
    <MobileEditorDisclosure enabled={enabled}><span>음표 편집 도구</span></MobileEditorDisclosure>
  ));
  return container.querySelector<HTMLButtonElement>(".mobile-editor-disclosure-button")!;
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.unstubAllGlobals();
});

describe("모바일 음표 편집 펼치기", () => {
  it("모바일에서는 고른 가락을 필요할 때 펼치고 닫는다", () => {
    const button = renderDisclosure(true);
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(container?.textContent).not.toContain("음표 편집 도구");

    act(() => button.click());
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(container?.textContent).toContain("음표 편집 도구");

    act(() => button.click());
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(container?.textContent).not.toContain("음표 편집 도구");
  });

  it("데스크톱에서는 기존처럼 열려 있고, 가락을 고르기 전 모바일 편집은 막는다", () => {
    const desktopButton = renderDisclosure(false);
    expect(desktopButton.getAttribute("aria-expanded")).toBe("true");
    expect(container?.textContent).toContain("음표 편집 도구");
  });

  it("모바일에서 아직 가락이 없으면 편집을 열 수 없다", () => {
    const button = renderDisclosure(true, false);
    expect(button.disabled).toBe(true);
    expect(container?.textContent).not.toContain("음표 편집 도구");
  });
});

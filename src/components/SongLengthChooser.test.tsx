// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import SongLengthChooser from "./SongLengthChooser";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function render(length: number, onSelect = vi.fn()) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(<SongLengthChooser length={length} onSelect={onSelect} />));
  return onSelect;
}

function setCustomValue(value: string) {
  const input = container!.querySelector<HTMLInputElement>('[data-testid="custom-song-length"]')!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("노래 길이 선택", () => {
  it("20·28마디를 빠른 선택에서 빼고 직접 설정을 마지막에 보여 준다", () => {
    render(8);
    const choices = [...container!.querySelectorAll<HTMLButtonElement>(".length-options button")];
    expect(choices.map((button) => button.textContent)).toEqual([
      "8마디", "12마디", "16마디", "24마디", "32마디", "직접 설정"
    ]);
    expect(container!.querySelector('[data-testid="length-20"]')).toBeNull();
    expect(container!.querySelector('[data-testid="length-28"]')).toBeNull();
  });

  it("직접 설정으로 8~32마디의 정수를 적용하고 잘못된 값은 거부한다", () => {
    const onSelect = render(8);
    act(() => container!.querySelector<HTMLButtonElement>('[data-testid="length-custom"]')!.click());
    setCustomValue("7");
    act(() => container!.querySelector<HTMLFormElement>(".length-custom-form")!.requestSubmit());
    expect(onSelect).not.toHaveBeenCalled();
    expect(container!.querySelector('[role="alert"]')?.textContent).toContain("8부터 32까지");
    setCustomValue("21");
    act(() => container!.querySelector<HTMLFormElement>(".length-custom-form")!.requestSubmit());
    expect(onSelect).toHaveBeenCalledWith(21);
    setCustomValue("48");
    act(() => container!.querySelector<HTMLFormElement>(".length-custom-form")!.requestSubmit());
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("가져온 48마디 악보는 현재 길이를 표시한다", () => {
    render(48);
    expect(container!.querySelector('[data-testid="length-custom"]')?.textContent).toContain("현재 48마디");
  });

  it("기존 20마디 악보는 직접 설정 선택으로 표시한다", () => {
    render(20);
    expect(container!.querySelector('[data-testid="length-custom"]')?.getAttribute("aria-pressed")).toBe("true");
    expect(container!.querySelector('[data-testid="length-custom"]')?.textContent).toContain("현재 20마디");
  });
});

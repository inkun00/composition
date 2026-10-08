// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useUnsavedWorkWarning } from "./useUnsavedWorkWarning";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let skipNextWarning: () => void;

function Harness({ enabled }: { enabled: boolean }) {
  skipNextWarning = useUnsavedWorkWarning(enabled);
  return null;
}

function leavePage(): Event {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("useUnsavedWorkWarning", () => {
  it("작업이 없거나 경고가 꺼지면 페이지 이탈을 막지 않는다", () => {
    act(() => root.render(<Harness enabled={false} />));
    expect(leavePage().defaultPrevented).toBe(false);
    act(() => root.render(<Harness enabled />));
    expect(leavePage().defaultPrevented).toBe(true);
    act(() => root.render(<Harness enabled={false} />));
    expect(leavePage().defaultPrevented).toBe(false);
  });

  it("앱에서 이미 확인한 이동은 한 번만 경고를 건너뛴다", () => {
    act(() => root.render(<Harness enabled />));
    skipNextWarning();
    expect(leavePage().defaultPrevented).toBe(false);
    expect(leavePage().defaultPrevented).toBe(true);
  });
});

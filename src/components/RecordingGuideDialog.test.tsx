// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import RecordingGuideDialog from "./RecordingGuideDialog";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("녹음 방법 선택 팝업", () => {
  it("개인 녹음은 가락 도움을 고른 뒤 시작한다", () => {
    const onChange = vi.fn();
    const onStart = vi.fn();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root?.render(
      <RecordingGuideDialog value="first-note" onChange={onChange}
        onCancel={vi.fn()} onStart={onStart} />
    ));

    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(onStart).not.toHaveBeenCalled();
    act(() => Array.from(container!.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("개인 녹음"))?.click());
    act(() => Array.from(container!.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("개인 녹음 시작"))?.click());
    expect(onStart).toHaveBeenCalledWith("personal", "first-note");
  });

  it("합창 녹음은 가락 도움을 끄고 시작한다", () => {
    const onStart = vi.fn();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root?.render(
      <RecordingGuideDialog value="soft" onChange={vi.fn()}
        onCancel={vi.fn()} onStart={onStart} />
    ));

    act(() => Array.from(container!.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("합창 녹음"))?.click());
    expect(container.textContent).toContain("가락 도움은 자동으로 꺼져요");
    act(() => Array.from(container!.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("합창 녹음 시작"))?.click());
    expect(onStart).toHaveBeenCalledWith("choir", "off");
  });

  it("Esc를 누르면 녹음을 시작하지 않고 닫는다", () => {
    const onCancel = vi.fn();
    const onStart = vi.fn();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root?.render(
      <RecordingGuideDialog value="off" onChange={vi.fn()}
        onCancel={onCancel} onStart={onStart} />
    ));

    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onStart).not.toHaveBeenCalled();
  });
});

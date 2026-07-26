// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import RecordingGuideSelector from "./RecordingGuideSelector";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("녹음 가락 도움 선택", () => {
  it("초등학생이 이해할 수 있는 세 가지 도움을 고른다", () => {
    const onChange = vi.fn();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root?.render(
      <RecordingGuideSelector value="first-note" onChange={onChange} />
    ));

    expect(container.textContent).toContain("완성된 녹음에는 들어가지 않아요");
    expect(container.querySelectorAll("button")).toHaveLength(3);
    act(() => Array.from(container!.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("가락 작게"))?.click());
    expect(onChange).toHaveBeenCalledWith("soft");
  });
});

// @vitest-environment jsdom

import { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import ComposerWorkspacePanel from "./ComposerWorkspacePanel";
import type { ComposerWorkspaceView } from "./ComposerWorkspaceTabs";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("작곡 작업 패널", () => {
  it("탭이 숨겨져도 입력 상태와 작업 소유자를 마운트한 채 유지한다", () => {
    const mounted = vi.fn();
    const disposed = vi.fn();
    function DraftInput() {
      const [value, setValue] = useState("");
      useEffect(() => { mounted(); return disposed; }, []);
      return <input aria-label="작업 중인 가사" value={value} onInput={(event) => setValue(event.currentTarget.value)} />;
    }
    function Example({ active }: { active: ComposerWorkspaceView }) {
      return <>
        <ComposerWorkspacePanel view="melody" active={active}><DraftInput /></ComposerWorkspacePanel>
        <ComposerWorkspacePanel view="publish" active={active}><p>저장 도구</p></ComposerWorkspacePanel>
      </>;
    }

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root?.render(<Example active="melody" />));
    const input = container.querySelector("input")!;
    act(() => {
      input.value = "아직 저장 중인 노래";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => root?.render(<Example active="publish" />));
    expect(container.querySelector("input")).toBe(input);
    expect(input.value).toBe("아직 저장 중인 노래");
    expect(input.closest<HTMLElement>('[role="tabpanel"]')!.hidden).toBe(true);
    expect(container.querySelector<HTMLElement>("#composer-panel-publish")!.hidden).toBe(false);
    expect(container.querySelector("#composer-panel-melody")!.getAttribute("aria-labelledby")).toBe("composer-tab-melody");
    expect(mounted).toHaveBeenCalledOnce();
    expect(disposed).not.toHaveBeenCalled();
    act(() => root?.render(<Example active="melody" />));
    expect(input.closest<HTMLElement>('[role="tabpanel"]')!.hidden).toBe(false);
    expect(input.value).toBe("아직 저장 중인 노래");
    expect(mounted).toHaveBeenCalledOnce();
    expect(disposed).not.toHaveBeenCalled();
  });
});

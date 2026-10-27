// @vitest-environment jsdom

import { act, useEffect, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SaveIssue } from "../music/draftValidation";
import { useComposerWorkspace } from "./useComposerWorkspace";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const visibilityDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, "checkVisibility");
const scrollDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
let root: Root | null = null;
let container: HTMLDivElement | null = null;
let controller: ReturnType<typeof useComposerWorkspace>;
let frames: FrameRequestCallback[] = [];
const scrollIntoView = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  frames = [];
  scrollIntoView.mockClear();
  Object.defineProperty(Element.prototype, "checkVisibility", {
    configurable: true,
    value: vi.fn(function (this: Element) {
      return this.isConnected && !this.closest("[hidden]") && getComputedStyle(this).display !== "none";
    })
  });
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scrollIntoView });
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  if (visibilityDescriptor) Object.defineProperty(Element.prototype, "checkVisibility", visibilityDescriptor);
  else Reflect.deleteProperty(Element.prototype, "checkVisibility");
  if (scrollDescriptor) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", scrollDescriptor);
  else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function mount(mode: "removed" | "hidden" | "modal" = "removed") {
  function Example() {
    const workspace = useComposerWorkspace();
    controller = workspace;
    const [modal, setModal] = useState(false);
    const modalButton = useRef<HTMLButtonElement>(null);
    useEffect(() => { if (modal) modalButton.current?.focus(); }, [modal]);
    const complete = <button data-testid="complete" onClick={() => {
      workspace.changeView("arrange");
      if (mode === "modal") setModal(true);
    }}>가락 완성하기</button>;

    return <>
      <nav>
        {(["melody", "arrange", "publish"] as const).map((view) => (
          <button key={view} id={`composer-tab-${view}`} onClick={() => workspace.changeView(view)}>{view}</button>
        ))}
      </nav>
      <div hidden={workspace.view !== "melody"}>
        {(mode === "hidden" || workspace.view === "melody") && complete}
        <details data-save-target="settings">
          <summary data-testid="settings-control">곡 설정</summary>
          <input aria-label="빠르기" />
        </details>
        <details data-testid="score-details">
          <summary>전체 악보</summary>
          <details data-testid="measure-details">
            <summary>마디</summary>
            <button data-save-target="measure-2" data-testid="measure-control">3마디</button>
          </details>
        </details>
      </div>
      <div hidden={workspace.view !== "publish"}>
        <label data-save-target="title">제목<input data-testid="title-control" /></label>
        <details data-testid="story-details">
          <summary>노래 이야기</summary>
          <label data-save-target="description">이야기<textarea data-testid="description-control" /></label>
        </details>
      </div>
      {modal && <div role="dialog" aria-modal="true"><button ref={modalButton}>그림 복구 창</button></div>}
    </>;
  }
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(<Example />));
}

function flushFrames() {
  const pending = frames.splice(0);
  act(() => pending.forEach((frame) => frame(0)));
}

function getControl(testId: string) {
  return container!.querySelector<HTMLElement>(`[data-testid="${testId}"]`)!;
}

describe("작곡 보기 이동 후 포커스", () => {
  it.each(["removed", "hidden"] as const)("완료 버튼이 %s 상태가 되면 이동한 탭에 포커스를 복구한다", (mode) => {
    mount(mode);
    const complete = getControl("complete");
    complete.focus();
    act(() => complete.click());
    expect(controller.view).toBe("arrange");
    expect(complete.isConnected).toBe(mode === "hidden");
    const tab = document.getElementById("composer-tab-arrange")!;
    const focus = vi.spyOn(tab, "focus");
    flushFrames();
    expect(document.activeElement).toBe(tab);
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
  });

  it("탭을 직접 누르면 기존 버튼 포커스를 그대로 유지한다", () => {
    mount();
    const tab = document.getElementById("composer-tab-publish")!;
    tab.focus();
    const focus = vi.spyOn(tab, "focus");
    act(() => tab.click());
    flushFrames();
    expect(document.activeElement).toBe(tab);
    expect(focus).not.toHaveBeenCalled();
    expect(controller.view).toBe("publish");
  });

  it("복구 과정에서 새 대화상자가 열리면 대화상자 포커스를 빼앗지 않는다", () => {
    mount("modal");
    const complete = getControl("complete");
    complete.focus();
    act(() => complete.click());
    const modalButton = container!.querySelector('[aria-modal="true"] button');
    expect(document.activeElement).toBe(modalButton);
    flushFrames();
    expect(document.activeElement).toBe(modalButton);
  });
});

describe("저장 오류 위치 안내", () => {
  it.each<{
    issue: SaveIssue;
    view: "melody" | "publish";
    control: string;
    details: string[];
  }>([
    { issue: { target: "settings", message: "설정 확인" }, view: "melody", control: "settings-control", details: [] },
    { issue: { target: "measure", measureIndex: 2, message: "마디 확인" }, view: "melody", control: "measure-control", details: ["score-details", "measure-details"] },
    { issue: { target: "title", message: "제목 확인" }, view: "publish", control: "title-control", details: [] },
    { issue: { target: "description", message: "이야기 확인" }, view: "publish", control: "description-control", details: ["story-details"] }
  ])("$issue.target 오류의 탭과 접힌 영역을 열고 해당 입력에 포커스를 보낸다", ({ issue, view, control, details }) => {
    mount();
    act(() => controller.changeView(view === "melody" ? "publish" : "arrange"));
    flushFrames();
    act(() => controller.revealSaveIssue(issue));
    expect(controller.view).toBe(view);
    act(() => vi.advanceTimersByTime(50));
    expect(document.activeElement).toBe(getControl(control));
    expect(getControl(control).closest("[hidden]")).toBeNull();
    for (const testId of details) expect((getControl(testId) as HTMLDetailsElement).open).toBe(true);
    if (issue.target === "settings") {
      expect(container!.querySelector<HTMLDetailsElement>('[data-save-target="settings"]')!.open).toBe(true);
    }
    expect(scrollIntoView).toHaveBeenLastCalledWith({ behavior: "smooth", block: "center" });
  });
});

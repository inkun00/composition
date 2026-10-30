// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RecordingSaveDialog, { type RecordingSaveDialogProps } from "./RecordingSaveDialog";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let callbacks: Pick<RecordingSaveDialogProps, "onSaveMp3" | "onSaveMp4" | "onClose" | "onCancel">;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  callbacks = { onSaveMp3: vi.fn(), onSaveMp4: vi.fn(), onClose: vi.fn(), onCancel: vi.fn() };
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

function render(overrides: Partial<RecordingSaveDialogProps> = {}) {
  act(() => root.render(<RecordingSaveDialog videoUnavailableReason={null} busy={false} progress={0} status=""
    {...callbacks} {...overrides} />));
}

function button(label: string) {
  const found = [...document.querySelectorAll<HTMLButtonElement>(".recording-save-dialog button")]
    .find((item) => (item.getAttribute("aria-label") ?? item.textContent) === label);
  if (!found) throw new Error(`${label} 버튼을 찾지 못했습니다.`);
  return found;
}

describe("녹음 저장 파일 선택", () => {
  it("열기만 해서는 저장하지 않고 선택한 형식만 실행한다", () => {
    render();
    expect(container.childElementCount).toBe(0);
    expect(document.querySelector('[role="dialog"]')?.getAttribute("aria-modal")).toBe("true");
    expect(document.querySelector("h2")?.textContent).toBe("녹음 파일로 저장");
    expect(callbacks.onSaveMp3).not.toHaveBeenCalled();
    expect(callbacks.onSaveMp4).not.toHaveBeenCalled();
    act(() => button("MP3로 저장").click());
    expect(callbacks.onSaveMp3).toHaveBeenCalledOnce();
    expect(callbacks.onSaveMp4).not.toHaveBeenCalled();
    act(() => button("뮤직비디오와 MP4로 저장").click());
    expect(callbacks.onSaveMp4).toHaveBeenCalledOnce();
  });

  it("뮤직비디오가 없으면 MP3는 허용하고 MP4 제한 이유를 연결한다", () => {
    const reason = "장면 그리기에서 뮤직비디오를 먼저 만들어 주세요.";
    render({ videoUnavailableReason: reason });
    const video = button("뮤직비디오와 MP4로 저장");
    expect(video.disabled).toBe(true);
    expect(button("MP3로 저장").disabled).toBe(false);
    const description = document.getElementById(video.getAttribute("aria-describedby")!);
    expect(description?.textContent).toContain(reason);
    act(() => video.click());
    expect(callbacks.onSaveMp4).not.toHaveBeenCalled();
  });

  it("제작 중에는 선택과 닫기를 막고 진행률과 취소를 제공한다", () => {
    render({ busy: true, progress: 42, status: "녹음과 장면을 합치고 있어요." });
    for (const label of ["MP3로 저장", "뮤직비디오와 MP4로 저장", "녹음 파일 저장 닫기"]) {
      expect(button(label).disabled).toBe(true);
      act(() => button(label).click());
    }
    const progress = document.querySelector<HTMLProgressElement>("progress")!;
    expect(progress.value).toBe(42);
    expect(document.querySelector('[role="status"]')?.textContent).toContain("녹음과 장면");
    act(() => button("만들기 취소").click());
    expect(callbacks.onCancel).toHaveBeenCalledOnce();
    act(() => progress.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    act(() => document.querySelector(".recording-save-overlay")?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
    expect(callbacks.onClose).not.toHaveBeenCalled();
    expect(callbacks.onSaveMp3).not.toHaveBeenCalled();
    expect(callbacks.onSaveMp4).not.toHaveBeenCalled();
  });

  it("초점을 안에 유지하고 Escape와 배경 클릭은 취소로 닫는다", () => {
    render();
    const close = button("녹음 파일 저장 닫기");
    const cancel = button("취소");
    expect(document.activeElement).toBe(close);
    cancel.focus();
    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    act(() => cancel.dispatchEvent(tab));
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(close);
    const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    act(() => close.dispatchEvent(escape));
    expect(escape.defaultPrevented).toBe(true);
    expect(callbacks.onClose).toHaveBeenCalledOnce();
    act(() => document.querySelector(".recording-save-options")?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
    expect(callbacks.onClose).toHaveBeenCalledOnce();
    act(() => document.querySelector(".recording-save-overlay")?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
    expect(callbacks.onClose).toHaveBeenCalledTimes(2);
  });

  it("실패 안내를 남기고 저장 형식을 다시 고를 수 있다", () => {
    render({ status: "영상을 만들지 못했어요. 다시 시도해 주세요." });
    expect(document.querySelector('[role="status"]')?.textContent).toContain("영상을 만들지 못했어요");
    expect(button("MP3로 저장").disabled).toBe(false);
    expect(button("뮤직비디오와 MP4로 저장").disabled).toBe(false);
  });
});

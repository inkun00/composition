// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PracticeVideoChoiceDialog from "./PracticeVideoChoiceDialog";
import { emptyPracticeDraft } from "./practiceStorage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

function option(label: string) {
  const found = document.querySelector<HTMLButtonElement>(`.practice-video-choice-dialog button[aria-label="${label}"]`);
  if (!found) throw new Error(`${label} 영상 선택을 찾지 못했습니다.`);
  return found;
}

describe("음악 영상 선택 팝업", () => {
  it("검은 화면 흰 가사와 선택한 악보 화면을 안내하고 가락 선택을 전달한다", () => {
    const draft = emptyPracticeDraft();
    draft.measures[0].lyric = "우리 노래";
    const onConfirm = vi.fn();
    act(() => root.render(<PracticeVideoChoiceDialog draft={draft} step="melody" mode="score"
      onConfirm={onConfirm} onClose={vi.fn()} />));
    const dialog = document.querySelector('[role="dialog"]');
    expect(container.childElementCount).toBe(0);
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(dialog?.textContent).toContain("두 영상 모두 만든 가락 소리와 가사를 재생해요.");
    expect(option("가사만 재생").textContent).toContain("검은 화면에 흰색 가사");
    expect(option("가락과 함께 재생").textContent).toContain("선택한 악보 화면");
    expect(document.querySelector(".practice-video-choice-lyrics-sample")?.textContent).toBe("우리 노래");
    act(() => option("가사만 재생").click());
    expect(onConfirm).toHaveBeenLastCalledWith("lyrics");
    act(() => option("가락과 함께 재생").click());
    expect(onConfirm).toHaveBeenLastCalledWith("score");
  });

  it("가사가 없어도 리듬 영상은 저장할 수 있고 숨긴 리듬 가사를 가락에 사용하지 않는다", () => {
    const draft = emptyPracticeDraft();
    draft.rhythmLayers = [{ id: "extra", instrumentId: "beat:shaker", measures: [{ ...draft.measures[0], lyric: "합주" }] }];
    act(() => root.render(<PracticeVideoChoiceDialog draft={draft} step="melody" mode="bars"
      onConfirm={vi.fn()} onClose={vi.fn()} />));
    expect(option("가사만 재생").disabled).toBe(true);
    expect(option("가락과 함께 재생").disabled).toBe(false);
    expect(document.querySelector(".practice-video-choice-help")?.textContent).toContain("먼저 가사를 입력해 주세요");
    act(() => root.render(<PracticeVideoChoiceDialog draft={draft} step="rhythm" mode="bars"
      onConfirm={vi.fn()} onClose={vi.fn()} />));
    expect(option("가사만 재생").disabled).toBe(false);
    expect(option("리듬과 함께 재생").textContent).toContain("선택한 막대 화면");
  });

  it("키보드 초점을 팝업 안에 유지하고 Escape와 배경 클릭으로 닫는다", () => {
    const draft = emptyPracticeDraft();
    draft.measures[0].lyric = "노래";
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    act(() => root.render(<PracticeVideoChoiceDialog draft={draft} step="rhythm" mode="bars"
      onConfirm={onConfirm} onClose={onClose} />));
    const close = option("음악 영상 선택 닫기");
    const cancel = document.querySelector<HTMLButtonElement>(".practice-video-choice-cancel")!;
    expect(document.activeElement).toBe(close);
    cancel.focus();
    const forward = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    act(() => cancel.dispatchEvent(forward));
    expect(forward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(close);
    act(() => close.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true })));
    expect(document.activeElement).toBe(cancel);
    act(() => cancel.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(onClose).toHaveBeenCalledOnce();
    act(() => document.querySelector<HTMLElement>(".practice-video-choice-overlay")?.click());
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("파일 준비 중에는 두 저장 선택을 잠근다", () => {
    const draft = emptyPracticeDraft();
    draft.measures[0].lyric = "노래";
    const onConfirm = vi.fn();
    act(() => root.render(<PracticeVideoChoiceDialog draft={draft} step="rhythm" mode="bars" disabled
      onConfirm={onConfirm} onClose={vi.fn()} />));
    expect(option("가사만 재생").disabled).toBe(true);
    expect(option("리듬과 함께 재생").disabled).toBe(true);
    act(() => option("가사만 재생").click());
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

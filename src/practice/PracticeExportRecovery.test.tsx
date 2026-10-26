// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PracticeExportRecovery from "./PracticeExportRecovery";
import * as recovery from "./practiceExportRefresh";
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

describe("MP4 파일 기능 복구 버튼", () => {
  it("버튼을 누르기 전에는 새로고침하지 않고 현재 곡과 경고 해제 콜백을 전달한다", () => {
    const saveAndRefresh = vi.spyOn(recovery, "savePracticeAndRefresh").mockReturnValue(true);
    const onBeforeRefresh = vi.fn();
    const draft = { ...emptyPracticeDraft(), title: "현재 편집한 곡" };
    act(() => root.render(<PracticeExportRecovery draft={draft} onBeforeRefresh={onBeforeRefresh} />));
    const button = container.querySelector<HTMLButtonElement>("button");
    expect(button?.textContent).toContain("작업 저장하고 새로고침");
    expect(saveAndRefresh).not.toHaveBeenCalled();
    act(() => button?.click());
    expect(saveAndRefresh).toHaveBeenCalledWith(draft, onBeforeRefresh);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("저장이 실패하면 화면을 유지하는 안내를 표시하고 최신 작업으로 다시 시도한다", () => {
    const saveAndRefresh = vi.spyOn(recovery, "savePracticeAndRefresh")
      .mockReturnValueOnce(false).mockReturnValue(true);
    const draft = emptyPracticeDraft();
    act(() => root.render(<PracticeExportRecovery draft={draft} />));
    act(() => container.querySelector<HTMLButtonElement>("button")?.click());
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("작업을 저장하지 못해 새로고침하지 않았어요");
    const latest = { ...draft, title: "공간 확인 후 편집한 곡" };
    act(() => root.render(<PracticeExportRecovery draft={latest} />));
    act(() => container.querySelector<HTMLButtonElement>("button")?.click());
    expect(saveAndRefresh).toHaveBeenLastCalledWith(latest, undefined);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
});

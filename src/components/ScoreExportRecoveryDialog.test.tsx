// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ScoreExportRecoveryDialog from "./ScoreExportRecoveryDialog";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

function refreshButton() {
  return document.querySelector<HTMLButtonElement>('[data-testid="score-export-refresh"]')!;
}

function dialog() {
  return document.querySelector<HTMLElement>('[data-testid="score-export-recovery"]')!;
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("score export recovery", () => {
  it("waits for an explicit click, then preserves the project before navigation", async () => {
    const order: string[] = [];
    const onSave = vi.fn(async () => { order.push("save"); return true; });
    const onBeforeRefresh = vi.fn(() => { order.push("before"); });
    const reload = vi.fn(() => { order.push("reload"); });
    act(() => root.render(<ScoreExportRecoveryDialog onSave={onSave}
      onBeforeRefresh={onBeforeRefresh} onClose={vi.fn()} reload={reload} />));

    expect(dialog().getAttribute("role")).toBe("dialog");
    expect(dialog().textContent).toContain("악보 만들기 기능을 다시 불러와 주세요");
    expect(dialog().textContent).toContain("현재 노래와 그린 장면을 이 브라우저에 먼저 저장");
    expect(refreshButton().textContent).toContain("작업 저장하고 최신 화면 열기");
    expect(document.querySelector('[data-testid="score-export-recording-save"]')).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    await act(async () => refreshButton().click());
    expect(order).toEqual(["save", "before", "reload"]);
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });

  it("holds navigation until durable saving completes and rejects duplicate clicks", async () => {
    const save = deferred<boolean>();
    const onSave = vi.fn(() => save.promise);
    const onBeforeRefresh = vi.fn();
    const reload = vi.fn();
    const onClose = vi.fn();
    act(() => root.render(<ScoreExportRecoveryDialog onSave={onSave}
      onBeforeRefresh={onBeforeRefresh} onClose={onClose} reload={reload} />));
    const refresh = refreshButton();
    act(() => {
      refresh.click();
      refresh.click();
    });
    expect(onSave).toHaveBeenCalledOnce();
    expect(refresh.disabled).toBe(true);
    expect(refresh.textContent).toContain("노래와 그림 저장 중");
    expect(dialog().getAttribute("aria-busy")).toBe("true");
    expect(onBeforeRefresh).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    act(() => {
      document.querySelector<HTMLButtonElement>('[aria-label="악보 오류 안내 닫기"]')!.click();
      dialog().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => save.resolve(true));
    expect(onBeforeRefresh).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
  });

  it.each(["false", "rejected"])("keeps the page and reports a %s save failure", async (result) => {
    const onSave = result === "false" ? vi.fn(async () => false) : vi.fn(async () => {
      throw new DOMException("Storage is unavailable", "QuotaExceededError");
    });
    const onBeforeRefresh = vi.fn();
    const reload = vi.fn();
    act(() => root.render(<ScoreExportRecoveryDialog onSave={onSave}
      onBeforeRefresh={onBeforeRefresh} onClose={vi.fn()} reload={reload} />));
    await act(async () => refreshButton().click());
    expect(document.querySelector('[role="alert"]')?.textContent)
      .toContain("노래와 그림을 저장하지 못해 화면을 새로고침하지 않았어요");
    expect(dialog().getAttribute("aria-busy")).toBe("false");
    expect(refreshButton().disabled).toBe(false);
    expect(onBeforeRefresh).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it("retries with the latest save callback after a storage failure", async () => {
    const reload = vi.fn();
    const onBeforeRefresh = vi.fn();
    const failedSave = vi.fn(async () => false);
    act(() => root.render(<ScoreExportRecoveryDialog onSave={failedSave}
      onBeforeRefresh={onBeforeRefresh} onClose={vi.fn()} reload={reload} />));
    await act(async () => refreshButton().click());
    const latestSave = vi.fn(async () => true);
    act(() => root.render(<ScoreExportRecoveryDialog onSave={latestSave}
      onBeforeRefresh={onBeforeRefresh} onClose={vi.fn()} reload={reload} />));
    await act(async () => refreshButton().click());
    expect(failedSave).toHaveBeenCalledOnce();
    expect(latestSave).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });

  it("allows closing with Escape or the close controls while idle", () => {
    const onClose = vi.fn();
    const onSave = vi.fn(async () => true);
    const reload = vi.fn();
    act(() => root.render(<ScoreExportRecoveryDialog onSave={onSave}
      onBeforeRefresh={vi.fn()} onClose={onClose} reload={reload} />));
    act(() => dialog().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(onClose).toHaveBeenCalledOnce();
    act(() => document.querySelector<HTMLButtonElement>('[aria-label="악보 오류 안내 닫기"]')!.click());
    expect(onClose).toHaveBeenCalledTimes(2);
    act(() => Array.from(dialog().querySelectorAll("button")).find((button) => button.textContent === "나중에")!.click());
    expect(onClose).toHaveBeenCalledTimes(3);
    expect(onSave).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it("traps keyboard focus and restores the opener and body scrolling after closing", () => {
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    document.body.style.overflow = "scroll";
    act(() => root.render(<ScoreExportRecoveryDialog onSave={vi.fn(async () => true)}
      onBeforeRefresh={vi.fn()} onClose={vi.fn()} reload={vi.fn()} />));
    const first = dialog().querySelector("button");
    expect(document.activeElement).toBe(first);
    expect(document.body.style.overflow).toBe("hidden");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, cancelable: true }));
    expect(document.activeElement).toBe(refreshButton());
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", cancelable: true }));
    expect(document.activeElement).toBe(first);
    act(() => root.render(null));
    frames.forEach((callback) => callback(0));
    expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).toBe("scroll");
    document.body.style.overflow = "";
  });

  it("distinguishes navigation failure after a successful save", async () => {
    const onSave = vi.fn(async () => true);
    const onBeforeRefresh = vi.fn();
    const reload = vi.fn(() => { throw new Error("Navigation unavailable"); });
    act(() => root.render(<ScoreExportRecoveryDialog onSave={onSave}
      onBeforeRefresh={onBeforeRefresh} onClose={vi.fn()} reload={reload} />));
    await act(async () => refreshButton().click());
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("작업은 저장했지만 최신 화면을 열지 못했어요");
    expect(refreshButton().disabled).toBe(false);
  });

  it("requires the current recording to be saved and confirmed before refreshing", async () => {
    const onSave = vi.fn(async () => true);
    const reload = vi.fn();
    act(() => root.render(<ScoreExportRecoveryDialog onSave={onSave}
      onBeforeRefresh={vi.fn()} onClose={vi.fn()} reload={reload}
      recording={{ url: "blob:current-recording", fileName: "별빛 노래.mp3" }} />));
    const download = document.querySelector<HTMLAnchorElement>('[data-testid="score-export-recording-save"]')!;
    const confirm = document.querySelector<HTMLInputElement>('[data-testid="score-export-recording-confirm"]')!;
    expect(download.getAttribute("href")).toBe("blob:current-recording");
    expect(download.download).toBe("별빛 노래.mp3");
    expect(dialog().textContent).toContain("프로젝트에는 녹음 파일이 포함되지 않아요");
    expect(dialog().textContent).toContain("미리듣기와 보정 정보가 사라져요");
    expect(confirm.checked).toBe(false);
    expect(refreshButton().disabled).toBe(true);
    act(() => {
      // Also defend the handler if a caller removes the disabled attribute.
      refreshButton().disabled = false;
      refreshButton().click();
    });
    expect(onSave).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    act(() => confirm.click());
    expect(confirm.checked).toBe(true);
    expect(refreshButton().disabled).toBe(false);
    await act(async () => refreshButton().click());
    expect(onSave).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
  });

  it("resets recording confirmation when a different recording becomes current", () => {
    const onSave = vi.fn(async () => true);
    const props = { onSave, onBeforeRefresh: vi.fn(), onClose: vi.fn(), reload: vi.fn() };
    act(() => root.render(<ScoreExportRecoveryDialog {...props}
      recording={{ url: "blob:first", fileName: "첫 녹음.mp3" }} />));
    act(() => document.querySelector<HTMLInputElement>('[data-testid="score-export-recording-confirm"]')!.click());
    expect(refreshButton().disabled).toBe(false);
    act(() => root.render(<ScoreExportRecoveryDialog {...props}
      recording={{ url: "blob:second", fileName: "새 녹음.mp3" }} />));
    expect(document.querySelector<HTMLInputElement>('[data-testid="score-export-recording-confirm"]')!.checked).toBe(false);
    expect(refreshButton().disabled).toBe(true);
    act(() => root.render(<ScoreExportRecoveryDialog {...props}
      recording={{ url: "blob:first", fileName: "첫 녹음.mp3" }} />));
    expect(document.querySelector<HTMLInputElement>('[data-testid="score-export-recording-confirm"]')!.checked).toBe(false);
    expect(refreshButton().disabled).toBe(true);
  });
});

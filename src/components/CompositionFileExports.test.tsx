// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CompositionMediaExportController } from "../hooks/useCompositionMediaExport";
import CompositionFileExports from "./CompositionFileExports";
import CompositionMediaExportDialog from "./CompositionMediaExportDialog";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;
let media: CompositionMediaExportController;
let onPdf: ReturnType<typeof vi.fn>;

function render(element: ReactNode) {
  act(() => root.render(element));
}

function files(overrides: Partial<Parameters<typeof CompositionFileExports>[0]> = {}) {
  render(<CompositionFileExports media={media} complete busy={false} exportingPdf={false} onPdf={onPdf} {...overrides} />);
}

function button(testId: string, within: ParentNode = host) {
  const result = within.querySelector<HTMLButtonElement>(`button[data-testid="${testId}"]`);
  if (!result) throw new Error(`${testId} 버튼을 찾지 못했습니다.`);
  return result;
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  onPdf = vi.fn();
  media = {
    exporting: false, format: null, mix: null, phase: "idle", progress: 0, status: "", hasLyrics: true,
    saveMp3: vi.fn(async () => undefined), saveMp4: vi.fn(async () => undefined), cancel: vi.fn()
  };
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe("악보·음악 파일 저장 버튼", () => {
  it("각 버튼은 음악을 고르는 창을 열고 고른 파일 형식과 음악만 저장한다", () => {
    files();
    const mp3 = button("export-backing-mp3");
    const mp4 = button("export-lyrics-mp4");
    expect(mp3.textContent?.trim()).toBe("음악 저장");
    expect(mp4.textContent?.trim()).toBe("가사 포함 영상");
    expect(mp3.nextElementSibling).toBe(mp4);
    for (const [trigger, save] of [[mp3, media.saveMp3], [mp4, media.saveMp4]] as const) {
      for (const mix of ["backing", "performance"] as const) {
        const count = vi.mocked(save).mock.calls.length;
        act(() => trigger.click());
        expect(save).toHaveBeenCalledTimes(count);
        const dialog = document.querySelector('[role="dialog"][aria-modal="true"]')!;
        expect(document.getElementById(dialog.getAttribute("aria-labelledby")!)?.textContent).toBe(trigger.textContent?.trim());
        expect(dialog.querySelectorAll(".composition-export-choice-option")).toHaveLength(2);
        act(() => button(`composition-source-${mix}`, dialog).click());
        expect(save).toHaveBeenCalledTimes(count + 1);
        expect(save).toHaveBeenLastCalledWith(mix);
        expect(document.querySelector(".composition-export-choice-dialog")).toBeNull();
      }
    }
    act(() => {
      button("export-pdf").click();
      button("export-pdf-with-accompaniment").click();
    });
    expect(onPdf.mock.calls).toEqual([[false], [true]]);
    expect(host.textContent).toContain("검은 배경에 가사");
  });

  it("Escape로 선택을 닫으면 저장하지 않고 연 버튼으로 초점이 돌아간다", async () => {
    files();
    const mp3 = button("export-backing-mp3");
    mp3.focus();
    act(() => mp3.click());
    const dialog = document.querySelector(".composition-export-choice-dialog")!;
    expect(dialog.contains(document.activeElement)).toBe(true);
    act(() => document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(document.querySelector(".composition-export-choice-dialog")).toBeNull();
    expect(document.activeElement).toBe(mp3);
    expect(media.saveMp3).not.toHaveBeenCalled();
  });

  it("가사가 없을 때 MP4만 잠그고 버튼에 연결된 가사 입력 안내를 보여 준다", () => {
    media.hasLyrics = false;
    files();
    const mp4 = button("export-lyrics-mp4");
    expect(mp4.disabled).toBe(true);
    expect(button("export-backing-mp3").disabled).toBe(false);
    const help = document.getElementById(mp4.getAttribute("aria-describedby")!);
    expect(help?.textContent).toContain("가사를 한 글자 이상 입력");
    act(() => mp4.click());
    expect(media.saveMp4).not.toHaveBeenCalled();
  });

  it("마디가 미완성인 곡에서는 음악 파일 두 형식을 모두 잠근다", () => {
    files({ complete: false });
    expect(button("export-backing-mp3").disabled).toBe(true);
    expect(button("export-lyrics-mp4").disabled).toBe(true);
    act(() => { button("export-backing-mp3").click(); button("export-lyrics-mp4").click(); });
    expect(media.saveMp3).not.toHaveBeenCalled();
    expect(media.saveMp4).not.toHaveBeenCalled();
  });

  it.each(["playback", "pdf", "video"] as const)("다른 연주나 파일을 만드는 동안 중복 저장을 잠근다: %s", (operation) => {
    if (operation === "video") media = { ...media, exporting: true, format: "mp4", progress: 42 };
    files({ busy: operation === "playback", exportingPdf: operation === "pdf" });
    expect([...host.querySelectorAll<HTMLButtonElement>("button")].every((item) => item.disabled)).toBe(true);
    if (operation === "video") expect(button("export-lyrics-mp4").textContent).toContain("42%");
  });
});

describe("가사 영상 내보내기 진행 창", () => {
  it("접근 가능한 진행률과 취소 버튼을 표시하고 완료되면 취소를 숨긴다", () => {
    media = { ...media, exporting: true, format: "mp4", phase: "working", progress: 63,
      status: "가사와 반주를 영상에 담고 있어요." };
    render(<CompositionMediaExportDialog media={media} />);
    const dialog = host.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(document.getElementById(dialog!.getAttribute("aria-labelledby")!)?.textContent).toContain("가사 영상");
    expect(host.querySelector<HTMLProgressElement>("progress")?.value).toBe(63);
    expect(host.querySelector("progress")?.getAttribute("aria-label")).toContain("가사 영상");
    expect(host.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(host.textContent).toContain(media.status);
    act(() => button("cancel-composition-video").click());
    expect(media.cancel).toHaveBeenCalledOnce();
    render(<CompositionMediaExportDialog media={{ ...media, phase: "done", progress: 100 }} />);
    expect(host.querySelector('[data-testid="cancel-composition-video"]')).toBeNull();
    expect(host.textContent).toContain("저장했어요");
  });

  it("연주 음악 MP3 작업에는 선택한 음악을 표시하고 영상 진행률·취소 버튼이 없다", () => {
    media = { ...media, exporting: true, format: "mp3", mix: "performance", phase: "working", status: "연주 음악을 만들고 있어요." };
    render(<CompositionMediaExportDialog media={media} />);
    expect(host.textContent).toContain("연주 음악 만드는 중");
    expect(host.querySelector("progress")).toBeNull();
    expect(host.querySelector('[data-testid="cancel-composition-video"]')).toBeNull();
  });
});

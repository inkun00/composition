// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StudioResultPreview from "./StudioResultPreview";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
let frames: FrameRequestCallback[];
const close = vi.fn();
const result = { url: "blob:finished-video", name: "나의노래.mp4" };

beforeEach(() => {
  close.mockReset();
  frames = [];
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

function mount() {
  act(() => root.render(<StudioResultPreview result={result} onClose={close} />));
}

describe("완성 영상 팝업", () => {
  it("생성한 MP4를 재생하고 원래 파일 이름으로 다시 저장한다", () => {
    mount();
    const video = host.querySelector("video")!;
    const download = host.querySelector("a")!;
    expect(video.getAttribute("src")).toBe(result.url);
    expect(video.controls).toBe(true);
    expect(video.playsInline).toBe(true);
    expect(download.getAttribute("href")).toBe(result.url);
    expect(download.download).toBe(result.name);
  });

  it("Escape는 팝업만 닫고 편집기의 Escape로 전파되지 않는다", () => {
    const outerEscape = vi.fn();
    act(() => root.render(<div onKeyDown={outerEscape}>
      <StudioResultPreview result={result} onClose={close} />
    </div>));
    act(() => host.querySelector("video")!.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Escape", bubbles: true
    })));
    expect(close).toHaveBeenCalledOnce();
    expect(outerEscape).not.toHaveBeenCalled();
  });

  it("포커스를 팝업 안에서 순환시키고 닫으면 영상 보기 버튼으로 돌린다", () => {
    const opener = document.createElement("button");
    opener.textContent = "완성 영상 보기";
    document.body.prepend(opener);
    opener.focus();
    mount();
    const first = host.querySelector("button")!;
    const last = host.querySelector("a")!;
    expect(document.activeElement).toBe(first);
    act(() => first.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Tab", shiftKey: true, bubbles: true, cancelable: true
    })));
    expect(document.activeElement).toBe(last);
    act(() => last.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Tab", bubbles: true, cancelable: true
    })));
    expect(document.activeElement).toBe(first);
    act(() => root.render(null));
    frames.forEach((callback) => callback(0));
    expect(document.activeElement).toBe(opener);
  });

  it("영상과 다운로드를 누를 때는 유지하고 닫기와 배경 클릭에 반응한다", () => {
    mount();
    act(() => host.querySelector("video")!.click());
    expect(close).not.toHaveBeenCalled();
    act(() => host.querySelector("button")!.click());
    expect(close).toHaveBeenCalledOnce();
    act(() => (host.querySelector(".mv-result-backdrop") as HTMLElement).click());
    expect(close).toHaveBeenCalledTimes(2);
  });
});

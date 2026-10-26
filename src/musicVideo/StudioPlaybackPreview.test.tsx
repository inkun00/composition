// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MusicVideoExportOptions } from "../video/exportMusicVideoMp4";
import type { MusicVideoPlan, MusicVideoScene } from "../video/musicVideoModel";
import StudioPlaybackPreview from "./StudioPlaybackPreview";

const { hook, draw } = vi.hoisted(() => ({ hook: vi.fn(), draw: vi.fn() }));
vi.mock("./useStudioPlayback", () => ({ useStudioPlayback: hook }));
vi.mock("../video/musicVideoRenderer", () => ({ drawMusicVideoFrame: draw }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const scenes: readonly MusicVideoScene[] = ["one", "two"].map((id) => ({
  id, motion: "bounce", background: "#ffffff", endLyric: null, elements: [
    { id: `${id}-line`, tool: "line", color: "#3b82f6", width: 8, points: [[30, 40, .5], [130, 140, .5]] }
  ]
}));
const options: MusicVideoExportOptions = { measures: [], instrumentId: "violin", bpm: 120, scenes,
  title: "함께 듣는 노래", animated: true,
  accompaniment: { styleId: "arpeggio", instrumentIds: ["piano"], meter: { beats: 4, beatUnit: 4 } } };
const plan: MusicVideoPlan = { title: options.title, bpm: 120, introSeconds: 2,
  lyrics: { title: options.title, hasLyrics: true, frames: [] }, scenes: [
    { scene: scenes[0], startSeconds: 2, endSeconds: 4, lyricText: "첫 장면" },
    { scene: scenes[1], startSeconds: 4, endSeconds: 8, lyricText: "다음 장면" }
  ] };
const play = vi.fn();
const pause = vi.fn();
const seek = vi.fn();
const restart = vi.fn();
const close = vi.fn();
const busy = vi.fn();
let host: HTMLDivElement;
let root: Root;
let currentTime: number;
let nextFrame: number;
let frames: Map<number, FrameRequestCallback>;
let state: { plan: MusicVideoPlan | null; duration: number; time: number; playing: boolean; loading: boolean; error: string | null };

function render(extra: Partial<MusicVideoExportOptions> = {}, onKeyDown?: (event: React.KeyboardEvent) => void) {
  act(() => root.render(<div onKeyDown={onKeyDown}>
    <StudioPlaybackPreview options={{ ...options, ...extra }} onBusyChange={busy} onClose={close} />
  </div>));
}

function byId<T extends HTMLElement = HTMLButtonElement>(name: string) {
  return host.querySelector<T>(`[data-testid="music-video-preview-${name}"]`)!;
}

function click(name: string) {
  act(() => byId<HTMLButtonElement>(name).click());
}

function advanceFrame() {
  const callbacks = [...frames.values()];
  frames.clear();
  act(() => callbacks.forEach((callback) => callback(0)));
}

beforeEach(() => {
  vi.clearAllMocks();
  currentTime = 0;
  nextFrame = 0;
  frames = new Map();
  state = { plan: null, duration: 0, time: 0, playing: false, loading: false, error: null };
  hook.mockImplementation(() => ({ ...state, play, pause, seek, restart, getCurrentTime: readTime }));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as CanvasRenderingContext2D);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const id = ++nextFrame;
    frames.set(id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

function readTime() { return currentTime; }

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("노래와 전체 장면을 함께 미리보기", () => {
  it("전주 그림이 없으면 제목과 작곡가 카드를 보여주고 재생 전에는 음원을 시작하지 않는다", () => {
    render({ composer: "김작곡" });
    expect(hook).toHaveBeenCalledWith({ ...options, composer: "김작곡" }, busy);
    expect(play).not.toHaveBeenCalled();
    expect(byId<HTMLCanvasElement>("canvas").width).toBe(1280);
    expect(byId<HTMLCanvasElement>("canvas").height).toBe(720);
    expect(host.querySelector(".mv-playback-placeholder .mv-intro-title-card")?.textContent).toContain("김작곡");
    expect(host.querySelector(".mv-playback-placeholder .mv-intro-title-card")?.textContent).toContain(options.title);
    expect(host.querySelector(".mv-playback-placeholder > svg")).toBeNull();
    expect(byId<HTMLInputElement>("seek").disabled).toBe(true);
    expect(byId("time").textContent).toBe("0:00 / 0:00");
    expect(frames.size).toBe(0);
    click("play");
    expect(play).toHaveBeenCalledOnce();
  });

  it("화면 갱신은 느린 transport 시간이 아닌 실제 음원 clock을 사용한다", () => {
    state = { ...state, plan, duration: 8, time: 1, playing: true };
    currentTime = 3.125;
    render();
    expect(draw).toHaveBeenLastCalledWith(expect.anything(), plan, 3.125, true);
    expect(frames.size).toBe(1);
    currentTime = 4.25;
    advanceFrame();
    expect(draw).toHaveBeenLastCalledWith(expect.anything(), plan, 4.25, true);
    expect(byId("time").textContent).toBe("0:01 / 0:08");
    click("play");
    expect(pause).toHaveBeenCalledOnce();
    state = { ...state, playing: false, time: 4.25 };
    render();
    expect(frames.size).toBe(0);
    currentTime = 7.9;
    advanceFrame();
    expect(draw).toHaveBeenLastCalledWith(expect.anything(), plan, 4.25, true);
  });

  it("일시정지 중 탐색하면 재생 없이 해당 프레임과 현재 장면을 갱신한다", () => {
    state = { ...state, plan, duration: 8 };
    render();
    const input = byId<HTMLInputElement>("seek");
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "4.5");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(seek).toHaveBeenCalledWith(4.5);
    currentTime = 4.5;
    state = { ...state, time: 4.5 };
    render();
    expect(draw).toHaveBeenLastCalledWith(expect.anything(), plan, 4.5, true);
    expect(byId("scene").textContent).toBe("장면 2 / 2");
    expect(frames.size).toBe(0);
    expect(play).not.toHaveBeenCalled();
    click("restart");
    expect(restart).toHaveBeenCalledOnce();
  });

  it("준비 중 조작을 잠그고 실패 후 다시 준비할 수 있다", () => {
    state = { ...state, loading: true };
    render();
    expect(byId<HTMLButtonElement>("play").disabled).toBe(true);
    expect(byId<HTMLButtonElement>("restart").disabled).toBe(true);
    expect(host.textContent).toContain("노래와 장면을 준비하고 있어요");
    state = { ...state, loading: false, error: "음악을 불러오지 못했어요." };
    render();
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(state.error);
    click("retry");
    expect(play).toHaveBeenCalledOnce();
  });

  it("편집 단축키 전파를 막고 Escape와 배경 닫기에서 재생을 멈춘다", () => {
    const outer = vi.fn();
    render({}, outer);
    act(() => byId("dialog").dispatchEvent(new KeyboardEvent("keydown", {
      key: "z", ctrlKey: true, bubbles: true
    })));
    expect(outer).not.toHaveBeenCalled();
    act(() => byId("dialog").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(close).toHaveBeenCalledOnce();
    expect(pause).toHaveBeenCalledOnce();
    act(() => (host.querySelector(".mv-playback-backdrop") as HTMLElement).click());
    expect(close).toHaveBeenCalledTimes(2);
    expect(pause).toHaveBeenCalledTimes(2);
  });

  it("Tab은 팝업 안에서 순환하고 닫으면 미리보기 열기 버튼으로 돌아간다", () => {
    const opener = document.createElement("button");
    document.body.prepend(opener);
    opener.focus();
    render();
    expect(document.activeElement).toBe(byId("close"));
    byId("play").focus();
    act(() => byId("play").dispatchEvent(new KeyboardEvent("keydown", {
      key: "Tab", bubbles: true, cancelable: true
    })));
    expect(document.activeElement).toBe(byId("close"));
    act(() => root.render(null));
    advanceFrame();
    expect(document.activeElement).toBe(opener);
  });

  it("현재 인트로·장면과 녹음한 목소리 사용을 표시한다", () => {
    state = { ...state, plan, duration: 8 };
    const recording = { audioUrl: "blob:voice", plan: plan.lyrics };
    render({ recording });
    expect(byId("scene").textContent).toBe("전주");
    expect(byId("recording").textContent).toContain("녹음한 목소리");
    state = { ...state, time: 2 };
    render({ recording });
    expect(byId("scene").textContent).toBe("장면 1 / 2");
    state = { ...state, time: 8 };
    render({ recording });
    expect(byId("scene").textContent).toBe("장면 2 / 2");
  });

  it("전주에 그림이 있을 때만 준비 전에도 해당 전주 그림을 보여준다", () => {
    const intro: MusicVideoScene = { ...scenes[0], id: "intro", section: "intro", endLyric: null };
    render({ scenes: [intro, ...scenes] });
    expect(host.querySelector(".mv-playback-placeholder > svg path")).not.toBeNull();
    expect(host.querySelector(".mv-playback-placeholder .mv-intro-title-card")).toBeNull();
    render({ scenes: [{ ...intro, elements: [] }, ...scenes], composer: "김작곡" });
    expect(host.querySelector(".mv-playback-placeholder > svg path")).toBeNull();
    expect(host.querySelector(".mv-playback-placeholder .mv-intro-title-card")?.textContent).toContain("김작곡");
  });
});

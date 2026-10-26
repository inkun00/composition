// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MusicVideoPlan, MusicVideoScene } from "../video/musicVideoModel";
import SceneMotionPreview from "./SceneMotionPreview";

const { engine, draw } = vi.hoisted(() => ({ engine: vi.fn(), draw: vi.fn() }));
vi.mock("../video/sceneVectorEngine", () => ({ ensureSceneVectorEngine: engine }));
vi.mock("../video/musicVideoRenderer", () => ({ drawMusicVideoFrame: draw }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const moving: MusicVideoScene = { id: "moving", background: "#ffffff", elements: [], endLyric: null, motion: "auto",
  choreography: { version: 1, description: "", actors: [{ id: "hand", name: "손", elementIds: [],
    fixedPoint: [100, 100], movingPoint: [200, 100], endPoint: [220, 120] }], actions: [{ id: "press", actorId: "hand",
      kind: "press", startMeasureIndex: 0, startBeat: 0, durationBeats: 2, strength: 1 }] } };
const still: MusicVideoScene = { ...moving, id: "still", choreography: undefined };
let host: HTMLDivElement;
let root: Root;
let now: number;
let nextFrame: number;
let frames: Map<number, FrameRequestCallback>;

function render(scene: MusicVideoScene, options: { plan?: MusicVideoPlan; playRequest?: string; bpm?: number; suspended?: boolean } = {}) {
  act(() => root.render(<SceneMotionPreview scene={scene} bpm={120} title="노래" lyricText="가사" {...options} />));
}

function scenePlan(scene: MusicVideoScene, start = 9, bpm = 120): MusicVideoPlan {
  return { title: "노래", bpm, introSeconds: 0,
    lyrics: { title: "노래", hasLyrics: false, frames: [] },
    scenes: [{ scene, startSeconds: start, endSeconds: start + 8 * 60 / bpm, lyricText: "" }] };
}

function advance(milliseconds: number) {
  now += milliseconds;
  const callbacks = [...frames.values()];
  frames.clear();
  act(() => { callbacks.forEach((callback) => callback(now)); });
}

beforeEach(() => {
  vi.clearAllMocks();
  now = 0;
  nextFrame = 0;
  frames = new Map();
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
    const id = ++nextFrame;
    frames.set(id, callback);
    return id;
  }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn((id: number) => { frames.delete(id); }));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as CanvasRenderingContext2D);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("선택한 모션의 즉시 미리보기", () => {
  const floating: MusicVideoScene = { ...still, id: "floating", motion: "float" };

  it("그리는 동안 프레임 작업을 멈추고 펜을 떼면 최신 그림으로 단일 재생을 이어 간다", () => {
    const plan = scenePlan(floating);
    render(floating, { plan, playRequest: "floating:1" });
    advance(250);
    render(floating, { plan, playRequest: "floating:1", suspended: true });
    const count = draw.mock.calls.length;
    expect(frames.size).toBe(0);
    expect(host.querySelector<HTMLButtonElement>("button")!.disabled).toBe(true);
    advance(750);
    expect(draw).toHaveBeenCalledTimes(count);
    const latest = { ...floating, background: "#fff8ed" };
    const nextPlan = scenePlan(latest);
    render(latest, { plan: nextPlan, playRequest: "floating:1", suspended: true });
    expect(draw).toHaveBeenCalledTimes(count);
    render(latest, { plan: nextPlan, playRequest: "floating:1", suspended: false });
    expect(host.querySelector<HTMLButtonElement>("button")!.disabled).toBe(false);
    expect(draw.mock.lastCall?.[1]).toBe(nextPlan);
    expect(frames.size).toBe(1);
  });

  it("카드 선택 요청이 오면 자동 재생하고 장면 시작 시각부터 프레임을 그린다", () => {
    const plan = scenePlan(floating);
    render(floating, { plan });
    expect(host.querySelector("button")!.getAttribute("aria-pressed")).toBe("false");
    expect(frames.size).toBe(0);
    render(floating, { plan, playRequest: "floating:1" });
    expect(host.querySelector("button")!.getAttribute("aria-pressed")).toBe("true");
    expect(draw.mock.lastCall?.[2]).toBe(9);
    advance(250);
    expect(draw.mock.lastCall?.[2]).toBe(9.25);
    expect(engine).not.toHaveBeenCalled();
  });

  it("같은 카드를 재생 중 다시 누르면 변경된 요청에 맞춰 처음부터 재시작한다", () => {
    const plan = scenePlan(floating);
    render(floating, { plan, playRequest: "floating:1" });
    advance(750);
    expect(draw.mock.lastCall?.[2]).toBe(9.75);
    render(floating, { plan, playRequest: "floating:2" });
    expect(draw.mock.lastCall?.[2]).toBe(9);
    advance(250);
    expect(draw.mock.lastCall?.[2]).toBe(9.25);
    expect(host.querySelector("button")!.getAttribute("aria-pressed")).toBe("true");
  });

  it("같은 모션의 다른 장면으로 바꾸면 수동 재생을 멈추고 새 장면 시작으로 돌아간다", () => {
    render(floating, { plan: scenePlan(floating) });
    act(() => host.querySelector<HTMLButtonElement>("button")!.click());
    advance(500);
    expect(draw.mock.lastCall?.[2]).toBe(9.5);
    const next: MusicVideoScene = { ...floating, id: "next" };
    render(next, { plan: scenePlan(next, 14) });
    expect(host.querySelector("button")!.getAttribute("aria-pressed")).toBe("false");
    expect(draw.mock.lastCall?.[2]).toBe(14);
    expect(frames.size).toBe(0);
  });

  it("정지 모션은 선택 요청이 있어도 반복 재생을 시작하지 않는다", () => {
    const staticScene: MusicVideoScene = { ...still, motion: "still" };
    render(staticScene, { plan: scenePlan(staticScene), playRequest: "still:1" });
    expect(host.querySelector("button")!.getAttribute("aria-pressed")).toBe("false");
    expect(frames.size).toBe(0);
    expect(draw.mock.lastCall?.[2]).toBe(9);
  });

  it("재생 중 BPM이 바뀌면 새 악보 구간의 첫 박부터 단일 프레임 루프로 다시 재생한다", () => {
    render(floating, { plan: scenePlan(floating), playRequest: "floating:1" });
    advance(750);
    expect(draw.mock.lastCall?.[2]).toBe(9.75);
    expect(frames.size).toBe(1);
    const [oldFrameId, oldFrame] = [...frames.entries()][0];
    const faster = scenePlan(floating, 6, 180);

    render(floating, { plan: faster, bpm: 180, playRequest: "floating:1" });
    expect(cancelAnimationFrame).toHaveBeenCalledWith(oldFrameId);
    expect(draw.mock.lastCall?.[1]).toBe(faster);
    expect(draw.mock.lastCall?.[2]).toBe(6);
    expect(Number(host.querySelector<HTMLInputElement>("input")!.max)).toBeCloseTo(8 * 60 / 180);
    expect(host.querySelector("button")!.getAttribute("aria-pressed")).toBe("true");
    expect(frames.size).toBe(1);

    const drawCount = draw.mock.calls.length;
    act(() => oldFrame(now));
    expect(draw).toHaveBeenCalledTimes(drawCount);
    expect(frames.size).toBe(1);
    advance(250);
    expect(draw.mock.lastCall?.[1].bpm).toBe(180);
    expect(draw.mock.lastCall?.[2]).toBe(6.25);
    expect(frames.size).toBe(1);
  });

  it("일시 정지한 뒤 BPM을 바꾸면 새 첫 박을 그리고 정지 상태를 유지한다", () => {
    render(floating, { plan: scenePlan(floating), playRequest: "floating:1" });
    advance(750);
    act(() => host.querySelector<HTMLButtonElement>("button")!.click());
    expect(host.querySelector("button")!.getAttribute("aria-pressed")).toBe("false");
    expect(frames.size).toBe(0);

    const slower = scenePlan(floating, 12, 90);
    render(floating, { plan: slower, bpm: 90, playRequest: "floating:1" });
    expect(draw.mock.lastCall?.[1]).toBe(slower);
    expect(draw.mock.lastCall?.[2]).toBe(12);
    expect(host.querySelector<HTMLInputElement>("input")!.value).toBe("0");
    expect(host.querySelector("button")!.getAttribute("aria-pressed")).toBe("false");
    expect(frames.size).toBe(0);
  });

  it.each([90, 120, 180, 97, 119, 0, Number.NaN])("악보 계획이 없어도 BPM %s를 기준으로 8박을 미리 본다", (bpm) => {
    render(floating, { bpm });
    const effectiveBpm = Number.isFinite(bpm) && bpm > 0 ? bpm : 120;
    const renderedPlan = draw.mock.lastCall![1] as MusicVideoPlan;
    expect(renderedPlan.bpm).toBe(effectiveBpm);
    expect(renderedPlan.scenes[0].endSeconds).toBeCloseTo(8 * 60 / effectiveBpm);
    expect(renderedPlan.lyrics.frames[0].endSeconds).toBeCloseTo(8 * 60 / effectiveBpm);
    expect(Number(host.querySelector<HTMLInputElement>("input")!.max)).toBeCloseTo(8 * 60 / effectiveBpm);
  });

  it("장면 전체가 정지여도 개체 효과를 고르면 자동 재생하고 같은 카드 재선택은 처음부터 재생한다", () => {
    const partial: MusicVideoScene = { ...still, motion: "still", elements: [{ id: "moving-object", tool: "line",
      color: "#123456", width: 8, points: [[100, 100, .5], [200, 100, .5]], motion: "move-right" }] };
    const plan = scenePlan(partial);
    render(partial, { plan, playRequest: "partial:1" });
    expect(host.querySelector("button")!.getAttribute("aria-pressed")).toBe("true");
    advance(500);
    expect(draw.mock.lastCall?.[2]).toBe(9.5);
    render(partial, { plan, playRequest: "partial:2" });
    expect(draw.mock.lastCall?.[2]).toBe(9);
    expect(frames.size).toBe(1);
    expect(engine).not.toHaveBeenCalled();
  });

  it("이전 대상별 동작이 함께 저장됐어도 개체 효과가 있으면 벡터 도구를 기다리지 않는다", () => {
    const mixed: MusicVideoScene = { ...moving, motion: "still", elements: [{ id: "object", tool: "line",
      color: "#123456", width: 8, points: [[100, 100, .5], [200, 100, .5]], motion: "bounce-left" }] };
    render(mixed, { plan: scenePlan(mixed), playRequest: "mixed:1" });
    expect(host.querySelector<HTMLButtonElement>("button")!.disabled).toBe(false);
    expect(host.querySelector("button")!.getAttribute("aria-pressed")).toBe("true");
    expect(engine).not.toHaveBeenCalled();
    expect(draw.mock.lastCall?.[1].scenes[0].scene).toBe(mixed);
  });
});

describe("움직임 도구를 불러오는 동안 장면 변경", () => {
  it("동작 없는 장면으로 바꾸면 기다리지 않고 조작을 열며 이전 비동기 결과는 그리지 않는다", async () => {
    let resolve!: () => void;
    engine.mockReturnValue(new Promise<void>((complete) => { resolve = complete; }));
    render(moving);
    expect(host.querySelector<HTMLButtonElement>("button")!.disabled).toBe(true);
    expect(host.querySelector<HTMLInputElement>("input")!.disabled).toBe(true);
    expect(draw).not.toHaveBeenCalled();

    render(still);
    expect(host.querySelector<HTMLButtonElement>("button")!.disabled).toBe(false);
    expect(host.querySelector<HTMLInputElement>("input")!.disabled).toBe(false);
    expect(draw).toHaveBeenCalledTimes(1);
    expect(draw.mock.calls[0][1].scenes[0].scene.id).toBe("still");

    await act(async () => { resolve(); await Promise.resolve(); });
    expect(draw).toHaveBeenCalledTimes(1);
    expect(host.querySelector<HTMLButtonElement>("button")!.disabled).toBe(false);
    expect(host.querySelector<HTMLInputElement>("input")!.disabled).toBe(false);
  });
});

// @vitest-environment jsdom

import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runExclusiveAudioExport } from "../audio/player";
import { buildMusicVideoPlan } from "../video/musicVideoModel";
import type { MusicVideoExportOptions } from "../video/prepareMusicVideoPlayback";
import { useStudioPlayback } from "./useStudioPlayback";

const prepare = vi.hoisted(() => vi.fn());
vi.mock("../video/prepareMusicVideoPlayback", async (original) => ({
  ...await original<typeof import("../video/prepareMusicVideoPlayback")>(), prepareMusicVideoPlayback: prepare
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const options: MusicVideoExportOptions = {
  title: "함께 보는 음악", instrumentId: "piano", bpm: 120, animated: true,
  accompaniment: { styleId: "arpeggio", instrumentIds: ["piano"] },
  measures: [0, 1].map((measureIndex) => ({ harmony: "home", measureIndex,
    notes: [{ id: `note-${measureIndex}`, pitch: 60 + measureIndex * 2,
      duration: { numerator: 4, denominator: 1 }, lyric: measureIndex ? "노래" : "별빛" }] })),
  scenes: [0, 1].map((index) => ({ id: `scene-${index}`, background: "#ffffff", motion: "bounce",
    endLyric: null, endMeasureIndex: index, elements: [{ id: `line-${index}`, tool: "line", color: "#123456",
      width: 8, points: [[100, 100, .3], [300, 200, .9]] }] }))
};
const plan = buildMusicVideoPlan(options.title, options.measures, options.bpm, 2.08, 12, options.scenes);
const buffer = { duration: 12 } as AudioBuffer;
const prepared = { plan, audio: buffer, duration: 12 };

class SourceMock {
  buffer: AudioBuffer | null = null;
  onended: (() => void) | null = null;
  connect = vi.fn();
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

let resumeError: Error | null;
let decodeError: Error | null;
const contexts: ContextMock[] = [];

class ContextMock {
  state = "suspended";
  currentTime = 20;
  destination = {};
  sources: SourceMock[] = [];
  resume = vi.fn(async () => {
    if (resumeError) throw resumeError;
    this.state = "running";
  });
  close = vi.fn(async () => { this.state = "closed"; });
  decodeAudioData = vi.fn(async () => {
    if (decodeError) throw decodeError;
    return buffer;
  });
  createBufferSource = vi.fn(() => {
    const source = new SourceMock();
    this.sources.push(source);
    return source;
  });
  constructor() {
    contexts.push(this);
  }
}

let root: Root;
let host: HTMLDivElement;
let current: ReturnType<typeof useStudioPlayback>;
let busy: ReturnType<typeof vi.fn>;
let unmounted: boolean;
let frameId: number;
let frameNow: number;
const frames = new Map<number, FrameRequestCallback>();

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, resolve, reject };
}

function Harness({ onBusy, snapshot }: Readonly<{
  onBusy: (value: boolean) => void;
  snapshot: MusicVideoExportOptions;
}>) {
  current = useStudioPlayback(snapshot, onBusy);
  return null;
}

function mount(snapshot = options, onBusy = busy, strict = false) {
  if (unmounted) {
    root = createRoot(host);
    unmounted = false;
  }
  act(() => root.render(strict ? <StrictMode><Harness onBusy={onBusy} snapshot={snapshot} /></StrictMode>
    : <Harness onBusy={onBusy} snapshot={snapshot} />));
}

function unmount() {
  act(() => root.unmount());
  unmounted = true;
}

function frame() {
  frameNow += 101;
  const callbacks = [...frames.values()];
  frames.clear();
  act(() => callbacks.forEach((callback) => callback(999_999)));
}

beforeEach(() => {
  vi.resetAllMocks();
  contexts.length = 0;
  frames.clear();
  frameId = 0;
  frameNow = 1000;
  resumeError = null;
  decodeError = null;
  prepare.mockResolvedValue(prepared);
  vi.stubGlobal("AudioContext", ContextMock);
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
    frames.set(++frameId, callback);
    return frameId;
  }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn((id: number) => frames.delete(id)));
  vi.spyOn(performance, "now").mockImplementation(() => frameNow);
  busy = vi.fn();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  unmounted = false;
});

afterEach(() => {
  if (!unmounted) unmount();
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("전체 음악과 장면의 동기 미리보기 재생", () => {
  it("gesture에서 context를 즉시 만들고 중복 준비를 잠그며 실제 음악 clock으로 일시정지·재개한다", async () => {
    const ready = deferred<typeof prepared>();
    prepare.mockReturnValueOnce(ready.promise);
    mount();
    expect(contexts).toHaveLength(0);
    expect(busy.mock.calls).toEqual([[true]]);
    let first!: Promise<void>;
    let duplicate!: Promise<void>;
    act(() => {
      first = current.play();
      duplicate = current.play();
      expect(contexts).toHaveLength(1);
      expect(contexts[0].resume).toHaveBeenCalledOnce();
    });
    expect(current).toMatchObject({ loading: true, plan: null, playing: false });
    await act(async () => { ready.resolve(prepared); await Promise.all([first, duplicate]); });
    expect(prepare).toHaveBeenCalledOnce();
    expect(current).toMatchObject({ plan, duration: 12, playing: true, loading: false, error: null });
    expect(contexts[0].sources[0].start).toHaveBeenCalledWith(0, 0, 12);
    contexts[0].currentTime += 1.25;
    expect(current.getCurrentTime()).toBe(1.25);
    frame();
    expect(current.time).toBe(1.25);
    act(() => current.pause());
    expect(current).toMatchObject({ time: 1.25, playing: false });
    expect(contexts[0].sources[0].stop).toHaveBeenCalledOnce();
    expect(contexts[0].sources[0].disconnect).toHaveBeenCalledOnce();
    expect(frames.size).toBe(0);
    contexts[0].currentTime += 4;
    expect(current.getCurrentTime()).toBe(1.25);
    await act(async () => current.play());
    expect(prepare).toHaveBeenCalledOnce();
    expect(contexts[0].sources[1].start).toHaveBeenCalledWith(0, 1.25, 10.75);
    expect(busy.mock.calls).toEqual([[true]]);
  });

  it("seek는 재생 상태를 보존하고 이전 source의 늦은 ended가 새 위치를 덮지 않는다", async () => {
    mount();
    await act(async () => current.play());
    const source = contexts[0].sources[0];
    const ended = source.onended!;
    act(() => current.seek(5));
    expect(current).toMatchObject({ playing: true, time: 5 });
    expect(current.getCurrentTime()).toBe(5);
    expect(contexts[0].sources[1].start).toHaveBeenCalledWith(0, 5, 7);
    act(() => ended());
    expect(current).toMatchObject({ playing: true, time: 5 });
    act(() => current.pause());
    act(() => current.seek(3));
    expect(current).toMatchObject({ playing: false, time: 3 });
    expect(contexts[0].sources).toHaveLength(2);
    await act(async () => current.restart());
    expect(current).toMatchObject({ playing: true, time: 0 });
    expect(contexts[0].sources[2].start).toHaveBeenCalledWith(0, 0, 12);
    act(() => current.seek(100));
    expect(current).toMatchObject({ playing: false, time: 12 });
    act(() => current.seek(Number.NaN));
    expect(current.getCurrentTime()).toBe(0);
  });

  it("재생 끝에서는 정확한 종료 위치에 멈추고 다시 재생하면 처음부터 시작한다", async () => {
    mount();
    await act(async () => current.play());
    act(() => contexts[0].sources[0].onended!());
    expect(current).toMatchObject({ playing: false, time: 12 });
    expect(frames.size).toBe(0);
    await act(async () => current.play());
    expect(current).toMatchObject({ playing: true, time: 0 });
    expect(contexts[0].sources[1].start).toHaveBeenCalledWith(0, 0, 12);
    contexts[0].currentTime += 12;
    frame();
    expect(current).toMatchObject({ playing: false, time: 12 });
  });

  it("준비 도중 일시정지를 누르면 준비 완료 뒤 자동으로 소리를 내지 않는다", async () => {
    const ready = deferred<typeof prepared>();
    prepare.mockReturnValueOnce(ready.promise);
    mount();
    let job!: Promise<void>;
    act(() => { job = current.play(); });
    act(() => current.pause());
    await act(async () => { ready.resolve(prepared); await job; });
    expect(current).toMatchObject({ plan, playing: false, loading: false });
    expect(contexts[0].sources).toHaveLength(0);
    await act(async () => current.play());
    expect(current.playing).toBe(true);
    expect(prepare).toHaveBeenCalledOnce();
  });

  it("준비 실패와 AudioContext 재개 실패를 정리하고 새 gesture에서 재시도한다", async () => {
    prepare.mockRejectedValueOnce(new Error("악기 준비 오류"));
    mount();
    await act(async () => current.play());
    expect(current).toMatchObject({ error: "악기 준비 오류", loading: false, playing: false });
    expect(contexts[0].close).toHaveBeenCalledOnce();
    resumeError = new Error("오디오 재개 오류");
    await act(async () => current.play());
    expect(current.error).toBe("오디오 재개 오류");
    expect(contexts[1].close).toHaveBeenCalledOnce();
    expect(prepare).toHaveBeenCalledOnce();
    resumeError = null;
    await act(async () => current.play());
    expect(current).toMatchObject({ error: null, playing: true });
    expect(contexts).toHaveLength(3);
    expect(prepare).toHaveBeenCalledTimes(2);
  });

  it("다른 오디오 준비와 경쟁하면 안내하고 잠금이 풀린 뒤 다시 준비할 수 있다", async () => {
    const exclusive = deferred<string>();
    const other = runExclusiveAudioExport(() => exclusive.promise);
    mount();
    await act(async () => current.play());
    expect(current.error).toContain("다른 연주나 녹음");
    expect(prepare).not.toHaveBeenCalled();
    exclusive.resolve("done");
    await other;
    await act(async () => current.play());
    expect(current.playing).toBe(true);
  });

  it("준비 중 닫기·다시 열기는 늦은 결과를 버리고 abort가 정리된 후 새 미리보기를 허용한다", async () => {
    const ready = deferred<typeof prepared>();
    prepare.mockReturnValueOnce(ready.promise);
    mount();
    let job!: Promise<void>;
    act(() => { job = current.play(); });
    await act(async () => Promise.resolve());
    const signal = prepare.mock.calls[0][1] as AbortSignal;
    unmount();
    expect(signal.aborted).toBe(true);
    expect(contexts[0].close).toHaveBeenCalledOnce();
    expect(busy).toHaveBeenLastCalledWith(false);
    mount();
    await act(async () => current.play());
    expect(current.error).toContain("다른 연주나 녹음");
    await act(async () => { ready.resolve(prepared); await job; });
    expect(contexts[0].sources).toHaveLength(0);
    await act(async () => current.play());
    expect(current.playing).toBe(true);
    expect(current.error).toBeNull();
  });

  it("화면 종료 시 음악·context·RAF를 정리하고 최신 busy 콜백만 해제한다", async () => {
    mount();
    await act(async () => current.play());
    const latest = vi.fn();
    mount(options, latest);
    const source = contexts[0].sources[0];
    const ended = source.onended!;
    unmount();
    expect(source.stop).toHaveBeenCalledOnce();
    expect(source.disconnect).toHaveBeenCalledOnce();
    expect(source.onended).toBeNull();
    expect(contexts[0].close).toHaveBeenCalledOnce();
    expect(frames.size).toBe(0);
    expect(latest.mock.calls).toEqual([[false]]);
    expect(busy.mock.calls).toEqual([[true]]);
    ended();
    expect(frames.size).toBe(0);
  });

  it("녹음 URL은 실제 decode 경로로 재생하고 seek·resume 때 다시 가져오거나 디코드하지 않는다", async () => {
    const data = new ArrayBuffer(16);
    const fetchRecording = vi.fn(async () => ({ ok: true, arrayBuffer: async () => data }));
    vi.stubGlobal("fetch", fetchRecording);
    prepare.mockResolvedValueOnce({ ...prepared, audio: "blob:recording" });
    mount({ ...options, recording: { audioUrl: "blob:recording", plan: plan.lyrics } });
    await act(async () => current.play());
    expect(fetchRecording).toHaveBeenCalledWith("blob:recording", { signal: expect.any(AbortSignal) });
    expect(contexts[0].decodeAudioData).toHaveBeenCalledExactlyOnceWith(data);
    expect(contexts[0].sources[0].buffer).toBe(buffer);
    expect(current.plan).toBe(plan);
    act(() => current.pause());
    act(() => current.seek(6));
    await act(async () => current.play());
    expect(fetchRecording).toHaveBeenCalledOnce();
    expect(contexts[0].decodeAudioData).toHaveBeenCalledOnce();
    expect(contexts[0].sources[1].start).toHaveBeenCalledWith(0, 6, 6);
  });

  it("녹음 디코드가 실패하면 소리를 내지 않고 새 준비로 재시도한다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(16) })));
    prepare.mockResolvedValue({ ...prepared, audio: "blob:recording" });
    decodeError = new Error("녹음 디코드 오류");
    mount();
    await act(async () => current.play());
    expect(current).toMatchObject({ error: "녹음 디코드 오류", loading: false, playing: false });
    expect(contexts[0].sources).toHaveLength(0);
    decodeError = null;
    await act(async () => current.play());
    expect(current.playing).toBe(true);
    expect(prepare).toHaveBeenCalledTimes(2);
  });

  it("StrictMode의 효과 재실행 뒤에도 재생하고 background 정지 뒤 restart gesture에서 context를 재개한다", async () => {
    mount(options, busy, true);
    expect(busy.mock.calls).toEqual([[true], [false], [true]]);
    await act(async () => current.play());
    expect(contexts).toHaveLength(1);
    contexts[0].state = "suspended";
    await act(async () => current.restart());
    expect(contexts[0].resume).toHaveBeenCalledTimes(2);
    expect(contexts[0].state).toBe("running");
    expect(current).toMatchObject({ playing: true, time: 0 });
    unmount();
    expect(busy).toHaveBeenLastCalledWith(false);
    expect(contexts[0].close).toHaveBeenCalledOnce();
  });
});

// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MusicVideoExportOptions } from "../video/exportMusicVideoMp4";
import { useMusicVideoExport } from "./useMusicVideoExport";

const exporter = vi.hoisted(() => vi.fn());
vi.mock("../video/exportMusicVideoMp4", () => ({ exportMusicVideoMp4: exporter }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const options: MusicVideoExportOptions = {
  title: "별/노래", bpm: 120, instrumentId: "violin", animated: true,
  accompaniment: { styleId: "arpeggio", instrumentIds: ["piano"], meter: { beats: 4, beatUnit: 4 } },
  measures: [{ harmony: "home", measureIndex: 0,
    notes: [{ id: "last", pitch: 60, duration: { numerator: 4, denominator: 1 }, lyric: "별" }] }],
  scenes: [{ id: "scene", background: "#ffffff", motion: "auto", endLyric: { measureIndex: 0, noteId: "last" },
    elements: [{ id: "line", tool: "line", color: "#123456", width: 8, points: [[50, 50, .5], [200, 200, .5]] }] }]
};

let root: Root;
let host: HTMLDivElement;
let current: ReturnType<typeof useMusicVideoExport>;
let onBusyChange: ReturnType<typeof vi.fn>;
let unmounted: boolean;
let downloads: { name: string; url: string }[];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

function Harness({ onBusy }: Readonly<{ onBusy: (busy: boolean) => void }>) {
  current = useMusicVideoExport(onBusy);
  return null;
}

function mount(callback = onBusyChange) {
  act(() => root.render(<Harness onBusy={callback} />));
}

beforeEach(() => {
  vi.resetAllMocks();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  unmounted = false;
  onBusyChange = vi.fn();
  downloads = [];
  let urlNumber = 0;
  vi.stubGlobal("URL", class extends URL {
    static createObjectURL = vi.fn(() => `blob:music-video-${++urlNumber}`);
    static revokeObjectURL = vi.fn();
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push({ name: this.download, url: this.href });
  });
});

afterEach(() => {
  if (!unmounted) act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("뮤직비디오 제작 작업 관리", () => {
  it("같은 이벤트의 중복 제작을 잠그고 진행률과 안전한 MP4 이름을 제공한다", async () => {
    const pending = deferred<Blob | null>();
    exporter.mockReturnValue(pending.promise);
    mount();
    let job!: Promise<void>;
    act(() => { job = current.make(options); void current.make({ ...options, animated: false }); });
    expect(exporter).toHaveBeenCalledOnce();
    expect(exporter.mock.calls[0][0]).toBe(options);
    expect(exporter.mock.calls[0][2]).toBeInstanceOf(AbortSignal);
    expect(current.working).toBe(true);
    expect(onBusyChange.mock.calls).toEqual([[true]]);
    act(() => exporter.mock.calls[0][1](61));
    expect(current.progress).toBe(61);
    await act(async () => { pending.resolve(new Blob(["video"], { type: "video/mp4" })); await job; });
    expect(current).toMatchObject({ working: false, progress: 100,
      result: { name: "별_노래-뮤직비디오.mp4", url: "blob:music-video-1" } });
    expect(downloads).toEqual([{ name: "별_노래-뮤직비디오.mp4", url: "blob:music-video-1" }]);
    expect(onBusyChange.mock.calls).toEqual([[true], [false]]);
  });

  it("취소 뒤 늦게 완성된 영상은 URL이나 다운로드를 만들지 않고 재시도를 허용한다", async () => {
    const pending = deferred<Blob | null>();
    exporter.mockReturnValue(pending.promise);
    mount();
    let first!: Promise<void>;
    act(() => { first = current.make(options); });
    const signal = exporter.mock.calls[0][2] as AbortSignal;
    act(() => { current.cancel(); void current.make(options); });
    expect(signal.aborted).toBe(true);
    expect(exporter).toHaveBeenCalledOnce();
    await act(async () => { pending.resolve(new Blob(["late result"])); await first; });
    expect(downloads).toEqual([]);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(current).toMatchObject({ working: false, result: null });
    exporter.mockResolvedValue(new Blob(["retry"]));
    await act(async () => { await current.make(options); });
    expect(exporter).toHaveBeenCalledTimes(2);
    expect(downloads).toHaveLength(1);
  });

  it("인코더의 취소 응답을 사용자에게 알리고 부분 파일을 저장하지 않는다", async () => {
    const pending = deferred<Blob | null>();
    exporter.mockReturnValue(pending.promise);
    mount();
    let job!: Promise<void>;
    act(() => { job = current.make(options); current.cancel(); });
    await act(async () => { pending.reject(new DOMException("stopped", "AbortError")); await job; });
    expect(current).toMatchObject({ working: false, result: null });
    expect(current.status).toContain("취소");
    expect(current.status).toContain("그림은 그대로");
    expect(downloads).toEqual([]);
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
  });

  it.each([null, new Error("영상 인코더를 사용할 수 없어요.")])("실패를 정리하고 다음 제작을 허용한다: %s", async (failure) => {
    exporter.mockImplementationOnce(() => failure instanceof Error ? Promise.reject(failure) : Promise.resolve(failure));
    mount();
    await act(async () => { await current.make(options); });
    expect(current).toMatchObject({ working: false, result: null });
    expect(current.status).toContain(failure instanceof Error ? "인코더" : "다른 연주나 녹음");
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(downloads).toEqual([]);
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
    exporter.mockResolvedValue(new Blob(["recovered"]));
    await act(async () => { await current.make({ ...options, title: "   " }); });
    expect(downloads[0].name).toBe("나의노래-뮤직비디오.mp4");
    expect(current.working).toBe(false);
  });

  it("화면을 떠나면 작업을 중단하고 최신 콜백으로 잠금을 풀며 늦은 결과를 버린다", async () => {
    const pending = deferred<Blob | null>();
    exporter.mockReturnValue(pending.promise);
    mount();
    let job!: Promise<void>;
    act(() => { job = current.make(options); });
    const signal = exporter.mock.calls[0][2] as AbortSignal;
    const latestBusy = vi.fn();
    mount(latestBusy);
    act(() => root.unmount());
    unmounted = true;
    expect(signal.aborted).toBe(true);
    expect(latestBusy.mock.calls).toEqual([[false]]);
    expect(onBusyChange.mock.calls).toEqual([[true]]);
    await act(async () => {
      exporter.mock.calls[0][1](99);
      pending.resolve(new Blob(["unmounted result"]));
      await job;
    });
    expect(downloads).toEqual([]);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(latestBusy.mock.calls).toEqual([[false]]);
  });

  it("새 제작을 시작하면 이전 미리보기 URL을 해제하고 화면 종료 때 마지막 URL도 해제한다", async () => {
    exporter.mockResolvedValue(new Blob(["first"]));
    mount();
    await act(async () => { await current.make(options); });
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    const pending = deferred<Blob | null>();
    exporter.mockReturnValue(pending.promise);
    let second!: Promise<void>;
    act(() => { second = current.make(options); });
    expect(current.result).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:music-video-1");
    await act(async () => { pending.resolve(new Blob(["second"])); await second; });
    expect(current.result?.url).toBe("blob:music-video-2");
    act(() => root.unmount());
    unmounted = true;
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
    expect(URL.revokeObjectURL).toHaveBeenLastCalledWith("blob:music-video-2");
  });
});

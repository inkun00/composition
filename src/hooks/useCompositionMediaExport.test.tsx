// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AccompanimentOptions, PlaybackMeasure } from "../audio/accompanimentScore";
import { rational } from "../music/rational";
import { useCompositionMediaExport, type CompositionMediaExportController } from "./useCompositionMediaExport";

const exporters = vi.hoisted(() => ({ mp3: vi.fn(), mp4: vi.fn() }));
vi.mock("../audio/player", () => ({ exportBackingCompositionMp3: exporters.mp3 }));
vi.mock("../video/exportCompositionLyricsMp4", () => ({ exportCompositionLyricsMp4: exporters.mp4 }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const measures: readonly PlaybackMeasure[] = [{
  notes: [
    { id: "first", pitch: 64, duration: rational(2), lyric: "우리" },
    { id: "second", pitch: 67, duration: rational(2), lyric: "노래" }
  ],
  harmony: "home",
  chords: ["C", "G7"],
  measureIndex: 0
}];
const accompaniment: AccompanimentOptions = {
  styleId: "arpeggio", instrumentIds: ["acoustic_grand_piano", "clarinet"],
  meter: { beats: 4, beatUnit: 4 }, beatVolume: 72,
  trackMix: { clarinet: { volume: 55, muted: false } }
};
type Options = Parameters<typeof useCompositionMediaExport>[0];
let root: Root;
let host: HTMLDivElement;
let media: CompositionMediaExportController;
let onStatus: ReturnType<typeof vi.fn>;
let downloads: string[];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function Harness({ options }: { options: Options }) {
  media = useCompositionMediaExport(options);
  return null;
}

function mount(overrides: Partial<Options> = {}) {
  act(() => root.render(<Harness options={{
    measures, complete: true, title: "별/노래", instrumentId: "violin", bpm: 108,
    accompaniment, disabled: false, onStatus, ...overrides
  }} />));
}

async function finish(promise: Promise<void>, milliseconds = 900) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
    await promise;
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  onStatus = vi.fn();
  downloads = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push(this.download);
  });
  vi.stubGlobal("URL", class extends URL {
    static createObjectURL = vi.fn(() => "blob:composition-export");
    static revokeObjectURL = vi.fn();
  });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("작곡한 곡의 반주와 가사 영상 저장", () => {
  it("편집한 가락·가사·화음과 선택 악기·믹스를 그대로 MP4로 보내고 진행률과 파일명을 보여 준다", async () => {
    const pending = deferred<Blob | null>();
    exporters.mp4.mockReturnValue(pending.promise);
    mount();
    let job!: Promise<void>;
    act(() => { job = media.saveMp4(); });
    expect(media).toMatchObject({ exporting: true, format: "mp4", phase: "working", hasLyrics: true });
    await act(async () => { await vi.dynamicImportSettled(); });
    expect(exporters.mp4).toHaveBeenCalledOnce();
    const args = exporters.mp4.mock.calls[0];
    expect(args.slice(0, 4)).toEqual([measures, "violin", 108, accompaniment]);
    expect(args[5]).toBeInstanceOf(AbortSignal);
    expect(args[6]).toEqual({ title: "별/노래" });
    act(() => args[4](57));
    expect(media.progress).toBe(57);
    await act(async () => { pending.resolve(new Blob(["video"], { type: "video/mp4" })); });
    expect(downloads).toEqual(["별_노래-가사포함.mp4"]);
    expect(media).toMatchObject({ phase: "done", progress: 100, exporting: true });
    expect(onStatus).toHaveBeenLastCalledWith("가사 포함 MP4를 저장했어요.");
    await finish(job);
    expect(media).toMatchObject({ exporting: false, format: null, phase: "idle" });
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:composition-export");
  });

  it("한 렌더 안에서 MP3와 MP4를 연속 눌러도 한 작업만 시작하고 기존 MP3 저장을 유지한다", async () => {
    const pending = deferred<Blob | null>();
    exporters.mp3.mockReturnValue(pending.promise);
    mount({ title: " " });
    let first!: Promise<void>;
    act(() => {
      first = media.saveMp3();
      void media.saveMp3();
      void media.saveMp4();
    });
    expect(exporters.mp3).toHaveBeenCalledExactlyOnceWith(measures, "violin", 108, accompaniment);
    expect(exporters.mp4).not.toHaveBeenCalled();
    await act(async () => { pending.resolve(new Blob(["mp3"])); });
    expect(downloads).toEqual(["maeum-melody-반주음악.mp3"]);
    await finish(first);
    expect(media.exporting).toBe(false);
    expect(onStatus).toHaveBeenLastCalledWith("반주 음악 MP3를 저장했어요.");
  });

  it.each([
    { options: { complete: false }, format: "mp3", message: "모든 마디" },
    { options: { complete: false }, format: "mp4", message: "모든 마디" },
    { options: { disabled: true }, format: "mp4", message: "다른 연주나 저장" }
  ] as const)("불완전한 곡이나 다른 작업 중에는 내보내기를 시작하지 않는다: $format $message", async ({ options, format, message }) => {
    mount(options);
    await act(async () => { await (format === "mp3" ? media.saveMp3() : media.saveMp4()); });
    expect(onStatus.mock.lastCall?.[0]).toContain(message);
    expect(exporters.mp3).not.toHaveBeenCalled();
    expect(exporters.mp4).not.toHaveBeenCalled();
    expect(downloads).toEqual([]);
    expect(media.exporting).toBe(false);
  });

  it("쉼표의 가사와 공백만 있는 곡은 MP4를 막고 입력을 안내한다", async () => {
    mount({ measures: [{ harmony: "home", notes: [
      { id: "rest", pitch: null, duration: rational(2), lyric: "쉼표의 글자" },
      { id: "empty", pitch: 60, duration: rational(2), lyric: "  " }
    ] }] });
    expect(media.hasLyrics).toBe(false);
    await act(async () => { await media.saveMp4(); });
    expect(exporters.mp4).not.toHaveBeenCalled();
    expect(onStatus.mock.lastCall?.[0]).toContain("가사를 한 글자 이상 입력");
  });

  it("취소 후 늦게 완료된 영상은 다운로드하지 않고 작업이 정리된 뒤 다시 시도할 수 있다", async () => {
    const pending = deferred<Blob | null>();
    exporters.mp4.mockReturnValue(pending.promise);
    mount();
    let first!: Promise<void>;
    act(() => { first = media.saveMp4(); });
    await act(async () => { await vi.dynamicImportSettled(); });
    const signal = exporters.mp4.mock.calls[0][5] as AbortSignal;
    act(() => { media.cancel(); void media.saveMp4(); });
    expect(signal.aborted).toBe(true);
    expect(exporters.mp4).toHaveBeenCalledOnce();
    await act(async () => { pending.resolve(new Blob(["late video"])); await first; });
    expect(downloads).toEqual([]);
    expect(media.exporting).toBe(false);
    const next = deferred<Blob | null>();
    exporters.mp4.mockReturnValue(next.promise);
    let retry!: Promise<void>;
    act(() => { retry = media.saveMp4(); });
    await act(async () => { await vi.dynamicImportSettled(); });
    expect(exporters.mp4).toHaveBeenCalledTimes(2);
    await act(async () => {
      media.cancel();
      next.reject(new DOMException("취소", "AbortError"));
      await retry;
    });
    expect(media.exporting).toBe(false);
    expect(media.status).toContain("취소");
    expect(downloads).toEqual([]);
  });

  it.each([null, new Error("영상 인코더를 사용할 수 없어요.")])("실패와 다른 연주의 잠금 응답을 정리해 다운로드 없이 재시도를 허용한다: %s", async (result) => {
    exporters.mp4.mockImplementation(() => result instanceof Error ? Promise.reject(result) : Promise.resolve(result));
    mount();
    let first!: Promise<void>;
    act(() => { first = media.saveMp4(); });
    await act(async () => { await vi.dynamicImportSettled(); });
    expect(media).toMatchObject({ phase: "error", exporting: true });
    expect(downloads).toEqual([]);
    expect(media.status).toContain(result instanceof Error ? "인코더" : "다른 연주나 녹음");
    await finish(first, 1200);
    expect(media).toMatchObject({ exporting: false, phase: "idle" });
    exporters.mp3.mockResolvedValue(new Blob(["retry mp3"]));
    let retry!: Promise<void>;
    await act(async () => { retry = media.saveMp3(); });
    await finish(retry);
    expect(downloads).toEqual(["별_노래-반주음악.mp3"]);
  });

  it("화면을 떠나면 영상 작업을 취소하고 늦은 결과를 저장하거나 상태를 알리지 않는다", async () => {
    const pending = deferred<Blob | null>();
    exporters.mp4.mockReturnValue(pending.promise);
    mount();
    let job!: Promise<void>;
    act(() => { job = media.saveMp4(); });
    await act(async () => { await vi.dynamicImportSettled(); });
    const signal = exporters.mp4.mock.calls[0][5] as AbortSignal;
    const statusCount = onStatus.mock.calls.length;
    act(() => root.unmount());
    expect(signal.aborted).toBe(true);
    await act(async () => { pending.resolve(new Blob(["unmounted"])); await job; });
    expect(downloads).toEqual([]);
    expect(onStatus).toHaveBeenCalledTimes(statusCount);
  });
});

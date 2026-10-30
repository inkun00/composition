// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildRecordedMusicVideoPlan } from "../video/musicVideoRecording";
import { useRecordingFileExport, type RecordingFileExportController } from "./useRecordingFileExport";

const exporter = vi.hoisted(() => vi.fn());
vi.mock("../video/exportMusicVideoMp4", () => ({ exportMusicVideoMp4: exporter }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Options = Parameters<typeof useRecordingFileExport>[0];
let root: Root;
let host: HTMLDivElement;
let current: RecordingFileExportController;
let base: Options;
let unmounted: boolean;
let downloads: { url: string; name: string }[];

function fixture(): Options {
  const measures: Options["measures"] = [{ harmony: "home", chords: ["C"], measureIndex: 0,
    notes: [{ id: "star", pitch: 60, lyric: "별", duration: { numerator: 4, denominator: 1 } }] }];
  const accompaniment: Options["accompaniment"] = { styleId: "arpeggio", instrumentIds: ["piano"],
    meter: { beats: 4, beatUnit: 4 } };
  return { title: "별/노래", composer: "김학생", fileName: "별_노래.mp3", audioUrl: "blob:voice",
    measures, accompaniment, bpm: 120, instrumentId: "violin", complete: true, disabled: false,
    scenes: [{ id: "scene", background: "#ffffff", endLyric: null, endMeasureIndex: 0, motion: "bounce",
      elements: [{ id: "drawing", tool: "line", color: "#123456", width: 8,
        points: [[50, 50, .5], [200, 200, .5]] }] }],
    plan: buildRecordedMusicVideoPlan("별/노래", measures, 120, "violin", accompaniment, 2, 6), onStatus: vi.fn() };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

function Harness({ options }: Readonly<{ options: Options }>) {
  current = useRecordingFileExport(options);
  return null;
}

function mount(overrides: Partial<Options> = {}) {
  act(() => root.render(<Harness options={{ ...base, ...overrides }} />));
}

function show() {
  act(() => current.show());
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  base = fixture();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  unmounted = false;
  downloads = [];
  let nextUrl = 0;
  vi.stubGlobal("URL", class extends URL {
    static createObjectURL = vi.fn(() => `blob:export-${++nextUrl}`);
    static revokeObjectURL = vi.fn();
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push({ url: this.href, name: this.download });
  });
});

afterEach(() => {
  if (!unmounted) act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("녹음 후 MP3 또는 뮤직비디오 MP4 파일 선택", () => {
  it("팝업을 열고 닫거나 선택 전 저장 함수를 호출해도 파일을 만들지 않는다", async () => {
    mount();
    await act(async () => { current.saveMp3(); await current.saveMp4(); });
    show();
    expect(current.open).toBe(true);
    expect(current.videoUnavailableReason).toBeNull();
    act(() => current.close());
    expect(current.open).toBe(false);
    expect(exporter).not.toHaveBeenCalled();
    expect(downloads).toEqual([]);
  });

  it.each([{ audioUrl: "" }, { disabled: true }])("녹음이 없거나 다른 작업 중이면 팝업을 열거나 저장하지 않는다: %s", async (options) => {
    mount(options);
    show();
    await act(async () => { current.saveMp3(); await current.saveMp4(); });
    expect(current.open).toBe(false);
    expect(exporter).not.toHaveBeenCalled();
    expect(downloads).toEqual([]);
  });

  it("뮤직비디오가 없어도 최신 보정된 녹음을 MP3로 저장하고 중복 클릭을 막는다", () => {
    mount({ scenes: [], plan: null, complete: false });
    show();
    mount({ audioUrl: "blob:processed-voice", scenes: [], plan: null, complete: false });
    act(() => { current.saveMp3(); current.saveMp3(); });
    expect(downloads).toEqual([{ url: "blob:processed-voice", name: "별_노래.mp3" }]);
    expect(current.open).toBe(false);
    expect(base.onStatus).toHaveBeenLastCalledWith("녹음한 노래를 MP3 파일로 저장했어요.");
    expect(exporter).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });

  it("최신 녹음과 장면을 합치고 중복 제작과 MP3 동시 클릭을 막으며 진행 중 disabled 변경은 작업을 방해하지 않는다", async () => {
    const pending = deferred<Blob | null>();
    exporter.mockReturnValue(pending.promise);
    mount();
    show();
    mount({ audioUrl: "blob:processed-voice" });
    let job!: Promise<void>;
    act(() => {
      job = current.saveMp4();
      void current.saveMp4();
      current.saveMp3();
      current.close();
    });
    expect(exporter).toHaveBeenCalledOnce();
    expect(exporter.mock.calls[0][0]).toEqual({
      title: base.title, composer: base.composer, measures: base.measures, instrumentId: base.instrumentId,
      bpm: 120, accompaniment: base.accompaniment, scenes: base.scenes, animated: true,
      recording: { audioUrl: "blob:processed-voice", plan: base.plan }
    });
    expect(current).toMatchObject({ busy: true, open: true, progress: 0 });
    mount({ audioUrl: "blob:processed-voice", disabled: true });
    act(() => exporter.mock.calls[0][1](57));
    expect(current.progress).toBe(57);
    await act(async () => { pending.resolve(new Blob(["video"], { type: "video/mp4" })); await job; });
    expect(current).toMatchObject({ busy: false, open: false, progress: 100 });
    expect(downloads).toEqual([{ url: "blob:export-1", name: "별_노래-뮤직비디오.mp4" }]);
    expect(base.onStatus).toHaveBeenLastCalledWith("녹음한 노래를 합친 뮤직비디오 MP4를 저장했어요.");
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(60_000));
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:export-1");
  });

  it.each([
    { patch: { complete: false }, reason: "모든 마디" },
    { patch: { scenes: [] }, reason: "장면을 먼저" },
    { patch: { bpm: 96 }, reason: "곡이 바뀌었어요" },
    { patch: { plan: null }, reason: "다시 녹음" }
  ] satisfies { patch: Partial<Options>; reason: string }[])("MP4 불가 이유를 보여주고 반주로 대체하지 않는다: $reason", async ({ patch, reason }) => {
    mount(patch);
    show();
    expect(current.videoUnavailableReason).toContain(reason);
    await act(async () => { await current.saveMp4(); });
    expect(exporter).not.toHaveBeenCalled();
    expect(downloads).toEqual([]);
    expect(current.open).toBe(true);
    expect(current.status).toContain(reason);
    act(() => current.saveMp3());
    expect(downloads).toEqual([{ url: "blob:voice", name: "별_노래.mp3" }]);
  });

  it("그림 없는 장면은 합성을 막고 복사된 가사 계획도 녹음으로 신뢰하지 않는다", async () => {
    mount({ scenes: base.scenes.map((scene) => ({ ...scene, elements: [] })) });
    show();
    expect(current.videoUnavailableReason).toContain("그림을 그려");
    await act(async () => { await current.saveMp4(); });
    mount({ plan: { ...base.plan! } });
    expect(current.videoUnavailableReason).toContain("다시 녹음");
    await act(async () => { await current.saveMp4(); });
    expect(exporter).not.toHaveBeenCalled();
  });

  it("취소 뒤 늦은 결과는 버리고 팝업에서 다시 제작할 수 있다", async () => {
    const pending = deferred<Blob | null>();
    exporter.mockReturnValue(pending.promise);
    mount();
    show();
    let job!: Promise<void>;
    act(() => { job = current.saveMp4(); current.cancel(); void current.saveMp4(); });
    expect(exporter.mock.calls[0][2].aborted).toBe(true);
    expect(exporter).toHaveBeenCalledOnce();
    await act(async () => { pending.resolve(new Blob(["late"])); await job; });
    expect(current).toMatchObject({ open: true, busy: false });
    expect(current.status).toContain("취소");
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    exporter.mockResolvedValue(new Blob(["retry"]));
    await act(async () => { await current.saveMp4(); });
    expect(downloads).toHaveLength(1);
  });

  it.each([null, new Error("MP4 인코더 오류"), new DOMException("abort", "AbortError")])("실패나 취소를 알리고 팝업에서 MP3 저장으로 전환할 수 있다: %s", async (failure) => {
    exporter.mockImplementation(() => failure === null ? Promise.resolve(null) : Promise.reject(failure));
    mount();
    show();
    await act(async () => { await current.saveMp4(); });
    expect(current).toMatchObject({ open: true, busy: false });
    expect(current.status).toContain(failure instanceof DOMException ? "취소" : failure instanceof Error ? "인코더" : "다른 연주");
    expect(downloads).toEqual([]);
    act(() => current.saveMp3());
    expect(downloads).toHaveLength(1);
  });

  it.each(["audio", "plan", "score"] as const)("제작 중 %s 변경은 작업을 중단하고 늦은 결과를 저장하지 않는다", async (source) => {
    const pending = deferred<Blob | null>();
    exporter.mockReturnValue(pending.promise);
    mount();
    show();
    let job!: Promise<void>;
    act(() => { job = current.saveMp4(); });
    mount(source === "audio" ? { audioUrl: "blob:new-mix" }
      : source === "plan" ? { plan: { ...base.plan! } } : { bpm: 96 });
    expect(exporter.mock.calls[0][2].aborted).toBe(true);
    act(() => exporter.mock.calls[0][1](99));
    expect(current.progress).toBe(0);
    await act(async () => { pending.resolve(new Blob(["stale"])); await job; });
    expect(current.status).toContain("바뀌어");
    expect(current.busy).toBe(false);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(downloads).toEqual([]);
  });

  it("화면을 떠나면 중단하고 늦은 진행률·완료·상태 알림을 무시한다", async () => {
    const pending = deferred<Blob | null>();
    exporter.mockReturnValue(pending.promise);
    mount();
    show();
    let job!: Promise<void>;
    act(() => { job = current.saveMp4(); });
    const statusCalls = vi.mocked(base.onStatus).mock.calls.length;
    act(() => root.unmount());
    unmounted = true;
    expect(exporter.mock.calls[0][2].aborted).toBe(true);
    await act(async () => {
      exporter.mock.calls[0][1](90);
      pending.resolve(new Blob(["unmounted"]));
      await job;
    });
    expect(base.onStatus).toHaveBeenCalledTimes(statusCalls);
    expect(downloads).toEqual([]);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("생성한 다운로드 URL만 화면 종료 때 해제하고 원본 녹음 URL은 해제하지 않는다", async () => {
    exporter.mockResolvedValue(new Blob(["video"]));
    mount();
    show();
    await act(async () => { await current.saveMp4(); });
    act(() => root.unmount());
    unmounted = true;
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:export-1");
    act(() => vi.advanceTimersByTime(60_000));
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });
});

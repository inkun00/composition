import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlaybackMeasure } from "../audio/accompanimentScore";
import { buildPracticeTimeline } from "../practice/practiceAudioTimeline";
import type { PracticeAudioInput } from "../practice/practiceAudioTypes";
import type { PracticeVideoPlan } from "../practice/practiceVideoTypes";
import type { LyricMp4Options } from "../video/exportLyricMp4";
import { createTextbookVideo, downloadTextbookBlob, downloadTextbookScore, textbookFileName } from "./textbookExport";

const mocks = vi.hoisted(() => ({
  capture: vi.fn(), renderAudio: vi.fn(), prepareRenderer: vi.fn(), encode: vi.fn(), exclusive: vi.fn()
}));
vi.mock("html2canvas", () => ({ default: mocks.capture }));
vi.mock("../audio/player", () => ({ runExclusiveAudioExport: mocks.exclusive }));
vi.mock("../practice/practiceAudio", () => ({ renderPracticeAudio: mocks.renderAudio }));
vi.mock("../practice/practiceVideoRenderer", () => ({ preparePracticeVideoRenderer: mocks.prepareRenderer }));
vi.mock("../video/exportLyricMp4", () => ({ exportLyricMp4: mocks.encode }));

const measures: readonly PlaybackMeasure[] = [0, 1].map((bar) => ({
  harmony: "home", chords: ["C"], notes: [0, 1, 2, 3].map((index) => ({
    id: `${bar}-${index}`, pitch: index === 2 ? null : 60 + index,
    duration: { numerator: 1, denominator: 1 }, lyric: ["건", "강", "", "밥"][index]
  }))
}));
const mp4 = new Blob(["video"], { type: "video/mp4" });
let sheet: HTMLDivElement;
let createUrl: ReturnType<typeof vi.fn>;
let revokeUrl: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 1; });
  createUrl = vi.fn(() => "blob:score");
  revokeUrl = vi.fn();
  vi.stubGlobal("URL", { createObjectURL: createUrl, revokeObjectURL: revokeUrl });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  sheet = document.createElement("div");
  document.body.append(sheet);
  vi.spyOn(sheet, "getBoundingClientRect").mockReturnValue(new DOMRect(-10000, 0, 960, 720));
  mocks.capture.mockResolvedValue({ toBlob: (callback: BlobCallback) => callback(new Blob(["png"], { type: "image/png" })) });
  mocks.exclusive.mockImplementation((action: () => Promise<Blob>) => action());
  mocks.renderAudio.mockImplementation(async (input: PracticeAudioInput, options) => {
    options.onProgress(5);
    options.onProgress(100);
    const timeline = buildPracticeTimeline(input);
    return { timeline, buffer: { duration: timeline.durationSeconds }, usedFallback: false };
  });
  mocks.prepareRenderer.mockResolvedValue({ canvas: document.createElement("canvas"), draw: vi.fn() });
  mocks.encode.mockImplementation(async (_audio, _plan, progress) => {
    progress(2);
    progress(100);
    return mp4;
  });
});

afterEach(() => {
  sheet.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("교과서 완성 악보 PNG", () => {
  it("captures the full offscreen sheet at double resolution and releases its download URL", async () => {
    let downloaded = "";
    vi.mocked(HTMLAnchorElement.prototype.click).mockImplementation(function (this: HTMLAnchorElement) {
      expect(document.body.contains(this)).toBe(true);
      downloaded = this.download;
    });
    await downloadTextbookScore(sheet, "별/빛:* 작곡가");
    expect(mocks.capture).toHaveBeenCalledWith(sheet, expect.objectContaining({
      width: 960, height: 720, scale: 2, backgroundColor: "#ffffff", windowWidth: 1200
    }));
    expect(downloaded).toBe("건강 비빔밥-별빛 작곡가.png");
    expect(createUrl.mock.calls[0][0]).toMatchObject({ type: "image/png" });
    expect(document.querySelector("a[download]")).toBeNull();
    expect(revokeUrl).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(revokeUrl).toHaveBeenCalledExactlyOnceWith("blob:score");
  });

  it("waits for actual score rendering before taking the image", async () => {
    sheet.innerHTML = '<div data-vex-score="true" data-vex-ready="false"></div>';
    const pending = downloadTextbookScore(sheet, "나");
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.capture).not.toHaveBeenCalled();
    (sheet.firstElementChild as HTMLElement).dataset.vexReady = "true";
    await vi.advanceTimersByTimeAsync(50);
    await pending;
    expect(mocks.capture).toHaveBeenCalledOnce();
  });

  it("reports an unfinished renderer instead of saving an empty score", async () => {
    sheet.innerHTML = '<div data-vex-score="true" data-vex-ready="false"></div>';
    const assertion = expect(downloadTextbookScore(sheet, "나")).rejects.toThrow("악보를 그리는 중");
    await vi.advanceTimersByTimeAsync(4100);
    await assertion;
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it("does not create a download for a failed canvas and sanitizes both output formats", async () => {
    mocks.capture.mockResolvedValueOnce({ toBlob: (callback: BlobCallback) => callback(null) });
    await expect(downloadTextbookScore(sheet, "나")).rejects.toThrow("이미지를 만들지 못했어요");
    expect(createUrl).not.toHaveBeenCalled();
    expect(textbookFileName(' ... /\\:*?"<>| ', "mp4")).toBe("건강 비빔밥-나의 작품.mp4");
  });

  it("does not download after a canceled image capture eventually finishes", async () => {
    const controller = new AbortController();
    mocks.capture.mockImplementationOnce(async () => {
      controller.abort();
      return { toBlob: vi.fn() };
    });
    await expect(downloadTextbookScore(sheet, "나", controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(createUrl).not.toHaveBeenCalled();
  });

  it("shares the same temporary download cleanup for MP4 files", async () => {
    downloadTextbookBlob(mp4, "건강 비빔밥-우리 반.mp4");
    expect(createUrl).toHaveBeenCalledWith(mp4);
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
    expect(document.querySelector("a[download]")).toBeNull();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(revokeUrl).toHaveBeenCalledExactlyOnceWith("blob:score");
  });
});

describe("교과서 악보 MP4", () => {
  it("uses original melody-only PCM with exact note timing, lyrics, title and creator", async () => {
    const progress = vi.fn();
    const signal = new AbortController().signal;
    expect(await createTextbookVideo(measures, "우리 반", 120, progress, signal)).toBe(mp4);
    const input = mocks.renderAudio.mock.calls[0][0] as PracticeAudioInput;
    expect(input).toMatchObject({ title: "건강 비빔밥", bpm: 120, mode: "melody", step: "melody", melodyInstrumentId: "piano", meter: { beats: 4, beatUnit: 4 } });
    expect(input.measures).toEqual(measures.map(({ notes }) => ({ notes })));
    expect(input.measures[0].notes[0]).not.toBe(measures[0].notes[0]);
    const scorePlan = mocks.prepareRenderer.mock.calls[0][0] as PracticeVideoPlan;
    expect(scorePlan.durationSeconds).toBe(4);
    expect(scorePlan.tracks).toHaveLength(1);
    expect(scorePlan.measures[0].tracks[0][0]).toMatchObject({ startSeconds: 0, endSeconds: .5, note: { lyric: "건", pitch: 60 } });
    expect(scorePlan.measures.at(-1)?.endSeconds).toBe(4);
    expect(mocks.encode.mock.calls[0][0]).toBe((await mocks.renderAudio.mock.results[0].value).buffer);
    expect(mocks.encode.mock.calls[0][1].frames[0]).toMatchObject({ startSeconds: 0, endSeconds: .5, measureIndex: 0 });
    const options = mocks.encode.mock.calls[0][4] as LyricMp4Options;
    const context = { fillRect: vi.fn(), drawImage: vi.fn(), fillText: vi.fn() } as unknown as CanvasRenderingContext2D;
    options.drawFrame!(context, mocks.encode.mock.calls[0][1].frames[0], 0);
    expect(context.fillText).toHaveBeenCalledWith("건강 비빔밥", 640, 83, 1160);
    expect(context.fillText).toHaveBeenCalledWith("우리 반 작곡", 640, 139, 1160);
    expect(context.fillText).toHaveBeenCalledWith("1–2 / 2마디", 640, 590);
    const values = progress.mock.calls.map(([value]) => value as number);
    expect(values[0]).toBe(0);
    expect(values.at(-1)).toBe(100);
    expect(values.every((value, index) => index === 0 || value >= values[index - 1])).toBe(true);
  });

  it("rejects an already canceled request before rendering", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(createTextbookVideo(measures, "나", 120, vi.fn(), controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(mocks.renderAudio).not.toHaveBeenCalled();
  });

  it("keeps eighth notes, dotted durations and a final rest on the original beat timeline", async () => {
    const score: readonly PlaybackMeasure[] = [{ harmony: "home", notes: [
      { id: "eighth", pitch: 64, duration: { numerator: 1, denominator: 2 }, lyric: "좋" },
      { id: "dotted", pitch: 67, duration: { numerator: 3, denominator: 2 }, dotted: true, lyric: "고" },
      { id: "ending-rest", pitch: null, duration: { numerator: 2, denominator: 1 } }
    ] }];
    await createTextbookVideo(score, "나", 120, vi.fn(), new AbortController().signal);
    const plan = mocks.prepareRenderer.mock.calls[0][0] as PracticeVideoPlan;
    expect(plan.durationSeconds).toBe(2);
    expect(plan.measures[0].tracks[0].map(({ startSeconds, endSeconds, rest, note }) => ({
      startSeconds, endSeconds, rest, pitch: note.pitch, dotted: note.dotted
    }))).toEqual([
      { startSeconds: 0, endSeconds: .25, rest: false, pitch: 64, dotted: undefined },
      { startSeconds: .25, endSeconds: 1, rest: false, pitch: 67, dotted: true },
      { startSeconds: 1, endSeconds: 2, rest: true, pitch: null, dotted: undefined }
    ]);
    expect(mocks.encode.mock.calls[0][1].frames.at(-1).endSeconds).toBe(2);
  });

  it("does not encode if the user cancels while audio is rendering", async () => {
    const controller = new AbortController();
    mocks.renderAudio.mockImplementationOnce(async () => { controller.abort(); return {}; });
    await expect(createTextbookVideo(measures, "나", 120, vi.fn(), controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(mocks.prepareRenderer).not.toHaveBeenCalled();
    expect(mocks.encode).not.toHaveBeenCalled();
  });

  it("reports a busy playback owner and propagates encoding failure", async () => {
    mocks.exclusive.mockResolvedValueOnce(null);
    const signal = new AbortController().signal;
    await expect(createTextbookVideo(measures, "나", 120, vi.fn(), signal)).rejects.toThrow("다른 연주");
    expect(mocks.renderAudio).not.toHaveBeenCalled();
    mocks.encode.mockRejectedValueOnce(new Error("MP4 codec unavailable"));
    await expect(createTextbookVideo(measures, "나", 120, vi.fn(), signal)).rejects.toThrow("MP4 codec unavailable");
  });
});

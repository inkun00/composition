// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rational } from "../music/rational";
import { buildPracticeAudioPlan } from "./practiceAudioTimeline";
import type { PracticeAudioInput, PracticeRenderedAudio } from "./practiceAudioTypes";
import { exportPracticeVideoMp4 } from "./exportPracticeVideoMp4";

const mocks = vi.hoisted(() => ({
  audioAdd: vi.fn(), videoAdd: vi.fn(), prepare: vi.fn(), draw: vi.fn(),
  videoSupported: vi.fn(), audioSupported: vi.fn(), start: vi.fn(), finalize: vi.fn(), cancel: vi.fn()
}));
vi.mock("./practiceVideoRenderer", () => ({ preparePracticeVideoRenderer: mocks.prepare }));
vi.mock("mediabunny", () => ({
  AudioBufferSource: class { add = mocks.audioAdd; },
  CanvasSource: class { add = mocks.videoAdd; },
  BufferTarget: class { buffer: ArrayBuffer | null = null; },
  Mp4OutputFormat: class {},
  Quality: class { constructor(readonly options: unknown) {} },
  canEncodeVideo: mocks.videoSupported,
  canEncodeAudio: mocks.audioSupported,
  Output: class {
    state = "pending";
    target: { buffer: ArrayBuffer | null };
    constructor(options: { target: { buffer: ArrayBuffer | null } }) { this.target = options.target; }
    addVideoTrack() {}
    addAudioTrack() {}
    async start() { this.state = "started"; await mocks.start(); }
    async finalize() {
      await mocks.finalize();
      this.state = "finalized";
      this.target.buffer = new ArrayBuffer(32);
    }
    async cancel() { this.state = "canceled"; await mocks.cancel(); }
  }
}));

const input: PracticeAudioInput = {
  measures: [{ notes: [
    { id: "tone", pitch: 60, duration: rational(1, 2) },
    { id: "rest", pitch: null, duration: rational(1, 2) }
  ] }],
  bpm: 120,
  melodyInstrumentId: "flute",
  rhythmInstrumentId: "beat:woodblock",
  step: "rhythm",
  title: "가사 없는 리듬"
};
const rendered: PracticeRenderedAudio = {
  buffer: { duration: 0.5, numberOfChannels: 2, sampleRate: 44100 } as AudioBuffer,
  timeline: { durationSeconds: 0.5, events: [
    { noteId: "tone", pitch: 72, startSeconds: 0, endSeconds: 0.25, linkToNext: false },
    { noteId: "rest", pitch: null, startSeconds: 0.25, endSeconds: 0.5, linkToNext: false }
  ] },
  usedFallback: false
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.videoSupported.mockResolvedValue(true);
  mocks.audioSupported.mockResolvedValue(true);
  mocks.prepare.mockResolvedValue({ canvas: {}, draw: mocks.draw });
  mocks.videoAdd.mockResolvedValue(undefined);
  mocks.audioAdd.mockResolvedValue(undefined);
  mocks.start.mockResolvedValue(undefined);
  mocks.finalize.mockResolvedValue(undefined);
  mocks.cancel.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllGlobals());

describe("리듬·가락 MP4 인코딩", () => {
  it("가사 없이도 기존 오디오 버퍼를 직접 인코딩하고 쉼표 끝까지 막대 화면을 만든다", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const progress = vi.fn();
    const blob = await exportPracticeVideoMp4(rendered, input, { onProgress: progress });
    expect(blob.type).toBe("video/mp4");
    expect(blob.size).toBe(32);
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.audioAdd).toHaveBeenCalledExactlyOnceWith(rendered.buffer);
    expect(mocks.prepare.mock.calls[0][1]).toBe("bars");
    expect(mocks.videoAdd.mock.calls[0][0]).toBe(0);
    expect(mocks.videoAdd.mock.calls.some((args) => args[0] === 0.25)).toBe(true);
    const last = mocks.videoAdd.mock.calls.at(-1)!;
    expect(last[0] + last[1]).toBe(0.5);
    expect(mocks.draw.mock.calls.map((args) => args[0])).toEqual(mocks.videoAdd.mock.calls.map((args) => args[0]));
    expect(progress).toHaveBeenLastCalledWith(100);
    expect(mocks.finalize).toHaveBeenCalledOnce();
  });

  it("선택한 악보 모드를 같은 화면 렌더러에 전달한다", async () => {
    await exportPracticeVideoMp4(rendered, { ...input, videoMode: "score" });
    expect(mocks.prepare.mock.calls[0][1]).toBe("score");
    expect(mocks.prepare.mock.calls[0][0].measures[0].tracks[0][0].note.pitch).toBe(60);
  });

  it("가사만 보이는 MP4도 같은 음악 버퍼와 가사 시간표를 함께 인코딩한다", async () => {
    const settings = { ...input, videoMode: "lyrics" as const,
      measures: [{ notes: [{ ...input.measures[0].notes[0], lyric: "봄" }, input.measures[0].notes[1]] }]
    };
    await exportPracticeVideoMp4(rendered, settings);
    const [plan, mode] = mocks.prepare.mock.calls[0];
    expect(mode).toBe("lyrics");
    expect(plan.measures[0].tracks[0][0]).toMatchObject({
      note: { lyric: "봄" }, startSeconds: 0, endSeconds: 0.25
    });
    expect(mocks.audioAdd).toHaveBeenCalledExactlyOnceWith(rendered.buffer);
    expect(mocks.videoAdd.mock.calls.at(-1)?.slice(0, 2)).toEqual([expect.any(Number), expect.any(Number)]);
    expect(mocks.finalize).toHaveBeenCalledOnce();
  });

  it.each(["bars", "score", "lyrics"] as const)("%s MP4에는 저장된 하단 리듬 악보를 넣지 않고 가락만 인코딩한다", async (videoMode) => {
    const settings: PracticeAudioInput = {
      ...input, mode: "rhythm-melody", step: "melody", videoMode,
      rhythmLayers: ["beat:shaker", "beat:kick"].map((instrumentId, index) => ({
        id: `rhythm-${index}`, instrumentId,
        measures: [{ notes: [{ id: `drum-${index}`, pitch: 60, duration: rational(4), lyric: "둥" }] }]
      }))
    };
    const audio = buildPracticeAudioPlan(settings);
    const melodyAudio: PracticeRenderedAudio = { ...rendered, timeline: audio.timeline, layerTimelines: [] };
    await exportPracticeVideoMp4(melodyAudio, settings);

    const [video, selectedMode] = mocks.prepare.mock.calls[0];
    expect(selectedMode).toBe(videoMode);
    expect(video.tracks.map(({ id, rhythm }: { id: string; rhythm: boolean }) => ({ id, rhythm })))
      .toEqual([{ id: "main", rhythm: false }]);
    expect(video.measures.every((measure: { tracks: unknown[] }) => measure.tracks.length === 1)).toBe(true);
    expect(video.durationSeconds).toBe(0.5);
    expect(mocks.audioAdd).toHaveBeenCalledExactlyOnceWith(melodyAudio.buffer);
    expect(settings.rhythmLayers).toHaveLength(2);
    expect(settings.rhythmLayers?.[0].measures[0].notes[0].lyric).toBe("둥");
  });

  it("지원되지 않는 코덱은 화면이나 출력 작업을 시작하지 않는다", async () => {
    mocks.audioSupported.mockResolvedValue(false);
    await expect(exportPracticeVideoMp4(rendered, input)).rejects.toThrow("MP4 만들기를 지원하지");
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("미리 취소된 내보내기는 진행률도 인코더도 시작하지 않는다", async () => {
    const controller = new AbortController();
    controller.abort();
    const progress = vi.fn();
    await expect(exportPracticeVideoMp4(rendered, input, { signal: controller.signal, onProgress: progress }))
      .rejects.toMatchObject({ name: "AbortError" });
    expect(progress).not.toHaveBeenCalled();
    expect(mocks.videoSupported).not.toHaveBeenCalled();
  });

  it("프레임 처리 중 취소되면 출력을 정리하고 부분 파일을 반환하지 않는다", async () => {
    const controller = new AbortController();
    mocks.videoAdd.mockImplementation(async () => controller.abort());
    await expect(exportPracticeVideoMp4(rendered, input, { signal: controller.signal }))
      .rejects.toMatchObject({ name: "AbortError" });
    expect(mocks.cancel).toHaveBeenCalledOnce();
    expect(mocks.finalize).not.toHaveBeenCalled();
  });

  it("인코더 오류도 정리하고 원래 오류를 전달한다", async () => {
    mocks.videoAdd.mockRejectedValue(new Error("encode failed"));
    await expect(exportPracticeVideoMp4(rendered, input)).rejects.toThrow("encode failed");
    expect(mocks.cancel).toHaveBeenCalledOnce();
  });
});

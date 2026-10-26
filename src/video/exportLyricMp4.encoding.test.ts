import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportLyricMp4 } from "./exportLyricMp4";
import { buildLyricVideoPlan } from "./lyricVideoPlan";

const { addAudio, addVideo, start, finalize, cancel, canEncodeAudio, canEncodeVideo } = vi.hoisted(() => ({
  addAudio: vi.fn(), addVideo: vi.fn(), start: vi.fn(), finalize: vi.fn(), cancel: vi.fn(),
  canEncodeAudio: vi.fn(), canEncodeVideo: vi.fn()
}));
vi.mock("mediabunny", () => ({
  AudioBufferSource: class { add = addAudio; },
  CanvasSource: class { add = addVideo; },
  BufferTarget: class {},
  Mp4OutputFormat: class {},
  Quality: class {},
  Output: class {
    state = "pending";
    target = { buffer: new ArrayBuffer(16) };
    addAudioTrack = vi.fn();
    addVideoTrack = vi.fn();
    start = async () => { start(); this.state = "started"; };
    finalize = async () => { finalize(); this.state = "finalized"; };
    cancel = async () => { cancel(); this.state = "canceled"; };
  },
  canEncodeAudio,
  canEncodeVideo
}));

const audioBuffer = { duration: 3, sampleRate: 44100, numberOfChannels: 2 } as AudioBuffer;
const plan = buildLyricVideoPlan("노래", [{ notes: [
  { id: "a", pitch: 60, lyric: "안", duration: { numerator: 1, denominator: 1 } },
  { id: "b", pitch: 62, lyric: "녕", duration: { numerator: 1, denominator: 1 } }
] }], 120, 1, 3);
const context = {
  fillRect: vi.fn(), fillText: vi.fn(), measureText: vi.fn(() => ({ width: 50 }))
};

beforeEach(() => {
  vi.clearAllMocks();
  canEncodeAudio.mockResolvedValue(true);
  canEncodeVideo.mockResolvedValue(true);
  addAudio.mockResolvedValue(undefined);
  addVideo.mockResolvedValue(undefined);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 1; });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("가사 MP4 오디오 입력과 인코딩", () => {
  it("PCM 버퍼는 파일 재압축·디코딩 없이 AAC 인코더에 바로 전달한다", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const progress = vi.fn();
    const result = await exportLyricMp4(audioBuffer, plan, progress);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(addAudio).toHaveBeenCalledWith(audioBuffer);
    expect(canEncodeAudio).toHaveBeenCalledWith("aac", expect.objectContaining({ sampleRate: 44100, numberOfChannels: 2 }));
    expect(addVideo.mock.calls.map(([startSeconds, duration]) => [startSeconds, duration])).toEqual([
      [0, 1], [1, .5], [1.5, .5], [2, 1]
    ]);
    expect(result.type).toBe("video/mp4");
    expect(result.size).toBeGreaterThan(0);
    expect(progress).toHaveBeenLastCalledWith(100);
  });

  it("기존 녹음 URL 입력도 디코딩해서 같은 영상 렌더러를 이용한다", async () => {
    const decodeAudioData = vi.fn(async () => audioBuffer);
    const close = vi.fn(async () => undefined);
    vi.stubGlobal("AudioContext", class { decodeAudioData = decodeAudioData; close = close; });
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true, arrayBuffer: async () => new ArrayBuffer(4)
    } as Response);

    await exportLyricMp4("blob:recording", plan, vi.fn());
    expect(decodeAudioData).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(addAudio).toHaveBeenCalledWith(audioBuffer);
  });

  it("움직이는 장면을 24fps로 나누어도 가사 경계와 오디오 길이가 일치한다", async () => {
    const drawFrame = vi.fn();
    await exportLyricMp4(audioBuffer, plan, vi.fn(), undefined, { frameRate: 24, drawFrame });
    expect(canEncodeVideo).toHaveBeenCalledWith("avc", expect.objectContaining({ frameRate: 24 }));
    expect(addVideo).toHaveBeenCalledTimes(72);
    const segments = addVideo.mock.calls.map(([startSeconds, duration]) => [startSeconds, duration] as number[]);
    expect(segments[0][0]).toBe(0);
    expect(segments.at(-1)![0] + segments.at(-1)![1]).toBe(3);
    expect(segments.reduce((sum, [, duration]) => sum + duration, 0)).toBeCloseTo(3, 8);
    expect(segments.every(([startSeconds, duration], index) =>
      duration > 0 && (index === 0 || Math.abs(startSeconds - segments[index - 1][0] - segments[index - 1][1]) < 1e-8)))
      .toBe(true);
    expect(drawFrame.mock.calls[24][1]).toMatchObject({ startSeconds: 1, activeSyllable: 0 });
    expect(drawFrame.mock.calls[36][1]).toMatchObject({ startSeconds: 1.5, activeSyllable: 1 });
    expect(drawFrame.mock.calls.map((call) => call[2])).toEqual(segments.map(([startSeconds]) => startSeconds));
  });

  it("지원하지 않는 브라우저는 출력 생성을 시작하기 전에 안내한다", async () => {
    canEncodeAudio.mockResolvedValueOnce(false);
    await expect(exportLyricMp4(audioBuffer, plan, vi.fn())).rejects.toThrow("최신 크롬이나 엣지");
    expect(start).not.toHaveBeenCalled();
  });

  it("영상 생성 중 취소하면 미완성 출력을 정리한다", async () => {
    const controller = new AbortController();
    addVideo.mockImplementationOnce(async () => { controller.abort(); });
    await expect(exportLyricMp4(audioBuffer, plan, vi.fn(), controller.signal))
      .rejects.toMatchObject({ name: "AbortError" });
    expect(cancel).toHaveBeenCalledOnce();
    expect(finalize).not.toHaveBeenCalled();
  });

  it("인코더 오류가 나도 출력을 취소하고 원인을 전달한다", async () => {
    addAudio.mockRejectedValueOnce(new Error("AAC encoding failed"));
    await expect(exportLyricMp4(audioBuffer, plan, vi.fn())).rejects.toThrow("AAC encoding failed");
    expect(cancel).toHaveBeenCalledOnce();
  });
});

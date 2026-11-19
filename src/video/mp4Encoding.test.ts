import { beforeEach, describe, expect, it, vi } from "vitest";

const { audioSupported, videoSupported, registerAac } = vi.hoisted(() => ({
  audioSupported: vi.fn(), videoSupported: vi.fn(), registerAac: vi.fn()
}));
vi.mock("mediabunny", () => ({
  canEncodeAudio: audioSupported,
  canEncodeVideo: videoSupported,
  Quality: class { constructor(readonly options: { bitrate: number }) {} }
}));
vi.mock("@mediabunny/aac-encoder", () => ({ registerAacEncoder: registerAac }));

const request = { width: 1280, height: 720, frameRate: 24, videoBitrate: 1_200_000,
  audioBuffer: { numberOfChannels: 2, sampleRate: 44100 } };

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  audioSupported.mockReset().mockResolvedValue(true);
  videoSupported.mockReset().mockResolvedValue(true);
  registerAac.mockReset();
});

describe("MP4 encoder capability resolution", () => {
  it("keeps the original settings when native H.264 and exact PCM AAC are available", async () => {
    const { resolveMp4Encoding } = await import("./mp4Encoding");
    const result = await resolveMp4Encoding(request);
    expect(result).toMatchObject({ width: 1280, height: 720, videoConfig: { codec: "avc" }, audioConfig: { codec: "aac" } });
    expect(videoSupported).toHaveBeenCalledOnce();
    expect(videoSupported).toHaveBeenCalledWith("avc", expect.objectContaining({ width: 1280, height: 720, frameRate: 24 }));
    expect(audioSupported).toHaveBeenCalledWith("aac", expect.objectContaining({ sampleRate: 44100, numberOfChannels: 2 }));
    expect(registerAac).not.toHaveBeenCalled();
  });

  it("uses the exact tested baseline software configuration if High Profile is unavailable", async () => {
    const { resolveMp4Encoding } = await import("./mp4Encoding");
    videoSupported.mockResolvedValueOnce(false);
    const result = await resolveMp4Encoding(request);
    expect(result.videoConfig).toMatchObject({ fullCodecString: "avc1.42001f", hardwareAcceleration: "prefer-software" });
    expect(videoSupported.mock.calls[1][1]).toMatchObject({ ...result.videoConfig, width: result.width, height: result.height });
    expect(result.width).toBe(1280);
  });

  it("accepts baseline with native acceleration when software baseline is unavailable", async () => {
    const { resolveMp4Encoding } = await import("./mp4Encoding");
    videoSupported.mockResolvedValueOnce(false).mockResolvedValueOnce(false);
    const result = await resolveMp4Encoding(request);
    expect(result.width).toBe(1280);
    expect(result.videoConfig).toMatchObject({ fullCodecString: "avc1.42001f", hardwareAcceleration: "no-preference" });
  });

  it("returns a lower-resolution canvas size only when the original size fails every profile probe", async () => {
    const { resolveMp4Encoding } = await import("./mp4Encoding");
    videoSupported.mockResolvedValueOnce(false).mockResolvedValueOnce(false).mockResolvedValueOnce(false);
    const result = await resolveMp4Encoding(request);
    expect(result).toMatchObject({ width: 854, height: 480 });
    expect(videoSupported.mock.calls[3][1]).toMatchObject({ width: 854, height: 480, frameRate: 24,
      fullCodecString: "avc1.42001f", hardwareAcceleration: "prefer-software" });
    expect(result.videoConfig.quality).toMatchObject({ options: { bitrate: 900_000 } });
  });

  it("also tries native acceleration for lower-resolution baseline before rejecting H.264", async () => {
    const { resolveMp4Encoding } = await import("./mp4Encoding");
    videoSupported.mockResolvedValue(false).mockResolvedValueOnce(false).mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const result = await resolveMp4Encoding(request);
    expect(result).toMatchObject({ width: 854, height: 480,
      videoConfig: { fullCodecString: "avc1.42001f", hardwareAcceleration: "no-preference" } });
  });

  it("registers the shared AAC fallback once and reprobes each exact audio configuration", async () => {
    const { resolveMp4Encoding } = await import("./mp4Encoding");
    let registered = false;
    registerAac.mockImplementation(() => { registered = true; });
    audioSupported.mockImplementation(async () => registered);
    const [, second] = await Promise.all([
      resolveMp4Encoding(request),
      resolveMp4Encoding({ ...request, audioBuffer: { sampleRate: 48000, numberOfChannels: 6 } })
    ]);
    expect(registerAac).toHaveBeenCalledOnce();
    expect(audioSupported).toHaveBeenCalledTimes(4);
    expect(audioSupported.mock.calls.map((call) => [call[1].sampleRate, call[1].numberOfChannels]))
      .toEqual(expect.arrayContaining([[44100, 2], [48000, 2]]));
    expect(second.audioConfig.codec).toBe("aac");
    expect(second.audioConfig.transform?.numberOfChannels).toBe(2);
  });

  it("retries a failed fallback load on the next export and preserves its diagnostic cause", async () => {
    const { resolveMp4Encoding } = await import("./mp4Encoding");
    const staleImport = new TypeError("Failed to fetch dynamically imported module");
    audioSupported.mockResolvedValue(false);
    registerAac.mockImplementationOnce(() => { throw staleImport; });
    await expect(resolveMp4Encoding(request)).rejects.toMatchObject({
      message: expect.stringContaining("AAC"), cause: staleImport
    });
    registerAac.mockImplementation(() => { audioSupported.mockResolvedValue(true); });
    expect((await resolveMp4Encoding(request)).audioConfig.codec).toBe("aac");
    expect(registerAac).toHaveBeenCalledTimes(2);
  });

  it("reports a targeted H.264 failure without pretending a different container is MP4", async () => {
    const { resolveMp4Encoding } = await import("./mp4Encoding");
    videoSupported.mockResolvedValue(false);
    await expect(resolveMp4Encoding(request)).rejects.toThrow("MP4 영상(H.264)");
    expect(audioSupported).not.toHaveBeenCalled();
    expect(registerAac).not.toHaveBeenCalled();
  });

  it("reports AAC support failure separately after the software encoder also rejects the PCM format", async () => {
    const { resolveMp4Encoding } = await import("./mp4Encoding");
    audioSupported.mockResolvedValue(false);
    await expect(resolveMp4Encoding(request)).rejects.toThrow("MP4 소리(AAC)");
    expect(registerAac).toHaveBeenCalledOnce();
    expect(audioSupported).toHaveBeenCalledTimes(2);
  });

  it("prioritizes cancellation over codec errors and does not probe an already canceled export", async () => {
    const { resolveMp4Encoding } = await import("./mp4Encoding");
    const controller = new AbortController();
    controller.abort();
    await expect(resolveMp4Encoding({ ...request, signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(videoSupported).not.toHaveBeenCalled();

    const duringLoad = new AbortController();
    audioSupported.mockResolvedValue(false);
    registerAac.mockImplementation(() => { duringLoad.abort(); throw new Error("network"); });
    await expect(resolveMp4Encoding({ ...request, signal: duringLoad.signal })).rejects.toMatchObject({ name: "AbortError" });
  });
});

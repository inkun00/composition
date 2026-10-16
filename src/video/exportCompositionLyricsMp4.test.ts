import { beforeEach, describe, expect, it, vi } from "vitest";
import { runExclusiveAudioExport } from "../audio/player";
import type { AccompanimentOptions, PlaybackMeasure } from "../audio/accompanimentScore";
import { exportCompositionLyricsMp4 } from "./exportCompositionLyricsMp4";
import type { LyricVideoPlan } from "./lyricVideoPlan";

const { renderAudio, encodeVideo } = vi.hoisted(() => ({
  renderAudio: vi.fn(),
  encodeVideo: vi.fn()
}));

vi.mock("../audio/backingExport", () => ({
  renderOfflineBackingAudio: renderAudio,
  renderOfflineBackingMp3: vi.fn(),
  renderRealtimeBackingMp3: vi.fn()
}));
vi.mock("./exportLyricMp4", () => ({ exportLyricMp4: encodeVideo }));

const measures: readonly PlaybackMeasure[] = Array.from({ length: 2 }, (_, measureIndex) => ({
  harmony: "home",
  chords: ["C"],
  notes: Array.from({ length: 4 }, (_, index) => ({
    id: `${measureIndex}-${index}`,
    pitch: 60 + index,
    duration: { numerator: 1, denominator: 1 },
    lyric: ["나", "의", "노", "래"][index]
  }))
}));
const accompaniment: AccompanimentOptions = {
  styleId: "children_song",
  instrumentIds: ["bright_acoustic_piano", "acoustic_bass", "clarinet", "recorder"],
  trackMix: { clarinet: { volume: 75, muted: false } },
  meter: { beats: 4, beatUnit: 4 }
};
const audioBuffer = { duration: 20.88 } as AudioBuffer;
const mp4 = new Blob(["mp4"], { type: "video/mp4" });

beforeEach(() => {
  vi.clearAllMocks();
  renderAudio.mockResolvedValue({ audioBuffer, introSeconds: 8.08 });
  encodeVideo.mockImplementation(async (_audio, _plan, onProgress) => {
    onProgress(2);
    onProgress(100);
    return mp4;
  });
});

describe("작곡한 노래의 가사 포함 MP4", () => {
  it("선택한 반주 설정과 원본 PCM으로 전주 뒤부터 음표별 가사를 맞춘다", async () => {
    const progress = vi.fn();
    const controller = new AbortController();
    const result = await exportCompositionLyricsMp4(measures, "flute", 120, accompaniment,
      progress, controller.signal, { title: "우리의 노래" });

    expect(result).toBe(mp4);
    expect(renderAudio).toHaveBeenCalledWith(measures, "flute", 120, accompaniment, controller.signal);
    expect(encodeVideo.mock.calls[0][0]).toBe(audioBuffer);
    const plan = encodeVideo.mock.calls[0][1] as LyricVideoPlan;
    expect(plan.title).toBe("우리의 노래");
    expect(plan.frames[0]).toMatchObject({ startSeconds: 0, endSeconds: 8.08, syllables: [] });
    expect(plan.frames[1]).toMatchObject({ startSeconds: 8.08, endSeconds: 8.58, activeSyllable: 0 });
    expect(plan.frames[5]).toMatchObject({ startSeconds: 10.08, measureIndex: 1, activeSyllable: 0 });
    expect(plan.frames.at(-1)).toMatchObject({ startSeconds: 12.08, endSeconds: 20.88, syllables: [] });
    const values = progress.mock.calls.map(([value]) => value as number);
    expect(values[0]).toBe(2);
    expect(values.at(-1)).toBe(100);
    expect(values.every((value, index) => index === 0 || value >= values[index - 1])).toBe(true);
  });

  it("빈 가사와 쉼표에 적힌 가사만 있는 곡은 오디오 렌더 전에 안내한다", async () => {
    const invalid: readonly PlaybackMeasure[] = [{ harmony: "home", notes: [
      { id: "a", pitch: 60, duration: { numerator: 1, denominator: 1 }, lyric: "  " },
      { id: "b", pitch: null, duration: { numerator: 1, denominator: 1 }, lyric: "쉼" }
    ] }];
    await expect(exportCompositionLyricsMp4(invalid)).rejects.toThrow("가사를 한 글자 이상");
    expect(renderAudio).not.toHaveBeenCalled();
    expect(encodeVideo).not.toHaveBeenCalled();
  });

  it("이미 취소된 요청은 작업을 시작하지 않는다", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(exportCompositionLyricsMp4(measures, "piano", 120, accompaniment,
      vi.fn(), controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(renderAudio).not.toHaveBeenCalled();
  });

  it("오디오 렌더 중 취소하면 영상 인코딩을 생략하고 잠금을 해제한다", async () => {
    const controller = new AbortController();
    renderAudio.mockImplementationOnce(async () => {
      controller.abort();
      return { audioBuffer, introSeconds: 8.08 };
    });
    await expect(exportCompositionLyricsMp4(measures, "piano", 120, accompaniment,
      vi.fn(), controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(encodeVideo).not.toHaveBeenCalled();
    await expect(exportCompositionLyricsMp4(measures)).resolves.toBe(mp4);
  });

  it("영상 인코딩이 끝날 때까지 다른 오디오 저장을 잠근다", async () => {
    let finish!: (blob: Blob) => void;
    encodeVideo.mockImplementationOnce(() => new Promise<Blob>((resolve) => { finish = resolve; }));
    const pending = exportCompositionLyricsMp4(measures);
    await vi.waitFor(() => expect(encodeVideo).toHaveBeenCalledOnce());
    const anotherExport = vi.fn(async () => "other export");
    expect(await runExclusiveAudioExport(anotherExport)).toBeNull();
    expect(await exportCompositionLyricsMp4(measures)).toBeNull();
    expect(anotherExport).not.toHaveBeenCalled();
    finish(mp4);
    await expect(pending).resolves.toBe(mp4);
    await expect(runExclusiveAudioExport(anotherExport)).resolves.toBe("other export");
  });

  it("오디오와 영상 오류를 전달하고 다음 저장은 다시 허용한다", async () => {
    renderAudio.mockRejectedValueOnce(new Error("반주 소리를 만들지 못했어요."));
    await expect(exportCompositionLyricsMp4(measures)).rejects.toThrow("반주 소리");
    encodeVideo.mockRejectedValueOnce(new Error("MP4 만들기를 지원하지 않아요."));
    await expect(exportCompositionLyricsMp4(measures)).rejects.toThrow("MP4 만들기");
    await expect(exportCompositionLyricsMp4(measures)).resolves.toBe(mp4);
  });
});

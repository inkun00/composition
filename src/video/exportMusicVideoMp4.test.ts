import { beforeEach, describe, expect, it, vi } from "vitest";
import { runExclusiveAudioExport } from "../audio/player";
import type { MusicVideoExportOptions } from "./exportMusicVideoMp4";
import { exportMusicVideoMp4 } from "./exportMusicVideoMp4";
import { buildLyricVideoPlan } from "./lyricVideoPlan";
import type { MusicVideoPlan } from "./musicVideoModel";

const { renderAudio, encodeVideo, drawFrame, prepareVector } = vi.hoisted(() => ({
  renderAudio: vi.fn(), encodeVideo: vi.fn(), drawFrame: vi.fn(), prepareVector: vi.fn()
}));
vi.mock("../audio/backingExport", () => ({
  renderOfflineBackingAudio: renderAudio, renderOfflineBackingMp3: vi.fn(), renderRealtimeBackingMp3: vi.fn()
}));
vi.mock("./exportLyricMp4", () => ({ exportLyricMp4: encodeVideo }));
vi.mock("./musicVideoRenderer", () => ({ drawMusicVideoFrame: drawFrame }));
vi.mock("./sceneVectorEngine", () => ({ ensureSceneVectorEngine: prepareVector }));

const options: MusicVideoExportOptions = {
  title: "우리의 그림 노래", bpm: 120, instrumentId: "flute", animated: false,
  accompaniment: { styleId: "folk", instrumentIds: ["acoustic_guitar_steel"] },
  measures: [{ harmony: "home", chords: ["C"], notes: [
    { id: "a", pitch: 60, duration: { numerator: 1, denominator: 1 }, lyric: "우" },
    { id: "b", pitch: 62, duration: { numerator: 1, denominator: 1 }, lyric: "리" },
    { id: "rest", pitch: null, duration: { numerator: 2, denominator: 1 } }
  ] }, { harmony: "home", chords: ["C"], notes: [
    { id: "c", pitch: 64, duration: { numerator: 2, denominator: 1 }, lyric: "노래" }
  ] }],
  scenes: [0, 1].map((index) => ({
    id: `scene-${index}`, background: "#ffffff", motion: "auto",
    endLyric: null, endMeasureIndex: index,
    elements: [{ id: `line-${index}`, tool: "line", color: "#000000", width: 5,
      points: [[10, 10, .5], [20, 20, .5]] }]
  }))
};
const audioBuffer = { duration: 5 } as AudioBuffer;
const mp4 = new Blob(["video"], { type: "video/mp4" });

beforeEach(() => {
  vi.clearAllMocks();
  prepareVector.mockResolvedValue(undefined);
  renderAudio.mockResolvedValue({ audioBuffer, introSeconds: 2 });
  encodeVideo.mockImplementation(async (_audio, _plan, progress, _signal, encoderOptions) => {
    encoderOptions.drawFrame({}, _plan.frames[1], 2.25);
    progress(100);
    return mp4;
  });
});

describe("그림 뮤직비디오 MP4 저장", () => {
  it("가락과 반주를 원본 PCM으로 렌더하고 쉼표를 포함한 마디 끝에 장면을 맞춘다", async () => {
    const progress = vi.fn();
    const controller = new AbortController();
    expect(await exportMusicVideoMp4(options, progress, controller.signal)).toBe(mp4);
    expect(renderAudio).toHaveBeenCalledWith(options.measures, "flute", 120, options.accompaniment,
      controller.signal, { includeMelody: true });
    expect(encodeVideo.mock.calls[0][0]).toBe(audioBuffer);
    expect(encodeVideo.mock.calls[0][4].frameRate).toBeUndefined();
    const plan = drawFrame.mock.calls[0][1] as MusicVideoPlan;
    expect(plan.scenes.map((timed) => [timed.startSeconds, timed.endSeconds])).toEqual([[2, 4], [4, 5]]);
    expect(drawFrame.mock.calls[0].slice(2)).toEqual([2.25, false]);
    expect(progress).toHaveBeenLastCalledWith(100);
  });

  it("움직이는 영상은 같은 장면을 24fps로 인코딩한다", async () => {
    await exportMusicVideoMp4({ ...options, animated: true }, vi.fn());
    expect(encodeVideo.mock.calls[0][4].frameRate).toBe(24);
    expect(drawFrame.mock.calls[0][3]).toBe(true);
  });

  it.each([false, true])("전주 장면과 작곡가를 같은 실제 경계로 MP4 renderer에 전달한다 (animated=%s)", async (animated) => {
    const intro = { ...options.scenes[0], id: "intro", section: "intro" as const,
      endLyric: null, endMeasureIndex: undefined };
    await exportMusicVideoMp4({ ...options, animated, composer: "새봄", scenes: [intro, ...options.scenes] }, vi.fn());
    const plan = drawFrame.mock.calls[0][1] as MusicVideoPlan;
    expect(plan.composer).toBe("새봄");
    expect(plan.scenes.map((entry) => [entry.scene.id, entry.startSeconds, entry.endSeconds]))
      .toEqual([["intro", 0, 2], ["scene-0", 2, 4], ["scene-1", 4, 5]]);
    expect(drawFrame.mock.calls[0][3]).toBe(animated);
  });

  it("개체별 모션은 이전 벡터 동작 도구를 불러오지 않고 원본 효과 정보를 MP4로 전달한다", async () => {
    const legacyScenes = options.scenes.map((scene, index) => index ? scene : {
      ...scene,
      choreography: {
        version: 1 as const,
        description: "이전 팔 동작",
        actors: [{ id: "arm", name: "팔", elementIds: ["line-0"],
          fixedPoint: [10, 10] as const, movingPoint: [20, 20] as const, endPoint: [30, 20] as const }],
        actions: [{ id: "move-arm", actorId: "arm", kind: "move" as const,
          startMeasureIndex: 0, startBeat: 0, durationBeats: 1, strength: 1 }]
      }
    });
    await exportMusicVideoMp4({ ...options, animated: true, scenes: legacyScenes }, vi.fn());
    expect(prepareVector).toHaveBeenCalledOnce();
    vi.clearAllMocks();

    const partialScenes = legacyScenes.map((scene, index) => index ? scene : {
      ...scene,
      motion: "still" as const,
      elements: scene.elements.map((element) => ({ ...element, motion: "move-left" as const }))
    });
    const original = structuredClone(partialScenes);
    await exportMusicVideoMp4({ ...options, animated: true, scenes: partialScenes }, vi.fn());
    expect(prepareVector).not.toHaveBeenCalled();
    const plan = drawFrame.mock.calls[0][1] as MusicVideoPlan;
    expect(plan.scenes[0].scene.elements[0].motion).toBe("move-left");
    expect(drawFrame.mock.calls[0][3]).toBe(true);
    expect(partialScenes).toEqual(original);
  });

  it.each([false, true])("동작 구간을 고치기 전에는 모든 MP4 생성을 막는다 (animated=%s)", async (animated) => {
    const scenes = options.scenes.map((scene, index) => index === 1 ? scene : { ...scene, choreography: {
      version: 1 as const, description: "", actors: [{ id: "hand", name: "손", elementIds: ["line-0"],
        fixedPoint: [10, 10] as const, movingPoint: [20, 20] as const, endPoint: [30, 25] as const }],
      actions: [{ id: "press", actorId: "hand", kind: "press" as const, startMeasureIndex: 1,
        startBeat: 0, durationBeats: 1, strength: 1 }]
    } });
    const original = structuredClone(scenes);
    await expect(exportMusicVideoMp4({ ...options, scenes, animated }, vi.fn())).rejects.toThrow();
    expect(renderAudio).not.toHaveBeenCalled();
    expect(encodeVideo).not.toHaveBeenCalled();
    expect(prepareVector).not.toHaveBeenCalled();
    expect(scenes).toEqual(original);
  });

  it("현재 노래와 맞는 녹음이 제공되면 녹음의 전주와 길이를 그대로 사용한다", async () => {
    const plan = buildLyricVideoPlan("녹음", options.measures, 120, 3, 6.3);
    await exportMusicVideoMp4({ ...options, recording: { audioUrl: "blob:singing", plan } }, vi.fn());
    expect(renderAudio).not.toHaveBeenCalled();
    expect(encodeVideo.mock.calls[0][0]).toBe("blob:singing");
    expect(encodeVideo.mock.calls[0][1]).toBe(plan);
    const videoPlan = drawFrame.mock.calls[0][1] as MusicVideoPlan;
    expect(videoPlan.introSeconds).toBe(3);
    expect(videoPlan.scenes.map((timed) => timed.endSeconds)).toEqual([5, 6.3]);
  });

  it("장면의 순서와 마지막 마디 설정을 오디오 생성 전에 검증한다", async () => {
    await expect(exportMusicVideoMp4({ ...options, scenes: options.scenes.slice(0, 1) }, vi.fn()))
      .rejects.toThrow("마지막 마디");
    expect(renderAudio).not.toHaveBeenCalled();
    expect(encodeVideo).not.toHaveBeenCalled();
  });

  it("예전 음절 끝 선택도 마디 끝으로 이동하고 같은 마디의 여러 그림은 재선택을 요구한다", async () => {
    const legacy = options.scenes.map((scene, index) => ({ ...scene, endMeasureIndex: undefined,
      endLyric: { measureIndex: index, noteId: index === 0 ? "a" : "c" } }));
    await exportMusicVideoMp4({ ...options, scenes: legacy }, vi.fn());
    const plan = drawFrame.mock.calls[0][1] as MusicVideoPlan;
    expect(plan.scenes.map((timed) => timed.endSeconds)).toEqual([4, 5]);
    vi.clearAllMocks();
    await expect(exportMusicVideoMp4({ ...options, scenes: [legacy[0], {
      ...legacy[1], endLyric: { measureIndex: 0, noteId: "b" }
    }] }, vi.fn())).rejects.toThrow("같은 마디");
    expect(renderAudio).not.toHaveBeenCalled();
  });

  it("취소된 작업과 렌더 중 취소는 인코딩하지 않고 잠금을 해제한다", async () => {
    const aborted = new AbortController();
    aborted.abort();
    await expect(exportMusicVideoMp4(options, vi.fn(), aborted.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(renderAudio).not.toHaveBeenCalled();
    const controller = new AbortController();
    renderAudio.mockImplementationOnce(async () => {
      controller.abort();
      return { audioBuffer, introSeconds: 2 };
    });
    await expect(exportMusicVideoMp4(options, vi.fn(), controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(encodeVideo).not.toHaveBeenCalled();
    await expect(exportMusicVideoMp4(options, vi.fn())).resolves.toBe(mp4);
  });

  it("인코딩 중 오디오 작업을 잠그고 인코더 실패 이후에도 다시 저장할 수 있다", async () => {
    let finish!: (blob: Blob) => void;
    encodeVideo.mockImplementationOnce(() => new Promise<Blob>((resolve) => { finish = resolve; }));
    const pending = exportMusicVideoMp4(options, vi.fn());
    await vi.waitFor(() => expect(encodeVideo).toHaveBeenCalledOnce());
    expect(await runExclusiveAudioExport(async () => "blocked")).toBeNull();
    expect(await exportMusicVideoMp4(options, vi.fn())).toBeNull();
    finish(mp4);
    await pending;
    encodeVideo.mockRejectedValueOnce(new Error("인코더 오류"));
    await expect(exportMusicVideoMp4(options, vi.fn())).rejects.toThrow("인코더 오류");
    await expect(exportMusicVideoMp4(options, vi.fn())).resolves.toBe(mp4);
  });
});

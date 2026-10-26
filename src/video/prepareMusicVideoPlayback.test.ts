import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildLyricVideoPlan } from "./lyricVideoPlan";
import { prepareMusicVideoPlayback, type MusicVideoExportOptions } from "./prepareMusicVideoPlayback";

const { renderAudio, prepareVector } = vi.hoisted(() => ({ renderAudio: vi.fn(), prepareVector: vi.fn() }));
vi.mock("../audio/backingExport", () => ({ renderOfflineBackingAudio: renderAudio }));
vi.mock("./sceneVectorEngine", () => ({ ensureSceneVectorEngine: prepareVector }));

const options: MusicVideoExportOptions = {
  title: "전체 미리보기", instrumentId: "violin", bpm: 120, animated: true,
  accompaniment: { styleId: "arpeggio", instrumentIds: ["piano"] },
  measures: [0, 1].map((measureIndex) => ({ harmony: "home", measureIndex,
    notes: [{ id: `note-${measureIndex}`, pitch: 60 + measureIndex * 2,
      duration: { numerator: 4, denominator: 1 }, lyric: measureIndex ? "노래" : "별빛" }] })),
  scenes: [0, 1].map((index) => ({ id: `scene-${index}`, background: "#ffffff", motion: "bounce",
    endLyric: null, endMeasureIndex: index, elements: [{ id: `line-${index}`, tool: "line", color: "#123456",
      width: 8, points: [[100, 100, .3], [300, 200, .9]] }] }))
};

beforeEach(() => {
  vi.resetAllMocks();
  renderAudio.mockResolvedValue({ audioBuffer: { duration: 12 }, introSeconds: 2.08 });
  prepareVector.mockResolvedValue(undefined);
});

describe("MP4와 전체 음악 미리보기의 공통 준비", () => {
  it("같은 원본 PCM·실제 전주·후주와 모든 장면/가사 경계를 제공한다", async () => {
    const abort = new AbortController();
    const progress = vi.fn();
    const prepared = await prepareMusicVideoPlayback(options, abort.signal, progress);
    expect(renderAudio).toHaveBeenCalledWith(options.measures, options.instrumentId, 120,
      options.accompaniment, abort.signal, { includeMelody: true });
    expect(prepared).toMatchObject({ audio: { duration: 12 }, duration: 12, plan: { introSeconds: 2.08, bpm: 120 } });
    expect(prepared.plan.scenes.map((timed) => [timed.startSeconds, timed.endSeconds]))
      .toEqual([[2.08, 4.08], [4.08, 12]]);
    expect(prepared.plan.lyrics.frames[0]).toMatchObject({ startSeconds: 0, endSeconds: 2.08, measureIndex: null });
    expect(prepared.plan.lyrics.frames.at(-1)?.endSeconds).toBe(12);
    expect(progress.mock.calls).toEqual([[2], [35]]);
  });

  it("녹음은 새 연주를 만들지 않고 녹음의 가사 계획·전주·길이를 유지한다", async () => {
    const plan = buildLyricVideoPlan("내 목소리", options.measures, 120, 3.6, 10.2);
    const prepared = await prepareMusicVideoPlayback({ ...options, recording: { audioUrl: "blob:voice", plan } });
    expect(renderAudio).not.toHaveBeenCalled();
    expect(prepared.audio).toBe("blob:voice");
    expect(prepared.duration).toBe(10.2);
    expect(prepared.plan.introSeconds).toBe(3.6);
    expect(prepared.plan.lyrics).toBe(plan);
    expect(prepared.plan.scenes.map((timed) => timed.endSeconds)).toEqual([5.6, 10.2]);
  });

  it("전주 그림과 작곡가를 실제 오프라인 전주 길이로 미리보기 계획에 전달한다", async () => {
    const intro = { ...options.scenes[0], id: "intro", section: "intro" as const,
      endLyric: null, endMeasureIndex: undefined };
    const prepared = await prepareMusicVideoPlayback({ ...options, composer: "새봄", scenes: [intro, ...options.scenes] });
    expect(prepared.plan.composer).toBe("새봄");
    expect(prepared.plan.scenes.map((entry) => [entry.startSeconds, entry.endSeconds]))
      .toEqual([[0, 2.08], [2.08, 4.08], [4.08, 12]]);
    expect(prepared.plan.scenes[0].scene).toBe(intro);
  });

  it("녹음 전주는 추정 길이 대신 녹음 프레임의 실제 시작 시각을 사용한다", async () => {
    const lyricPlan = buildLyricVideoPlan("내 목소리", options.measures, 120, 3.6, 10.2);
    const intro = { ...options.scenes[0], id: "intro", section: "intro" as const,
      endLyric: null, endMeasureIndex: undefined, elements: [] };
    const prepared = await prepareMusicVideoPlayback({ ...options, composer: "녹음 작곡가", scenes: [intro, ...options.scenes],
      recording: { audioUrl: "blob:voice", plan: lyricPlan } });
    expect(renderAudio).not.toHaveBeenCalled();
    expect(prepared.plan.scenes.map((entry) => [entry.startSeconds, entry.endSeconds]))
      .toEqual([[0, 3.6], [3.6, 5.6], [5.6, 10.2]]);
    expect(prepared.plan.lyrics).toBe(lyricPlan);
    expect(prepared.plan.composer).toBe("녹음 작곡가");
  });

  it("전주에만 남은 이전 마디 연출 때문에 벡터 엔진을 준비하지 않는다", async () => {
    const intro = { ...options.scenes[0], id: "intro", section: "intro" as const,
      endLyric: null, endMeasureIndex: undefined, choreography: { version: 1 as const,
        description: "이전 전주 연출", actors: [{ id: "actor", name: "선", elementIds: ["line-0"],
          fixedPoint: [100, 100] as const, movingPoint: [300, 200] as const, endPoint: [320, 200] as const }],
        actions: [{ id: "old", actorId: "actor", kind: "jump" as const, startMeasureIndex: 63,
          startBeat: 0, durationBeats: 1, strength: 1 }] } };
    await expect(prepareMusicVideoPlayback({ ...options, scenes: [intro, ...options.scenes] })).resolves.toBeDefined();
    expect(prepareVector).not.toHaveBeenCalled();
  });

  it.each([false, true])("장면 구간 밖 동작이 남으면 오디오 준비 전에 중단한다 (animated=%s)", async (animated) => {
    const scenes = options.scenes.map((scene, index) => index ? scene : { ...scene, choreography: {
      version: 1 as const, description: "장면 밖 동작", actors: [{ id: "actor", name: "선", elementIds: ["line-0"],
        fixedPoint: [100, 100] as const, movingPoint: [300, 200] as const, endPoint: [320, 200] as const }],
      actions: [{ id: "move", actorId: "actor", kind: "move" as const, startMeasureIndex: 1,
        startBeat: 0, durationBeats: 1, strength: 1 }]
    } });
    const original = structuredClone(scenes);
    const progress = vi.fn();
    await expect(prepareMusicVideoPlayback({ ...options, scenes, animated }, undefined, progress)).rejects.toThrow("1번 장면");
    expect(renderAudio).not.toHaveBeenCalled();
    expect(prepareVector).not.toHaveBeenCalled();
    expect(progress).not.toHaveBeenCalled();
    expect(scenes).toEqual(original);
  });

  it("수정된 유효한 동작을 검증한 뒤 정적 모드에서는 원본을 유지하면서 렌더 계획에서만 제외한다", async () => {
    await expect(prepareMusicVideoPlayback({ ...options, scenes: options.scenes.slice(0, 1) })).rejects.toThrow("마지막 마디");
    expect(renderAudio).not.toHaveBeenCalled();
    const scenes = options.scenes.map((scene, index) => ({ ...scene, choreography: { version: 1 as const,
      description: "장면 안 동작", actors: [{ id: "actor", name: "선", elementIds: [`line-${index}`],
        fixedPoint: [100, 100] as const, movingPoint: [300, 200] as const, endPoint: [320, 200] as const }],
      actions: [{ id: "move", actorId: "actor", kind: "move" as const, startMeasureIndex: index,
        startBeat: 0, durationBeats: 1, strength: 1 }] } }));
    const original = structuredClone(scenes);
    const prepared = await prepareMusicVideoPlayback({ ...options, scenes, animated: false });
    expect(prepared.plan.scenes.every((timed) => timed.scene.choreography === undefined)).toBe(true);
    expect(prepareVector).not.toHaveBeenCalled();
    expect(renderAudio).toHaveBeenCalledOnce();
    expect(scenes).toEqual(original);
  });

  it("렌더 중 취소되면 준비된 음악과 계획을 전달하지 않는다", async () => {
    const abort = new AbortController();
    renderAudio.mockImplementationOnce(async () => {
      abort.abort();
      return { audioBuffer: { duration: 12 }, introSeconds: 2.08 };
    });
    await expect(prepareMusicVideoPlayback(options, abort.signal)).rejects.toMatchObject({ name: "AbortError" });
    await expect(prepareMusicVideoPlayback(options, abort.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(renderAudio).toHaveBeenCalledOnce();
  });
});

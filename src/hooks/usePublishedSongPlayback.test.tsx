// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CompositionPlaybackControl } from "../audio/player";
import type { PublishedSong } from "../firebase/communityAlbums";
import { usePublishedSongPlayback } from "./usePublishedSongPlayback";

const { playComposition } = vi.hoisted(() => ({ playComposition: vi.fn() }));
vi.mock("../audio/player", () => ({ playComposition }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const song: PublishedSong = { id: "shared", albumId: "album", ownerId: "owner", ownerName: "작곡가",
  sourceScoreId: "score", title: "공유 노래", creator: "작곡가", access: "audio", publishedAt: 1, updatedAt: 1,
  draft: { version: 1, updatedAt: 1, sourceHash: "", title: "공유 노래", creator: "작곡가", originalCreator: "",
    presetId: "H001", songLength: 8, meter: { beats: 4, beatUnit: 4 }, instrumentId: "piano", bpm: 120,
    accompanimentStyleId: "arpeggio", accompanimentInstrumentIds: ["piano", "acoustic_grand_piano"],
    lyrics: Array(8).fill("가나다라"), showArrangement: true,
    measures: Array.from({ length: 8 }, (_, index) => ({ candidateId: null, candidateName: null,
      notes: [{ id: `note-${index}`, pitch: 60, duration: { numerator: 4, denominator: 1 } }] })) } };

let root: Root | null;
let host: HTMLDivElement;
let playback: ReturnType<typeof usePublishedSongPlayback>;
let harnessRenders = 0;
let nextFrameId = 0;
const frames = new Map<number, FrameRequestCallback>();
function Harness() {
  harnessRenders++;
  playback = usePublishedSongPlayback();
  return null;
}
function control(index = playComposition.mock.calls.length - 1) {
  return playComposition.mock.calls[index][5] as CompositionPlaybackControl;
}
async function flush() { await act(async () => { await Promise.resolve(); }); }
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  playComposition.mockReset().mockResolvedValue(10);
  harnessRenders = 0;
  nextFrameId = 0;
  frames.clear();
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
    const id = ++nextFrameId;
    frames.set(id, callback);
    return id;
  }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn((id: number) => { frames.delete(id); }));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(<Harness />));
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host.remove();
  vi.unstubAllGlobals();
});

describe("공유 노래의 실제 재생 수명", () => {
  it("준비 중 가사는 멈추고 실제 오디오 시계를 구독 패널에만 전달한다", async () => {
    const pending = playback.play(song);
    const store = playback.store;
    const renders = harnessRenders;
    expect(store.getSnapshot()).toMatchObject({ songId: song.id, phase: "preparing", elapsedSeconds: 0 });
    let audioTime = -.08;
    control().onStarted?.({ durationSeconds: 16, getElapsedSeconds: () => audioTime });
    expect(store.getSnapshot()?.phase).toBe("preparing");
    audioTime = .5;
    let callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach((callback) => callback(performance.now() + 100));
    expect(store.getSnapshot()).toMatchObject({ phase: "playing", elapsedSeconds: .5, durationSeconds: 16 });
    audioTime = .56;
    callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach((callback) => callback(performance.now() + 140));
    expect(store.getSnapshot()?.elapsedSeconds).toBe(.56);
    callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach((callback) => callback(performance.now() + 2000));
    expect(store.getSnapshot()?.elapsedSeconds).toBe(.56);
    expect(harnessRenders).toBe(renders);
    playback.stop();
    expect(store.getSnapshot()).toBeNull();
    expect(frames.size).toBe(0);
    expect(await pending).toBe(true);
  });

  it("중단된 곡의 늦은 시계나 프레임이 새 곡의 가사를 바꾸지 않는다", async () => {
    const first = playback.play(song);
    const previous = control();
    previous.onStarted?.({ durationSeconds: 16, getElapsedSeconds: () => 3 });
    const oldFrame = [...frames.values()][0];
    playback.stop();
    await first;
    const second = playback.play({ ...song, id: "second" });
    previous.onStarted?.({ durationSeconds: 16, getElapsedSeconds: () => 8 });
    oldFrame(performance.now() + 500);
    expect(playback.store.getSnapshot()).toMatchObject({ songId: "second", phase: "preparing", elapsedSeconds: 0 });
    expect(frames.size).toBe(0);
    await flush();
    control().onStarted?.({ durationSeconds: 16, getElapsedSeconds: () => .25 });
    expect(playback.store.getSnapshot()).toMatchObject({ songId: "second", phase: "playing", elapsedSeconds: .25 });
    control().onEnded?.();
    expect(await second).toBe(true);
    expect(playback.store.getSnapshot()).toBeNull();
    expect(frames.size).toBe(0);
  });

  it("스케줄 완료가 아닌 실제 종료 콜백까지 재생 Promise를 유지한다", async () => {
    const pending = playback.play(song);
    let completed = false;
    void pending.then(() => { completed = true; });
    await flush();
    expect(completed).toBe(false);
    expect(playComposition.mock.calls[0][0]).toHaveLength(8);
    expect(playComposition.mock.calls[0][1]).toBe("acoustic_grand_piano");
    expect(playComposition.mock.calls[0][2]).toBe(120);
    expect(playComposition.mock.calls[0][3]).toMatchObject({ instrumentIds: ["acoustic_grand_piano"], meter: song.draft.meter });
    control().onEnded?.();
    expect(await pending).toBe(true);
    playback.stop();
    expect(control().signal?.aborted).toBe(false);
  });

  it("준비 중에도 중단 결과를 즉시 반환하고 그 세션의 signal만 취소한다", async () => {
    const preparing = deferred<number | null>();
    playComposition.mockReturnValueOnce(preparing.promise);
    const pending = playback.play(song);
    const previous = control();
    playback.stop();
    expect(await pending).toBe(true);
    expect(previous.signal?.aborted).toBe(true);
    const next = playback.play({ ...song, id: "next" });
    const current = control();
    await flush();
    previous.onEnded?.();
    preparing.resolve(null);
    await flush();
    expect(current.signal?.aborted).toBe(false);
    expect(await playback.play(song)).toBe(false);
    current.onEnded?.();
    expect(await next).toBe(true);
  });

  it("다른 재생 때문에 엔진이 거절하면 false이며 다음 재생을 막지 않는다", async () => {
    playComposition.mockResolvedValueOnce(null);
    expect(await playback.play(song)).toBe(false);
    const rejected = control();
    playback.stop();
    expect(rejected.signal?.aborted).toBe(false);
    const next = playback.play(song);
    await flush();
    control().onEnded?.();
    expect(await next).toBe(true);
  });

  it("이미 자기 노래를 재생할 때 중복 재생은 거절하고 기존 세션은 유지한다", async () => {
    const first = playback.play(song);
    expect(await playback.play(song)).toBe(false);
    expect(playComposition).toHaveBeenCalledTimes(1);
    await flush();
    control().onEnded?.();
    expect(await first).toBe(true);
  });

  it("재생 오류를 호출자에게 전달하고 늦은 종료 콜백이 새 노래를 지우지 않는다", async () => {
    const preparing = deferred<number>();
    playComposition.mockReturnValueOnce(preparing.promise);
    const first = playback.play(song);
    const rejected = expect(first).rejects.toThrow("재생 실패");
    const previous = control();
    previous.onEnded?.();
    preparing.reject(new Error("재생 실패"));
    await rejected;
    const next = playback.play(song);
    await flush();
    previous.onEnded?.();
    expect(await playback.play(song)).toBe(false);
    control().onEnded?.();
    expect(await next).toBe(true);
  });

  it("부모 화면을 나가면 자기 재생만 취소하고 Promise를 정리한다", async () => {
    const pending = playback.play(song);
    const current = control();
    act(() => root!.unmount());
    root = null;
    expect(current.signal?.aborted).toBe(true);
    expect(await pending).toBe(true);
  });

  it("완성되지 않은 공개 악보는 엔진을 시작하지 않는다", async () => {
    const invalid = { ...song, draft: { ...song.draft, measures: song.draft.measures.map((measure) => ({ ...measure, notes: null })) } };
    expect(await playback.play(invalid)).toBe(false);
    expect(playComposition).not.toHaveBeenCalled();
  });

  it("아주 짧은 곡이 준비 완료 직전에 끝나도 종료 결과를 놓치지 않는다", async () => {
    playComposition.mockImplementationOnce(async (...args: unknown[]) => {
      (args[5] as CompositionPlaybackControl).onEnded?.();
      return .01;
    });
    expect(await playback.play(song)).toBe(true);
  });
});

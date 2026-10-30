import { Scheduler, type NoteEvent, type SmplrOptions, type SoundfontOptions } from "smplr";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INSTRUMENTS } from "../music/instruments";
import { isSampleBackedInstrument, loadSampleInstrument, preloadInstrument, queueSampleNote, releaseSampleContext,
  releaseSampleInstrument, resetSampleInstrumentCache } from "./samplePlayer";

const { soundfontMock, dispatched } = vi.hoisted(() => ({ soundfontMock: vi.fn(), dispatched: vi.fn() }));
vi.mock("smplr", async (importActual) => ({
  ...await importActual<typeof import("smplr")>(),
  Soundfont: soundfontMock
}));

class OfflineContextMock {
  currentTime = 0;
  sampleRate = 44100;
  length = this.sampleRate * 8;
}

const schedulers: Scheduler[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  resetSampleInstrumentCache();
  vi.stubGlobal("OfflineAudioContext", OfflineContextMock);
  soundfontMock.mockImplementation((context: BaseAudioContext, options: SoundfontOptions & SmplrOptions) => {
    const scheduler = options.scheduler ?? Scheduler(context);
    schedulers.push(scheduler);
    // Use the real smplr scheduler after successful sample preparation. This
    // catches the offline lookahead bug instead of merely counting start calls.
    return {
      ready: Promise.resolve(),
      start: (event: NoteEvent) => scheduler.schedule(event, dispatched),
      dispose: vi.fn(() => scheduler.stop())
    };
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  schedulers.splice(0).forEach((scheduler) => scheduler.stop());
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  resetSampleInstrumentCache();
});

describe("실제 악기 샘플 연결", () => {
  it("프리로드를 마치면 임시 플레이어와 scheduler를 남기지 않는다", async () => {
    vi.stubGlobal("AudioContext", class { currentTime = 0; });
    const dispose = vi.fn();
    soundfontMock.mockReturnValueOnce({ ready: Promise.resolve(), dispose });
    await preloadInstrument("piano");
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("프리로드 실패 때에도 임시 플레이어를 정리한다", async () => {
    vi.stubGlobal("AudioContext", class { currentTime = 0; });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const dispose = vi.fn();
    soundfontMock.mockReturnValueOnce({ ready: Promise.reject(new Error("sample failed")), dispose });
    await preloadInstrument("violin");
    expect(dispose).toHaveBeenCalledOnce();
  });
  it("화면의 모든 악기가 샘플 재생을 지원한다", () => {
    expect(INSTRUMENTS.every((instrument) => isSampleBackedInstrument(instrument.id))).toBe(true);
  });

  it("검증한 관악기와 현악기는 루프를 쓰고 피아노와 기타의 자연 감쇠는 유지한다", async () => {
    const context = { currentTime: 0 } as BaseAudioContext;
    const destination = {} as AudioNode;
    for (const id of ["clarinet", "recorder", "flute", "violin", "cello", "piri", "piano", "guitar"]) {
      await loadSampleInstrument(context, destination, id);
    }
    const options = soundfontMock.mock.calls.map(([, options]) => options);
    expect(options.slice(0, 6).every((options) => options.loadLoopData && options.loader)).toBe(true);
    expect(options.slice(6).every((options) => !options.loadLoopData && !options.loader)).toBe(true);
  });

  it("offline 렌더 시작 전에 늦은 음표까지 모두 실제 scheduler에서 dispatch한다", async () => {
    const context = new OfflineContextMock() as unknown as OfflineAudioContext;
    const destination = {} as AudioNode;
    const loaded = await loadSampleInstrument(context, destination, "acoustic_grand_piano");
    for (const [index, pitch] of [60, 64, 67, 72].entries()) {
      queueSampleNote(loaded, context, destination, pitch, index * 2, 2, 0.09);
    }
    // No wall-clock timers run during a fast OfflineAudioContext render.
    expect(dispatched.mock.calls.map(([event]) => [event.note, event.time, event.duration])).toEqual([
      [60, 0, 2], [64, 2, 2], [67, 4, 2], [72, 6, 2]
    ]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("실시간 context는 기본 lookahead와 후속 timer dispatch를 유지한다", async () => {
    const context = { currentTime: 0 } as BaseAudioContext;
    const destination = {} as AudioNode;
    const loaded = await loadSampleInstrument(context, destination, "flute");
    queueSampleNote(loaded, context, destination, 60, 0, 0.5, 0.09);
    queueSampleNote(loaded, context, destination, 72, 3, 0.5, 0.09);
    expect(soundfontMock.mock.calls[0][1]).not.toHaveProperty("scheduler");
    expect(dispatched.mock.calls.map(([event]) => event.note)).toEqual([60]);
    Object.assign(context, { currentTime: 2.9 });
    vi.advanceTimersByTime(50);
    expect(dispatched.mock.calls.map(([event]) => event.note)).toEqual([60, 72]);
  });

  it("짧은 offline 상수가 아닌 전체 buffer 길이에 맞춰 마지막 음표를 예약한다", async () => {
    const context = new OfflineContextMock() as unknown as OfflineAudioContext;
    Object.assign(context, { length: context.sampleRate * 720 });
    const destination = {} as AudioNode;
    const loaded = await loadSampleInstrument(context, destination, "violin");
    queueSampleNote(loaded, context, destination, 67, 719, 1, 0.09);
    expect(dispatched).toHaveBeenCalledWith(expect.objectContaining({ note: 67, time: 719, duration: 1 }));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("한 재생 context 정리는 동시에 준비된 offline 샘플을 해제하지 않는다", async () => {
    const live = { currentTime: 0 } as BaseAudioContext;
    const offline = new OfflineContextMock() as unknown as OfflineAudioContext;
    const destination = {} as AudioNode;
    const liveSample = await loadSampleInstrument(live, destination, "flute");
    const offlineSample = await loadSampleInstrument(offline, destination, "violin");
    releaseSampleContext(live);
    await Promise.resolve();
    expect(liveSample.player.dispose).toHaveBeenCalledOnce();
    expect(offlineSample.player.dispose).not.toHaveBeenCalled();
    expect(await loadSampleInstrument(offline, destination, "violin")).toBe(offlineSample);
  });

  it("시간 초과로 해제한 샘플이 나중에 준비되어도 즉시 폐기한다", async () => {
    const context = { currentTime: 0 } as BaseAudioContext;
    const destination = {} as AudioNode;
    let finishLoad = () => {};
    const dispose = vi.fn();
    soundfontMock.mockImplementationOnce(() => ({
      ready: new Promise<void>((resolve) => { finishLoad = resolve; }), dispose
    }));
    const pending = loadSampleInstrument(context, destination, "flute");
    releaseSampleInstrument(context, destination, "flute");
    finishLoad();
    await pending;
    await Promise.resolve();
    expect(dispose).toHaveBeenCalledOnce();
    expect(await loadSampleInstrument(context, destination, "flute")).not.toBe(await pending);
  });
});

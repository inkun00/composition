import { Scheduler, type NoteEvent, type SmplrOptions, type SoundfontOptions } from "smplr";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INSTRUMENTS } from "../music/instruments";
import { isSampleBackedInstrument, loadSampleInstrument, queueSampleNote, resetSampleInstrumentCache } from "./samplePlayer";

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
      start: (event: NoteEvent) => scheduler.schedule(event, dispatched)
    };
  });
});

afterEach(() => {
  schedulers.splice(0).forEach((scheduler) => scheduler.stop());
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  resetSampleInstrumentCache();
});

describe("실제 악기 샘플 연결", () => {
  it("화면의 모든 악기가 샘플 재생을 지원한다", () => {
    expect(INSTRUMENTS.every((instrument) => isSampleBackedInstrument(instrument.id))).toBe(true);
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
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prepareKaraokeTimeline, startKaraokeClock } from "./karaokeTimeline";
import type { AccompanimentOptions, PlaybackMeasure } from "./accompanimentScore";

const measures: readonly PlaybackMeasure[] = [{
  measureIndex: 5, harmony: "home", chords: ["C"], notes: [
    { id: "first", pitch: 60, duration: { numerator: 1, denominator: 1 } },
    { id: "rest", pitch: null, duration: { numerator: 1, denominator: 1 } },
    { id: "last", pitch: 64, duration: { numerator: 2, denominator: 1 } }
  ]
}, {
  measureIndex: 9, harmony: "journey", chords: ["F"],
  notes: [{ id: "next", pitch: 65, duration: { numerator: 4, denominator: 1 } }]
}];
const accompaniment: AccompanimentOptions = { styleId: "arpeggio", instrumentIds: ["piano"],
  meter: { beats: 4, beatUnit: 4 } };
type ClockEvents = Parameters<typeof startKaraokeClock>[3];

function fakeContext(time: number, state: AudioContextState = "running") {
  return { currentTime: time, state } as AudioContext;
}

function callbacks() {
  return { onPhase: vi.fn(), onCount: vi.fn(), onStatus: vi.fn(), onHighlight: vi.fn() };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("오디오 시계에 맞춘 노래 연습·녹음 안내", () => {
  it("네 마디 전주 뒤 본곡·후주를 배치하고 실제 마디 ID와 쉼표 길이를 보존한다", () => {
    const events = prepareKaraokeTimeline(measures, 120, accompaniment, { beats: 4, unitBeats: 1 }, true);
    expect(events.every((event, index) => index === 0 || event.at >= events[index - 1].at)).toBe(true);
    expect(events.filter((event) => event.kind === "phase")).toEqual([
      { at: 0, kind: "phase", value: "intro" }, { at: 8, kind: "phase", value: "song" },
      { at: 12, kind: "phase", value: "outro" }
    ]);
    expect(events.filter((event) => event.kind === "count")).toEqual([
      { at: 0, kind: "count", value: null }, { at: 6, kind: "count", value: 4 },
      { at: 6.5, kind: "count", value: 3 }, { at: 7, kind: "count", value: 2 },
      { at: 7.5, kind: "count", value: 1 }, { at: 8, kind: "count", value: null }
    ]);
    const notes = events.filter((event) => event.kind === "highlight" && event.value.section === "song");
    expect(notes).toEqual([
      { at: 8, kind: "highlight", value: { section: "song", measureIndex: 5, noteId: "first" } },
      { at: 9, kind: "highlight", value: { section: "song", measureIndex: 5, noteId: "last" } },
      { at: 10, kind: "highlight", value: { section: "song", measureIndex: 9, noteId: "next" } }
    ]);
    expect(events.some((event) => event.kind === "highlight" && event.value.noteId === "rest")).toBe(false);
    expect(events.some((event) => event.kind === "highlight" && event.value.noteId === "intro-3-0")).toBe(true);
    expect(events.some((event) => event.kind === "highlight" && event.value.noteId === "outro-0-0")).toBe(true);
  });

  it("6/8의 여섯 카운트는 반 박자 간격이며 녹음·연습 문구만 다르다", () => {
    const triple: readonly PlaybackMeasure[] = [{ ...measures[0],
      notes: [{ id: "waltz", pitch: 60, duration: { numerator: 3, denominator: 1 } }] }];
    const count = { beats: 6, unitBeats: .5 };
    const recording = prepareKaraokeTimeline(triple, 120, { ...accompaniment, meter: { beats: 6, beatUnit: 8 } }, count, false);
    expect(recording.filter((event) => event.kind === "count" && event.value !== null)).toEqual(
      Array.from({ length: 6 }, (_, index) => ({ at: 4.5 + index * .25, kind: "count", value: 6 - index }))
    );
    expect(recording.find((event) => event.kind === "phase" && event.value === "song")?.at).toBe(6);
    expect(recording.some((event) => event.kind === "status" && event.value.includes("녹음 중"))).toBe(true);
    const practice = prepareKaraokeTimeline(triple, 120, undefined, count, true);
    expect(practice.some((event) => event.kind === "status" && event.value.includes("녹음되지는 않아요"))).toBe(true);
  });

  it("화면 타이머가 흘러도 오디오 시각이 멈춰 있으면 시작·카운트가 앞서가지 않는다", () => {
    const context = fakeContext(99.5, "suspended");
    const notify = callbacks();
    const end = vi.fn();
    const events = prepareKaraokeTimeline(measures, 120, accompaniment, { beats: 4, unitBeats: 1 }, false);
    const stop = startKaraokeClock(context, 100, 20.8, events, notify, end);
    vi.advanceTimersByTime(60_000);
    expect(notify.onPhase).not.toHaveBeenCalled();
    expect(notify.onCount).not.toHaveBeenCalled();
    expect(end).not.toHaveBeenCalled();
    Object.assign(context, { currentTime: 100, state: "running" });
    vi.advanceTimersByTime(30);
    expect(notify.onPhase).toHaveBeenCalledExactlyOnceWith("intro");
    Object.assign(context, { currentTime: 106, state: "suspended" });
    vi.advanceTimersByTime(30);
    expect(notify.onCount).toHaveBeenLastCalledWith(4);
    notify.onCount.mockClear();
    vi.advanceTimersByTime(60_000);
    expect(notify.onCount).not.toHaveBeenCalled();
    expect(end).not.toHaveBeenCalled();
    stop();
  });

  it("수천 개의 음표도 단일 타이머로 처리하고 지연 후에는 최신 음표만 표시한다", () => {
    const context = fakeContext(0);
    const notify = callbacks();
    const end = vi.fn();
    const events: ClockEvents = Array.from({ length: 2000 }, (_, index) => ({
      at: index / 100, kind: "highlight", value: { section: "song", measureIndex: 3, noteId: `n-${index}` }
    }));
    const interval = vi.spyOn(window, "setInterval");
    const timeout = vi.spyOn(window, "setTimeout");
    const stop = startKaraokeClock(context, 1, 21, events, notify, end);
    expect(interval).toHaveBeenCalledOnce();
    expect(timeout).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);
    Object.assign(context, { currentTime: 20.25 });
    vi.advanceTimersByTime(30);
    expect(notify.onHighlight).toHaveBeenCalledExactlyOnceWith({ section: "song", measureIndex: 3, noteId: "n-1925" });
    vi.advanceTimersByTime(300);
    expect(notify.onHighlight).toHaveBeenCalledTimes(1);
    stop();
    expect(vi.getTimerCount()).toBe(0);
    expect(end).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("같은 음표 경계의 phase·count·highlight와 마지막 종료를 오디오 시간에 맞춰 한 번만 알린다", () => {
    const context = fakeContext(10);
    const notify = callbacks();
    const end = vi.fn();
    const events = prepareKaraokeTimeline(measures, 120, accompaniment, { beats: 4, unitBeats: 1 }, false);
    const stop = startKaraokeClock(context, 10, 20.8, events, notify, end);
    Object.assign(context, { currentTime: 18 });
    vi.advanceTimersByTime(30);
    expect(notify.onPhase).toHaveBeenLastCalledWith("song");
    expect(notify.onCount).toHaveBeenLastCalledWith(null);
    expect(notify.onHighlight).toHaveBeenLastCalledWith({ section: "song", measureIndex: 5, noteId: "first" });
    Object.assign(context, { currentTime: 22 });
    vi.advanceTimersByTime(30);
    expect(notify.onPhase).toHaveBeenLastCalledWith("outro");
    expect(notify.onHighlight.mock.calls.at(-1)?.[0].section).toBe("outro");
    Object.assign(context, { currentTime: 30.8 });
    vi.advanceTimersByTime(30);
    expect(end).toHaveBeenCalledExactlyOnceWith(true);
    expect(vi.getTimerCount()).toBe(0);
    stop();
    vi.advanceTimersByTime(90);
    expect(end).toHaveBeenCalledOnce();
  });

  it("중단 또는 닫힌 오디오 컨텍스트는 성공으로 처리하지 않고 콜백·타이머를 모두 멈춘다", () => {
    for (const closeContext of [false, true]) {
      const context = fakeContext(0);
      const notify = callbacks();
      const end = vi.fn();
      const stop = startKaraokeClock(context, 1, 4, [{ at: 1, kind: "count", value: 4 }], notify, end);
      if (closeContext) {
        Object.assign(context, { state: "closed" });
        vi.advanceTimersByTime(30);
      } else stop();
      stop();
      Object.assign(context, { currentTime: 100 });
      vi.advanceTimersByTime(1000);
      expect(end).toHaveBeenCalledExactlyOnceWith(false);
      expect(notify.onCount).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    }
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DYNAMICS } from "../learningModel";
import { DynamicsPerformanceAudio, type DynamicsPerformanceCallbacks } from "./DynamicsPerformanceAudio";
import { dynamicsGainAt, MELODY } from "./dynamicsPerformanceModel";

function parameter() {
  return { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn() };
}

function oscillator() {
  return { type: "sine", frequency: parameter(), connect: vi.fn(), disconnect: vi.fn(),
    start: vi.fn(), stop: vi.fn(), onended: null as (() => void) | null };
}

function gain() {
  return { gain: parameter(), connect: vi.fn(), disconnect: vi.fn() };
}

class FakeContext {
  static latest: FakeContext;
  state = "running";
  currentTime = 10;
  destination = {};
  oscillators: ReturnType<typeof oscillator>[] = [];
  gains: ReturnType<typeof gain>[] = [];
  constructor() { FakeContext.latest = this; }
  resume = vi.fn(async () => { this.state = "running"; });
  close = vi.fn(async () => { this.state = "closed"; });
  createGain() {
    const node = gain();
    this.gains.push(node);
    return node;
  }
  createOscillator() {
    const node = oscillator();
    this.oscillators.push(node);
    return node;
  }
}

const frames = new Map<number, FrameRequestCallback>();
const players: DynamicsPerformanceAudio[] = [];
let nextFrame = 0;
const startAt = 10.035;
const noteSeconds = 60 / 112;
const endAt = startAt + 8 * noteSeconds;

function player() {
  const instance = new DynamicsPerformanceAudio();
  players.push(instance);
  return instance;
}

function callbacks() {
  return { onFrame: vi.fn<DynamicsPerformanceCallbacks["onFrame"]>(), onEnd: vi.fn() };
}

function paintAt(time: number, frameTimestamp = 999_999) {
  FakeContext.latest.currentTime = time;
  const pending = [...frames.values()];
  frames.clear();
  pending.forEach((callback) => callback(frameTimestamp));
}

beforeEach(() => {
  frames.clear();
  nextFrame = 0;
  vi.stubGlobal("AudioContext", FakeContext);
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn((id: number) => frames.delete(id)));
});

afterEach(() => {
  players.splice(0).forEach((instance) => instance.dispose());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("dynamics performance audio", () => {
  it.each(DYNAMICS)("plays the same eight pitches and tempo with actual $id master gain", async ({ id, gain: level }) => {
    const audio = player();
    const events = callbacks();
    await audio.play(id, events);
    const context = FakeContext.latest;
    const master = context.gains[0];
    expect(context.oscillators).toHaveLength(8);
    expect(master.connect).toHaveBeenCalledWith(context.destination);
    expect(master.gain.setValueAtTime).toHaveBeenCalledExactlyOnceWith(level, startAt);
    expect(master.gain.linearRampToValueAtTime).not.toHaveBeenCalled();
    context.oscillators.forEach((node, index) => {
      expect(node.type).toBe("triangle");
      expect(node.frequency.setValueAtTime).toHaveBeenCalledExactlyOnceWith(
        440 * 2 ** ((MELODY.midi[index] - 69) / 12), startAt + index * noteSeconds);
      expect(node.start).toHaveBeenCalledExactlyOnceWith(startAt + index * noteSeconds);
      expect(node.stop.mock.calls[0][0]).toBeCloseTo(startAt + (index + 1) * noteSeconds);
      expect(context.gains[index + 1].connect).toHaveBeenCalledWith(master);
    });
    paintAt(startAt + noteSeconds * 2.25);
    expect(events.onFrame).toHaveBeenLastCalledWith({ progress: expect.closeTo(2.25 / 8), activeIndex: 2, gain: level });
    expect(events.onEnd).not.toHaveBeenCalled();
  });

  it.each(["crescendo", "decrescendo"] as const)("schedules %s continuously on the shared master", async (marking) => {
    const audio = player();
    const events = callbacks();
    await audio.play(marking, events);
    const master = FakeContext.latest.gains[0].gain;
    expect(master.setValueAtTime).toHaveBeenCalledWith(dynamicsGainAt(marking, 0), startAt);
    expect(master.linearRampToValueAtTime).toHaveBeenCalledExactlyOnceWith(dynamicsGainAt(marking, 1), endAt);
    for (const progress of [.25, .5, .75]) {
      paintAt(startAt + 8 * noteSeconds * progress);
      expect(events.onFrame.mock.lastCall?.[0].gain).toBeCloseTo(dynamicsGainAt(marking, progress));
      expect(events.onFrame.mock.lastCall?.[0].progress).toBeCloseTo(progress);
    }
  });

  it("changes a live phrase through 60 ms of smoothing, then a fresh curve over the remaining phrase", async () => {
    const audio = player();
    const events = callbacks();
    await audio.play("ff", events);
    const context = FakeContext.latest;
    const master = context.gains[0].gain;
    const now = startAt + noteSeconds * 2;
    paintAt(now);
    audio.setMarking("crescendo");
    expect(master.cancelScheduledValues).toHaveBeenCalledExactlyOnceWith(now);
    expect(master.setValueAtTime).toHaveBeenLastCalledWith(.21, now);
    expect(master.linearRampToValueAtTime.mock.calls).toEqual([[.055, now + .06], [.16, endAt]]);
    paintAt(now + .03);
    expect(events.onFrame.mock.lastCall?.[0].gain).toBeCloseTo((.21 + .055) / 2);
    paintAt(now + .06 + (endAt - now - .06) / 2);
    expect(events.onFrame.mock.lastCall?.[0].gain).toBeCloseTo((.055 + .16) / 2);
    expect(context.oscillators).toHaveLength(8);
    expect(context.oscillators.every((node) => node.frequency.setValueAtTime.mock.calls.length === 1)).toBe(true);
    expect(context.oscillators.every((node) => node.start.mock.calls.length === 1)).toBe(true);
  });

  it("anchors rapid changes at the in-flight gain and keeps a steady selection steady", async () => {
    const audio = player();
    const events = callbacks();
    await audio.play("ff", events);
    const now = startAt + noteSeconds;
    paintAt(now);
    audio.setMarking("p");
    paintAt(now + .03);
    audio.setMarking("f");
    const master = FakeContext.latest.gains[0].gain;
    expect(master.setValueAtTime.mock.lastCall?.[0]).toBeCloseTo((.21 + .055) / 2);
    expect(master.setValueAtTime.mock.lastCall?.[1]).toBeCloseTo(now + .03);
    expect(master.linearRampToValueAtTime).toHaveBeenLastCalledWith(.16, now + .09);
    paintAt(now + .09);
    expect(events.onFrame.mock.lastCall?.[0].gain).toBeCloseTo(.16);
    audio.setMarking("f");
    expect(master.cancelScheduledValues).toHaveBeenCalledTimes(2);
    paintAt(endAt - .1);
    expect(events.onFrame.mock.lastCall?.[0].gain).toBeCloseTo(.16);
  });

  it("uses AudioContext time rather than animation timestamps and ends once with all nodes released", async () => {
    const audio = player();
    const events = callbacks();
    await audio.play("crescendo", events);
    expect(events.onFrame).toHaveBeenLastCalledWith({ progress: 0, activeIndex: -1, gain: .055 });
    paintAt(startAt + noteSeconds * 3.5, 0);
    expect(events.onFrame.mock.lastCall?.[0]).toEqual({ progress: expect.closeTo(3.5 / 8), activeIndex: 3, gain: expect.closeTo(dynamicsGainAt("crescendo", 3.5 / 8)) });
    const staleFrame = [...frames.values()][0];
    paintAt(endAt + .001, 1);
    expect(events.onFrame).toHaveBeenLastCalledWith({ progress: 1, activeIndex: -1, gain: .16 });
    expect(events.onEnd).toHaveBeenCalledOnce();
    expect(frames.size).toBe(0);
    expect(FakeContext.latest.oscillators.every((node) => node.disconnect.mock.calls.length === 1)).toBe(true);
    expect(FakeContext.latest.gains.every((node) => node.disconnect.mock.calls.length === 1)).toBe(true);
    staleFrame(2);
    expect(events.onEnd).toHaveBeenCalledOnce();
  });

  it("releases ended voices and stops pending voices without a stale callback or completion", async () => {
    const audio = player();
    const events = callbacks();
    await audio.play("mf", events);
    const context = FakeContext.latest;
    const staleFrame = [...frames.values()][0];
    context.oscillators[0].onended?.();
    expect(context.oscillators[0].disconnect).toHaveBeenCalledOnce();
    expect(context.gains[1].disconnect).toHaveBeenCalledOnce();
    audio.stop();
    expect(frames.size).toBe(0);
    expect(context.oscillators[0].disconnect).toHaveBeenCalledOnce();
    expect(context.oscillators.slice(1).every((node) => node.stop.mock.calls.length === 2)).toBe(true);
    const paints = events.onFrame.mock.calls.length;
    context.currentTime = endAt + 1;
    staleFrame(5000);
    expect(events.onFrame).toHaveBeenCalledTimes(paints);
    expect(events.onEnd).not.toHaveBeenCalled();
    audio.dispose();
    audio.dispose();
    expect(context.close).toHaveBeenCalledOnce();
  });

  it.each(["stop", "dispose"] as const)("does not schedule sound when %s cancels a suspended resume", async (action) => {
    let finishResume: (() => void) | undefined;
    class SuspendedContext extends FakeContext {
      state = "suspended";
      resume = vi.fn(() => new Promise<void>((resolve) => {
        finishResume = () => { this.state = "running"; resolve(); };
      }));
    }
    vi.stubGlobal("AudioContext", SuspendedContext);
    const audio = player();
    const events = callbacks();
    const pending = audio.play("p", events);
    audio[action]();
    finishResume?.();
    await pending;
    expect(FakeContext.latest.oscillators).toHaveLength(0);
    expect(FakeContext.latest.gains).toHaveLength(0);
    expect(frames.size).toBe(0);
    expect(events.onFrame).not.toHaveBeenCalled();
    expect(events.onEnd).not.toHaveBeenCalled();
    expect(FakeContext.latest.close).toHaveBeenCalledTimes(action === "dispose" ? 1 : 0);
  });

  it("uses the latest choice made while audio permission is resuming", async () => {
    let finishResume: (() => void) | undefined;
    class SuspendedContext extends FakeContext {
      state = "suspended";
      resume = vi.fn(() => new Promise<void>((resolve) => {
        finishResume = () => { this.state = "running"; resolve(); };
      }));
    }
    vi.stubGlobal("AudioContext", SuspendedContext);
    const audio = player();
    const pending = audio.play("pp", callbacks());
    audio.setMarking("ff");
    finishResume?.();
    await pending;
    expect(FakeContext.latest.gains[0].gain.setValueAtTime).toHaveBeenCalledWith(.21, startAt);
  });

  it("rejects an audio resume failure and leaves no frame or sound scheduled", async () => {
    class FailedContext extends FakeContext {
      state = "suspended";
      resume = vi.fn(async () => { throw new Error("audio permission rejected"); });
    }
    vi.stubGlobal("AudioContext", FailedContext);
    const audio = player();
    await expect(audio.play("p", callbacks())).rejects.toThrow("audio permission rejected");
    expect(FakeContext.latest.oscillators).toHaveLength(0);
    expect(frames.size).toBe(0);
  });

  it("cleans up a partially scheduled phrase before rejecting", async () => {
    class FailedScheduleContext extends FakeContext {
      createOscillator() {
        const node = super.createOscillator();
        if (this.oscillators.length === 3) node.start.mockImplementation(() => { throw new Error("audio scheduling failed"); });
        return node;
      }
    }
    vi.stubGlobal("AudioContext", FailedScheduleContext);
    await expect(player().play("p", callbacks())).rejects.toThrow("audio scheduling failed");
    expect(FakeContext.latest.oscillators).toHaveLength(3);
    expect(FakeContext.latest.oscillators.every((node) => node.disconnect.mock.calls.length === 1)).toBe(true);
    expect(FakeContext.latest.gains.every((node) => node.disconnect.mock.calls.length === 1)).toBe(true);
    expect(frames.size).toBe(0);
  });
});

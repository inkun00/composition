import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LearningAudio } from "./learningAudio";

function fakeOscillator() {
  return {
    type: "sine", frequency: { setValueAtTime: vi.fn() },
    connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null
  };
}

function fakeEnvelope() {
  return {
    gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
    connect: vi.fn(), disconnect: vi.fn()
  };
}

class FakeContext {
  static latest: FakeContext;
  state = "running";
  currentTime = 10;
  destination = {};
  oscillators: ReturnType<typeof fakeOscillator>[] = [];
  envelopes: ReturnType<typeof fakeEnvelope>[] = [];
  constructor() { FakeContext.latest = this; }
  resume = vi.fn(async () => { this.state = "running"; });
  close = vi.fn(async () => { this.state = "closed"; });
  createOscillator() {
    const node = fakeOscillator();
    this.oscillators.push(node);
    return node;
  }
  createGain() {
    const node = fakeEnvelope();
    this.envelopes.push(node);
    return node;
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("AudioContext", FakeContext);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("learning sound scheduler", () => {
  it("schedules held tones on the audio clock and keeps rests silent", async () => {
    const player = new LearningAudio();
    const step = vi.fn();
    const end = vi.fn();
    await player.play({ notes: ["half", "quarter-rest", "eighth", "eighth"], bpm: 60,
      beatsPerBar: 4, onStep: step, onEnd: end });
    const context = FakeContext.latest;
    // Three pitched sounds and four pulse clicks; no oscillator for the rest.
    expect(context.oscillators).toHaveLength(7);
    expect(context.oscillators[0].start).toHaveBeenCalledWith(10.04);
    expect(context.oscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(392, 10.04);
    expect(context.oscillators[0].stop).toHaveBeenCalledWith(12.04);
    expect(context.oscillators[1].start).toHaveBeenCalledWith(13.04);
    await vi.advanceTimersByTimeAsync(2500);
    expect(step).toHaveBeenCalledWith(1, 2);
    expect(end).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1600);
    expect(end).toHaveBeenCalledOnce();
    player.dispose();
  });

  it("cancels every callback and disconnects sounds when stopped", async () => {
    const player = new LearningAudio();
    const step = vi.fn();
    const end = vi.fn();
    await player.play({ notes: ["whole"], bpm: 60, onStep: step, onEnd: end });
    player.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(step).not.toHaveBeenCalled();
    expect(end).not.toHaveBeenCalled();
    expect(FakeContext.latest.oscillators.every((node) => node.disconnect.mock.calls.length > 0)).toBe(true);
    player.dispose();
    expect(FakeContext.latest.close).toHaveBeenCalledOnce();
  });

  it("rejects invalid tempo instead of reporting a successful simulation", async () => {
    const player = new LearningAudio();
    await expect(player.play({ notes: ["half"], bpm: 0 })).rejects.toThrow();
    player.dispose();
  });

  it("keeps a plain rest silent while its beat and end callbacks still run", async () => {
    const player = new LearningAudio();
    const step = vi.fn();
    const end = vi.fn();
    await player.play({ notes: ["quarter-rest"], bpm: 60, onStep: step, onEnd: end });
    expect(FakeContext.latest.oscillators).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1100);
    expect(step).toHaveBeenCalledWith(0, 0);
    expect(step).toHaveBeenCalledWith(0, 0.5);
    expect(end).toHaveBeenCalledOnce();
    player.dispose();
  });

  it("does not schedule stale playback when a delayed audio resume finishes after stop", async () => {
    const player = new LearningAudio();
    await player.play({ notes: ["quarter"], bpm: 60 });
    const context = FakeContext.latest;
    context.state = "suspended";
    let finishResume!: () => void;
    context.resume.mockImplementation(() => new Promise<void>((resolve) => { finishResume = resolve; }));
    const step = vi.fn();
    const pending = player.play({ notes: ["whole"], bpm: 60, onStep: step });
    player.stop();
    context.state = "running";
    finishResume();
    await pending;
    await vi.advanceTimersByTimeAsync(5000);
    expect(context.oscillators).toHaveLength(1);
    expect(step).not.toHaveBeenCalled();
    player.dispose();
  });

  it("changes loudness in the requested direction without changing timing", async () => {
    const player = new LearningAudio();
    const notes = ["quarter", "quarter", "quarter", "quarter"] as const;
    await player.play({ notes, bpm: 120, crescendo: true });
    const context = FakeContext.latest;
    const rising = context.envelopes.slice(0, 4).map((node) => node.gain.linearRampToValueAtTime.mock.calls[0][0]);
    expect(rising[0]).toBeLessThan(rising[1]);
    expect(rising[1]).toBeLessThan(rising[2]);
    expect(rising[2]).toBeLessThan(rising[3]);
    const firstStarts = context.oscillators.slice(0, 4).map((node) => node.start.mock.calls[0][0]);
    await player.play({ notes, bpm: 120, decrescendo: true });
    const falling = context.envelopes.slice(4, 8).map((node) => node.gain.linearRampToValueAtTime.mock.calls[0][0]);
    expect(falling[0]).toBeGreaterThan(falling[3]);
    expect(context.oscillators.slice(4, 8).map((node) => node.start.mock.calls[0][0])).toEqual(firstStarts);
    player.dispose();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrainAudio } from "./trainAudio";

function oscillatorMock() {
  return { frequency: { setValueAtTime: vi.fn() }, type: "sine", start: vi.fn(), stop: vi.fn(),
    connect: vi.fn(), disconnect: vi.fn(), onended: null };
}

class FakeContext {
  static latest: FakeContext;
  state = "running";
  currentTime = 10;
  destination = {};
  oscillators: ReturnType<typeof oscillatorMock>[] = [];
  constructor() { FakeContext.latest = this; }
  resume = vi.fn(async () => { this.state = "running"; });
  close = vi.fn(async () => { this.state = "closed"; });
  getOutputTimestamp = () => ({ contextTime: 10, performanceTime: 1000 });
  createOscillator() {
    const node = oscillatorMock();
    this.oscillators.push(node);
    return node;
  }
  createGain() {
    return { gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() };
  }
}

beforeEach(() => vi.stubGlobal("AudioContext", FakeContext));
afterEach(() => vi.unstubAllGlobals());

describe("train audio clock", () => {
  it("anchors the four-beat count-in and performance to the device output clock", async () => {
    const audio = new TrainAudio();
    const schedule = await audio.start(["half", "quarter", "eighth", "eighth"], 80, false);
    expect(schedule?.playAt).toBeCloseTo(4080);
    expect(schedule?.endAt).toBeCloseTo(7080);
    expect(FakeContext.latest.oscillators).toHaveLength(8);
    // Performance mode provides clicks, without playing the target tune for the learner.
    expect(FakeContext.latest.oscillators.every((node) => node.type === "sine")).toBe(true);
    audio.dispose();
  });

  it("holds the demo half note for two beats and emits no pitched sound for a rest", async () => {
    const audio = new TrainAudio();
    await audio.start(["half", "quarter-rest", "quarter"], 80, true);
    const notes = FakeContext.latest.oscillators.filter((node) => node.type === "triangle");
    expect(notes).toHaveLength(2);
    expect(notes[0].start).toHaveBeenCalledWith(10.08);
    expect(notes[0].stop).toHaveBeenCalledWith(11.58);
    expect(notes[1].start).toHaveBeenCalledWith(12.33);
    audio.stop();
    expect(FakeContext.latest.oscillators.every((node) => node.disconnect.mock.calls.length)).toBe(true);
    audio.dispose();
  });

  it("cancels a pending resume so a hidden screen never schedules stale sound", async () => {
    let finishResume: (() => void) | undefined;
    class SuspendedContext extends FakeContext {
      state = "suspended";
      resume = vi.fn(() => new Promise<void>((resolve) => { finishResume = () => { this.state = "running"; resolve(); }; }));
    }
    vi.stubGlobal("AudioContext", SuspendedContext);
    const audio = new TrainAudio();
    const pending = audio.start(["quarter"], 80, false);
    audio.stop();
    finishResume?.();
    expect(await pending).toBeNull();
    expect(FakeContext.latest.oscillators).toHaveLength(0);
    audio.dispose();
  });
});

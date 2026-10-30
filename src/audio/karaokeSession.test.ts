import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AccompanimentOptions, PlaybackMeasure } from "./accompanimentScore";
import type { PreparedKaraokeAudio } from "./karaokePreparation";
import type { KaraokeRecordingCallbacks } from "./karaokeTypes";
import { runKaraokePractice, runKaraokeRecording } from "./karaokeSession";

const mocks = vi.hoisted(() => ({
  prepare: vi.fn(), capture: vi.fn(), findMic: vi.fn(), forceMic: vi.fn(),
  monitor: vi.fn(), stopMonitor: vi.fn(), mix: vi.fn(), pcmBuffer: vi.fn()
}));
vi.mock("./karaokePreparation", () => ({ prepareKaraokeAudio: mocks.prepare }));
vi.mock("./pcmRecorder", () => ({
  startPcmStreamCapture: mocks.capture, findBuiltInMicrophoneDeviceId: mocks.findMic,
  forceBuiltInMicrophoneStream: mocks.forceMic, createAudioBufferFromPcm: mocks.pcmBuffer,
  encodeAudioBufferToWav: () => new Blob(["wav"], { type: "audio/wav" })
}));
vi.mock("./audioExport", () => ({ renderKaraokePreviewMix: mocks.mix }));
vi.mock("./vocalCapture", async (importActual) => ({
  ...await importActual<typeof import("./vocalCapture")>(), createVocalMonitor: mocks.monitor
}));

function param() {
  return { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
}

class NodeMock {
  gain = param();
  threshold = param();
  knee = param();
  ratio = param();
  attack = param();
  release = param();
  buffer: unknown;
  loop = false;
  connect = vi.fn((destination: NodeMock) => destination);
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

class ContextMock extends EventTarget {
  currentTime = 0;
  state = "running";
  sampleRate = 48000;
  destination = new NodeMock();
  sources: NodeMock[] = [];
  gains: NodeMock[] = [];
  createBufferSource = vi.fn(() => {
    const node = new NodeMock();
    this.sources.push(node);
    return node;
  });
  createGain = vi.fn(() => {
    const node = new NodeMock();
    this.gains.push(node);
    return node;
  });
  createDynamicsCompressor = vi.fn(() => new NodeMock());
  createBuffer = vi.fn(() => ({ tag: "keep-alive" }));
  createMediaStreamSource = vi.fn(() => new NodeMock());
  createOscillator = vi.fn(() => { throw new Error("No live instrument synthesis is allowed"); });
  resume = vi.fn(async () => { this.state = "running"; });
  close = vi.fn(async () => { this.state = "closed"; this.dispatchEvent(new Event("statechange")); });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const measures: readonly PlaybackMeasure[] = [{
  harmony: "home", chords: ["C"], measureIndex: 0,
  notes: [60, 62, 64, 67].map((pitch, index) => ({
    id: `note-${index}`, pitch, lyric: "노래해요"[index], duration: { numerator: 1, denominator: 1 }
  }))
}];
const accompaniment: AccompanimentOptions = { styleId: "folk",
  instrumentIds: ["piano", "guitar", "violin", "flute", "trumpet", "xylophone"],
  meter: { beats: 4, beatUnit: 4 } };
const countIn = { beats: 4, unitBeats: 1 };
const backing = { tag: "all-six-instruments-and-beats" } as unknown as AudioBuffer;
const guide = { tag: "isolated-guide" } as unknown as AudioBuffer;
const audio: PreparedKaraokeAudio = {
  backing, guide, introSeconds: 8, songSeconds: 2, outroSeconds: 8, durationSeconds: 18.8
};
let context: ContextMock;
let getUserMedia: ReturnType<typeof vi.fn>;
let trackStop: ReturnType<typeof vi.fn>;
let stream: MediaStream;
let captureStops: ReturnType<typeof vi.fn>[];

function callbacks(): KaraokeRecordingCallbacks {
  return { onPhase: vi.fn(), onCount: vi.fn(), onHighlight: vi.fn(), onStatus: vi.fn(), onInputLevel: vi.fn() };
}

function practice(events: KaraokeRecordingCallbacks, signal?: AbortSignal) {
  return runKaraokePractice(context as unknown as AudioContext, measures, "piano", 120,
    accompaniment, events, countIn, signal);
}

function record(events: KaraokeRecordingCallbacks, signal?: AbortSignal) {
  return runKaraokeRecording(context as unknown as AudioContext, measures, "piano", 120,
    accompaniment, events, countIn, signal);
}

async function drain() { for (let count = 0; count < 12; count += 1) await Promise.resolve(); }

async function finish(start: number) {
  context.currentTime = start + audio.durationSeconds + .001;
  await vi.advanceTimersByTimeAsync(30);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  context = new ContextMock();
  captureStops = [];
  trackStop = vi.fn();
  stream = { getTracks: () => [{ stop: trackStop }] } as unknown as MediaStream;
  getUserMedia = vi.fn(async () => stream);
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  mocks.prepare.mockResolvedValue(audio);
  mocks.findMic.mockResolvedValue("built-in");
  mocks.forceMic.mockImplementation(async (value: MediaStream) => ({ stream: value }));
  mocks.monitor.mockReturnValue(mocks.stopMonitor);
  mocks.capture.mockImplementation(async () => {
    const pcm = new Float32Array([captureStops.length + 1, .25]);
    const stop = vi.fn(async () => pcm);
    captureStops.push(stop);
    return { stop };
  });
  mocks.pcmBuffer.mockImplementation((_context, pcm: Float32Array, channels: number) => ({ pcm, numberOfChannels: channels }));
  mocks.mix.mockResolvedValue({ blob: new Blob(["mp3"], { type: "audio/mpeg" }), audioBuffer: { tag: "mixed-recording" } });
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("prepared karaoke practice", () => {
  it("starts only one backing and one guide together after preparation, independent of instrument count", async () => {
    const preparation = deferred<PreparedKaraokeAudio>();
    mocks.prepare.mockReturnValueOnce(preparation.promise);
    const events = callbacks();
    const playing = practice(events);
    expect(mocks.prepare.mock.calls[0][4]).toMatchObject({ mode: "practice", sampleRate: 48000 });
    expect(context.sources).toHaveLength(0);
    context.currentTime = 11;
    preparation.resolve(audio);
    await drain();
    expect(context.sources.map((source) => source.buffer)).toEqual([backing, guide]);
    expect(context.sources.map((source) => source.start.mock.calls)).toEqual([[[11.35]], [[11.35]]]);
    expect(context.createOscillator).not.toHaveBeenCalled();
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(events.onPhase).not.toHaveBeenCalled();
    context.currentTime = 11.35 + audio.introSeconds;
    await vi.advanceTimersByTimeAsync(30);
    expect(events.onPhase).toHaveBeenLastCalledWith("song");
    expect(events.onHighlight).toHaveBeenLastCalledWith({ section: "song", measureIndex: 0, noteId: "note-0" });
    await vi.advanceTimersByTimeAsync(5000);
    expect(events.onPhase).toHaveBeenLastCalledWith("song");
    await finish(11.35);
    expect(await playing).toBe(audio.durationSeconds);
    expect(events.onPhase).toHaveBeenLastCalledWith("done");
    expect(context.close).toHaveBeenCalledOnce();
    expect(context.sources.every((source) => source.stop.mock.calls.length > 0 && source.disconnect.mock.calls.length > 0)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not allocate a guide source when a prepared session has no guide", async () => {
    mocks.prepare.mockResolvedValueOnce({ ...audio, guide: null });
    const playing = practice(callbacks());
    await drain();
    expect(context.sources).toHaveLength(1);
    expect(context.sources[0].buffer).toBe(backing);
    await finish(.35);
    await playing;
  });

  it("does no preparation for a pre-aborted session and cleans up cancellation during preparation", async () => {
    const aborted = new AbortController();
    aborted.abort();
    expect(await practice(callbacks(), aborted.signal)).toBeNull();
    expect(mocks.prepare).not.toHaveBeenCalled();
    context = new ContextMock();
    const preparation = deferred<PreparedKaraokeAudio>();
    mocks.prepare.mockReturnValueOnce(preparation.promise);
    const control = new AbortController();
    const playing = practice(callbacks(), control.signal);
    const preparationSignal = mocks.prepare.mock.calls[0][4].signal as AbortSignal;
    control.abort();
    expect(preparationSignal.aborted).toBe(true);
    preparation.resolve(audio);
    expect(await playing).toBeNull();
    expect(context.sources).toHaveLength(0);
    expect(context.state).toBe("closed");
  });

  it("active cancellation stops the audio and clock without a later completion callback", async () => {
    const control = new AbortController();
    const events = callbacks();
    const playing = practice(events, control.signal);
    await drain();
    control.abort();
    expect(await playing).toBeNull();
    expect(context.state).toBe("closed");
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(60000);
    expect(events.onPhase).not.toHaveBeenCalledWith("done");
    expect(context.sources.every((source) => source.stop.mock.calls.length > 0)).toBe(true);
  });
});

describe("prepared karaoke recording", () => {
  it("prepares before requesting the microphone and captures post-ducking backing without the guide", async () => {
    const preparation = deferred<PreparedKaraokeAudio>();
    mocks.prepare.mockReturnValueOnce(preparation.promise);
    const events = callbacks();
    const recording = record(events);
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(context.sources.every((source) => source.loop)).toBe(true);
    context.currentTime = 17;
    preparation.resolve(audio);
    await drain();
    const playback = context.sources.filter((source) => !source.loop);
    expect(playback.map((source) => source.buffer)).toEqual([backing, guide]);
    expect(playback.map((source) => source.start.mock.calls)).toEqual([[[17.6]], [[17.6]]]);
    const master = playback[0].connect.mock.calls[0][0];
    const guideBus = playback[1].connect.mock.calls[0][0];
    const vocal = context.createMediaStreamSource.mock.results[0].value.connect.mock.calls[0][0];
    expect(mocks.monitor.mock.calls[0][2]).toBe(master);
    expect(mocks.capture.mock.calls.map((call) => call[1])).toEqual([vocal, master]);
    expect(mocks.capture.mock.calls.every((call) => call[1] !== guideBus)).toBe(true);
    expect(guideBus.connect).toHaveBeenCalledWith(context.destination);
    expect(vocal.connect).not.toHaveBeenCalled();
    master.gain.value = .63;
    expect(mocks.capture.mock.calls[1][1].gain.value).toBe(.63);
    await finish(17.6);
    const result = await recording;
    expect(result?.introSeconds).toBe(8.6);
    expect(result?.blob.type).toBe("audio/mpeg");
    expect(mocks.pcmBuffer.mock.calls.map((call) => call[1])).toEqual([
      new Float32Array([1, .25]), new Float32Array([2, .25])
    ]);
    expect(mocks.mix).toHaveBeenCalledWith(result?.vocalAudioBuffer, result?.backingAudioBuffer, 1, 8.6, 8);
    expect(result?.backingAudioBuffer).not.toBe(backing);
    expect(captureStops.every((stop) => stop.mock.calls.length > 0)).toBe(true);
    expect(trackStop).toHaveBeenCalled();
    expect(mocks.stopMonitor).toHaveBeenCalledOnce();
    expect(context.sources.every((source) => source.stop.mock.calls.length > 0 && source.disconnect.mock.calls.length > 0)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("choir mode prepares without a guide even if a personal guide option was previously selected", async () => {
    mocks.prepare.mockResolvedValueOnce({ ...audio, guide: null });
    const recording = record({ ...callbacks(), recordingMode: "choir", guideMelodyMode: "soft" });
    await drain();
    expect(mocks.prepare.mock.calls[0][4]).toMatchObject({ mode: "recording", guideMode: "off", sampleRate: 48000 });
    expect(context.sources.filter((source) => !source.loop)).toHaveLength(1);
    await finish(.6);
    await recording;
  });

  it("does not request a microphone or prepare audio for a pre-aborted request", async () => {
    const control = new AbortController();
    control.abort();
    await expect(record(callbacks(), control.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(context.sources).toHaveLength(0);
    expect(context.state).toBe("closed");
  });

  it("cancels preparation before the microphone prompt or backing playback", async () => {
    const preparation = deferred<PreparedKaraokeAudio>();
    mocks.prepare.mockReturnValueOnce(preparation.promise);
    const control = new AbortController();
    const recording = record(callbacks(), control.signal);
    const failure = expect(recording).rejects.toMatchObject({ name: "AbortError" });
    const preparationSignal = mocks.prepare.mock.calls[0][4].signal as AbortSignal;
    control.abort();
    expect(preparationSignal.aborted).toBe(true);
    preparation.resolve(audio);
    await failure;
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(mocks.capture).not.toHaveBeenCalled();
    expect(context.sources.filter((source) => !source.loop)).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("active cancellation releases microphone, capture, source and clock resources without encoding", async () => {
    const control = new AbortController();
    const recording = record(callbacks(), control.signal);
    const failure = expect(recording).rejects.toMatchObject({ name: "AbortError" });
    await drain();
    expect(mocks.capture).toHaveBeenCalledTimes(2);
    control.abort();
    await failure;
    expect(trackStop).toHaveBeenCalled();
    expect(captureStops.every((stop) => stop.mock.calls.length > 0)).toBe(true);
    expect(mocks.mix).not.toHaveBeenCalled();
    expect(mocks.stopMonitor).toHaveBeenCalledOnce();
    expect(context.state).toBe("closed");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("settles cancellation while permission is pending and stops a microphone granted afterwards", async () => {
    const permission = deferred<MediaStream>();
    getUserMedia.mockReturnValueOnce(permission.promise);
    const control = new AbortController();
    const recording = record(callbacks(), control.signal);
    const failure = expect(recording).rejects.toMatchObject({ name: "AbortError" });
    await drain();
    expect(getUserMedia).toHaveBeenCalledOnce();
    control.abort();
    // Cancellation settles without waiting for the browser's permission prompt.
    await failure;
    expect(context.state).toBe("closed");
    expect(mocks.capture).not.toHaveBeenCalled();
    expect(trackStop).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    permission.resolve(stream);
    await drain();
    expect(trackStop).toHaveBeenCalledOnce();
    expect(mocks.forceMic).not.toHaveBeenCalled();
    expect(mocks.capture).not.toHaveBeenCalled();
    expect(context.createMediaStreamSource).not.toHaveBeenCalled();
  });

  it("stops both current and late replacement streams when canceled during microphone switching", async () => {
    const switching = deferred<{ stream: MediaStream }>();
    mocks.forceMic.mockReturnValueOnce(switching.promise);
    const replacementStop = vi.fn();
    const replacement = { getTracks: () => [{ stop: replacementStop }] } as unknown as MediaStream;
    const control = new AbortController();
    const recording = record(callbacks(), control.signal);
    const failure = expect(recording).rejects.toMatchObject({ name: "AbortError" });
    await drain();
    expect(mocks.forceMic).toHaveBeenCalledOnce();
    control.abort();
    await failure;
    expect(trackStop).toHaveBeenCalled();
    expect(replacementStop).not.toHaveBeenCalled();
    expect(context.state).toBe("closed");
    expect(vi.getTimerCount()).toBe(0);
    switching.resolve({ stream: replacement });
    await drain();
    expect(replacementStop).toHaveBeenCalledOnce();
    expect(mocks.capture).not.toHaveBeenCalled();
    expect(context.createMediaStreamSource).not.toHaveBeenCalled();
  });

  it("microphone denial closes the preparation context and its keep-alive source", async () => {
    getUserMedia.mockRejectedValue(new DOMException("Permission denied", "NotAllowedError"));
    await expect(record(callbacks())).rejects.toMatchObject({ name: "NotAllowedError" });
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(mocks.capture).not.toHaveBeenCalled();
    expect(context.sources).toHaveLength(1);
    expect(context.sources[0].stop).toHaveBeenCalled();
    expect(context.state).toBe("closed");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("failure creating the second capture still stops the first capture, microphone and monitor", async () => {
    mocks.capture.mockImplementationOnce(async () => {
      const stop = vi.fn(async () => new Float32Array([.25]));
      captureStops.push(stop);
      return { stop };
    }).mockRejectedValueOnce(new Error("capture unavailable"));
    await expect(record(callbacks())).rejects.toThrow("capture unavailable");
    expect(captureStops[0]).toHaveBeenCalled();
    expect(trackStop).toHaveBeenCalled();
    expect(mocks.stopMonitor).toHaveBeenCalled();
    expect(context.sources.filter((source) => !source.loop)).toHaveLength(0);
    expect(context.state).toBe("closed");
    expect(vi.getTimerCount()).toBe(0);
  });
});

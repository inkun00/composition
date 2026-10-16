import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadAccompanimentLayers, releaseAccompanimentRuntime, setAccompanimentTrackMix } from "./accompanimentRuntime";
import type { AccompanimentOptions } from "./accompanimentScore";

const { loadSample, releaseSample, preloadBeats } = vi.hoisted(() => ({
  loadSample: vi.fn(), releaseSample: vi.fn(), preloadBeats: vi.fn(async () => {})
}));
vi.mock("./samplePlayer", () => ({ loadSampleInstrument: loadSample, releaseSampleInstrument: releaseSample }));
vi.mock("./beatSamples", () => ({ preloadBeatSamples: preloadBeats }));

class NodeMock {
  gain = { value: 1 };
  fftSize = 1024;
  signal = 0;
  connect = vi.fn((destination: NodeMock) => destination);
  disconnect = vi.fn();
  getFloatTimeDomainData = vi.fn((buffer: Float32Array) => buffer.fill(this.signal));
}

class ContextMock extends EventTarget {
  state = "running";
  destination = new NodeMock();
  analysers: NodeMock[] = [];
  createGain = vi.fn(() => new NodeMock());
  createAnalyser = vi.fn(() => {
    const analyser = new NodeMock();
    this.analysers.push(analyser);
    return analyser;
  });
}

let context: BaseAudioContext;
let mock: ContextMock;
const options: AccompanimentOptions = { styleId: "arpeggio", instrumentIds: ["acoustic_grand_piano", "acoustic_bass"] };

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mock = new ContextMock();
  context = mock as unknown as AudioContext;
  loadSample.mockImplementation(async (_context, _destination, id: string) => ({ id }));
});

afterEach(() => {
  releaseAccompanimentRuntime(context);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("반주 악기별 실제 오디오 버스", () => {
  it("샘플의 출력이 개별 gain→분석기→master로 연결되고 음량 변경이 같은 버스에 즉시 적용된다", async () => {
    const tracks = await loadAccompanimentLayers(context, mock.destination as unknown as AudioNode, options);
    expect(loadSample.mock.calls.map((call) => call[1])).toEqual(tracks.map((track) => track.destination));
    const initialGain = tracks[0].destination.gain.value;
    setAccompanimentTrackMix({ acoustic_grand_piano: { volume: 50, muted: false } });
    expect(tracks[0].destination.gain.value).toBe(initialGain / 2);
    setAccompanimentTrackMix({ acoustic_grand_piano: { volume: 50, muted: true } });
    expect(tracks[0].destination.gain.value).toBe(0);
    setAccompanimentTrackMix({ acoustic_grand_piano: { volume: 100, muted: false } });
    expect(tracks[0].destination.gain.value).toBe(initialGain);
    expect(mock.analysers.every((analyser) => analyser.connect.mock.calls[0][0] === mock.destination)).toBe(true);
  });

  it("단독 듣기는 선택 악기의 음소거를 해제하고 다른 악기 버스를 잠근다", async () => {
    const tracks = await loadAccompanimentLayers(context, mock.destination as unknown as AudioNode, {
      ...options, soloInstrumentId: "acoustic_bass", trackMix: { acoustic_bass: { volume: 120, muted: true } }
    });
    expect(tracks[0].destination.gain.value).toBe(0);
    expect(tracks[1].destination.gain.value).toBeGreaterThan(0);
    expect(tracks[1].muted).toBe(false);
  });

  it("샘플 준비와 실제 측정 신호를 구분하고 일시정지·종료 시 계측을 해제한다", async () => {
    const states = vi.fn();
    await loadAccompanimentLayers(context, mock.destination as unknown as AudioNode, { ...options, onTrackState: states });
    expect(states).toHaveBeenCalledWith(expect.objectContaining({ status: "loading", level: 0 }));
    expect(states).toHaveBeenCalledWith(expect.objectContaining({ status: "ready", level: 0 }));
    expect(states.mock.calls.some(([state]) => state.status === "playing")).toBe(false);
    mock.analysers[0].signal = .04;
    vi.advanceTimersByTime(80);
    expect(states).toHaveBeenCalledWith(expect.objectContaining({ instrumentId: "acoustic_grand_piano", status: "playing", level: expect.closeTo(.2) }));
    mock.state = "suspended";
    mock.dispatchEvent(new Event("statechange"));
    expect(states).toHaveBeenLastCalledWith(expect.objectContaining({ instrumentId: "acoustic_grand_piano", status: "rest", level: 0 }));
    expect(vi.getTimerCount()).toBe(0);
    mock.state = "running";
    mock.dispatchEvent(new Event("statechange"));
    expect(vi.getTimerCount()).toBe(1);
    releaseAccompanimentRuntime(context);
    expect(vi.getTimerCount()).toBe(0);
    expect(mock.analysers.every((analyser) => analyser.disconnect.mock.calls.length === 1)).toBe(true);
    expect(states).toHaveBeenLastCalledWith(expect.objectContaining({ status: "ready", level: 0 }));
  });

  it("실패한 악기는 한 번 재시도 후 오류를 알리고 나머지 샘플을 계속 사용한다", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const states = vi.fn();
    loadSample.mockImplementation(async (_context, _destination, id: string) => {
      if (id === "acoustic_grand_piano") throw new Error("unavailable");
      return { id };
    });
    const tracks = await loadAccompanimentLayers(context, mock.destination as unknown as AudioNode, { ...options, onTrackState: states });
    expect(loadSample.mock.calls.filter((call) => call[2] === "acoustic_grand_piano")).toHaveLength(2);
    expect(tracks[0].sample).toBe(null);
    expect(tracks[1].sample).not.toBe(null);
    expect(states).toHaveBeenCalledWith(expect.objectContaining({ instrumentId: "acoustic_grand_piano", status: "error", message: expect.any(String) }));
    releaseAccompanimentRuntime(context);
    expect(states.mock.calls.filter(([state]) => state.instrumentId === "acoustic_grand_piano").at(-1)?.[0].status).toBe("error");
    vi.restoreAllMocks();
  });

  it("드럼 준비 중 정지하면 뒤늦게 오디오 버스나 준비 중 상태를 생성하지 않는다", async () => {
    let finishPreload = () => {};
    preloadBeats.mockImplementationOnce(() => new Promise<void>((resolve) => { finishPreload = resolve; }));
    const states = vi.fn();
    const preparation = loadAccompanimentLayers(context, mock.destination as unknown as AudioNode, {
      ...options, onTrackState: states,
      beatPattern: [{ id: "kick", instrumentId: "kick", offsetBeats: 0, measureIndex: 0 }]
    });
    releaseAccompanimentRuntime(context);
    finishPreload();
    expect(await preparation).toEqual([]);
    expect(mock.createGain).not.toHaveBeenCalled();
    expect(states).not.toHaveBeenCalled();
  });

  it("저장 중인 오프라인 반주에는 다른 화면의 실시간 음량 변경을 적용하지 않는다", async () => {
    vi.stubGlobal("OfflineAudioContext", ContextMock);
    const tracks = await loadAccompanimentLayers(context, mock.destination as unknown as AudioNode, options);
    const gain = tracks[0].destination.gain.value;
    setAccompanimentTrackMix({ acoustic_grand_piano: { volume: 0, muted: true } });
    expect(tracks[0].destination.gain.value).toBe(gain);
  });

  it("응답 없는 샘플 준비도 제한 시간 후 새 플레이어로 재시도한다", async () => {
    loadSample.mockImplementationOnce(() => new Promise(() => {}));
    const states = vi.fn();
    const preparation = loadAccompanimentLayers(context, mock.destination as unknown as AudioNode,
      { ...options, instrumentIds: ["acoustic_grand_piano"], onTrackState: states });
    await vi.advanceTimersByTimeAsync(8001);
    const tracks = await preparation;
    expect(loadSample).toHaveBeenCalledTimes(2);
    expect(releaseSample).toHaveBeenCalledWith(context, tracks[0].destination, "acoustic_grand_piano");
    expect(tracks[0].sample).not.toBe(null);
    expect(states).toHaveBeenCalledWith(expect.objectContaining({ status: "loading", message: expect.any(String) }));
  });
});

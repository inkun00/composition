// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rational } from "../music/rational";
import { buildPracticeTimeline, type PracticeAudioInput, type PracticeRenderedAudio } from "./practiceAudio";
import { buildPracticeAudioPlan } from "./practiceAudioTimeline";
import { usePracticeAudio } from "./usePracticeAudio";

const mocks = vi.hoisted(() => ({ render: vi.fn(), encode: vi.fn(), mp4: vi.fn() }));
vi.mock("./practiceAudio", async (importActual) => ({
  ...await importActual<typeof import("./practiceAudio")>(),
  renderPracticeAudio: mocks.render,
  encodePracticeMp3: mocks.encode,
  exportPracticeMp4: mocks.mp4
}));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const input: PracticeAudioInput = {
  measures: [{ notes: [
    { id: "a", pitch: 60, duration: rational(1), lyric: "봄" },
    { id: "b", pitch: 72, duration: rational(1), lyric: "날" }
  ] }],
  bpm: 120, melodyInstrumentId: "flute", rhythmInstrumentId: "piano", step: "melody", title: "봄날"
};
const rendered: PracticeRenderedAudio = {
  buffer: { duration: 1 } as AudioBuffer,
  timeline: buildPracticeTimeline(input),
  usedFallback: false
};

class AudioContextMock {
  static instances: AudioContextMock[] = [];
  currentTime = 0;
  state = "running";
  destination = {};
  source = {
    buffer: null,
    onended: null as (() => void) | null,
    connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn()
  };
  resume = vi.fn(async () => undefined);
  close = vi.fn(async () => { this.state = "closed"; });
  createBufferSource = vi.fn(() => this.source);
  constructor() { AudioContextMock.instances.push(this); }
}

let container: HTMLDivElement;
let root: Root;
let current: ReturnType<typeof usePracticeAudio>;
let isUnmounted: boolean;
let click: ReturnType<typeof vi.spyOn>;
const createdUrl = vi.fn();
const revokedUrl = vi.fn();
let frames: FrameRequestCallback[];

function Harness({ settings }: Readonly<{ settings: PracticeAudioInput }>) {
  current = usePracticeAudio(settings);
  return null;
}

beforeEach(async () => {
  vi.clearAllMocks();
  AudioContextMock.instances = [];
  frames = [];
  vi.stubGlobal("AudioContext", AudioContextMock);
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => { frames.push(callback); return frames.length; }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  createdUrl.mockReturnValue("blob:practice-download");
  Object.defineProperty(URL, "createObjectURL", { value: createdUrl, configurable: true });
  Object.defineProperty(URL, "revokeObjectURL", { value: revokedUrl, configurable: true });
  click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  mocks.render.mockResolvedValue(rendered);
  mocks.encode.mockResolvedValue(new Blob(["mp3"], { type: "audio/mpeg" }));
  mocks.mp4.mockResolvedValue(new Blob(["mp4"], { type: "video/mp4" }));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  isUnmounted = false;
  await act(async () => root.render(<Harness settings={input} />));
});

afterEach(() => {
  if (!isUnmounted) act(() => root.unmount());
  container.remove();
  click.mockRestore();
  delete (URL as unknown as Record<string, unknown>).createObjectURL;
  delete (URL as unknown as Record<string, unknown>).revokeObjectURL;
  vi.unstubAllGlobals();
});

describe("연습 미리듣기와 파일 저장", () => {
  it("새로 시작할 때는 연주가 끝난 뒤의 저장 안내·진행률·이전 소리 캐시도 비운다", async () => {
    await act(async () => current.save("mp3"));
    expect(current.status).toContain("MP3 파일을 저장했어요");
    expect(current.progress).toBe(100);
    expect(mocks.render).toHaveBeenCalledOnce();

    act(() => current.stop());

    expect(current.status).toBe("");
    expect(current.progress).toBe(0);
    await act(async () => current.preview());
    expect(mocks.render).toHaveBeenCalledTimes(2);
  });

  it("가락 단계에서는 쓰지 않는 리듬 악기를 바꿔도 가락 렌더 버퍼를 재사용한다", async () => {
    const settings: PracticeAudioInput = { ...input, mode: "melody" };
    await act(async () => root.render(<Harness settings={settings} />));
    await act(async () => current.preview());
    act(() => current.stop());
    const combined: PracticeAudioInput = { ...settings, mode: "rhythm-melody" };
    await act(async () => root.render(<Harness settings={combined} />));
    await act(async () => current.preview());
    act(() => current.stop());
    await act(async () => root.render(<Harness settings={{ ...combined, rhythmInstrumentId: "beat:woodblock" }} />));
    await act(async () => current.preview());
    expect(mocks.render).toHaveBeenCalledTimes(2);
    expect(mocks.render.mock.calls.map((args) => args[0].mode)).toEqual(["melody", "rhythm-melody"]);
    expect(current.status).toContain("가락을 듣고 있어요");
  });

  it("리듬을 만든 뒤 가락 단계에서는 가락만 들어 있는 같은 버퍼를 듣고 MP3·MP4에 저장한다", async () => {
    const settings: PracticeAudioInput = {
      ...input, mode: "rhythm-melody", rhythmInstrumentId: "beat:woodblock",
      rhythmLayers: [{ id: "other", instrumentId: "clarinet", measures: input.measures }]
    };
    await act(async () => root.render(<Harness settings={settings} />));
    mocks.render.mockImplementation(async (renderInput: PracticeAudioInput) => {
      const plan = buildPracticeAudioPlan(renderInput);
      return { ...rendered, timeline: plan.timeline, layerTimelines: plan.tracks.slice(1).map((track) => track.timeline) };
    });
    await act(async () => current.preview());
    expect(current.playingNoteIds).toEqual(["a"]);
    expect(current.status).toContain("가락을 듣고 있어요");
    expect(current.status).not.toContain("리듬과 가락");
    act(() => current.stop());
    await act(async () => current.save("mp3"));
    await act(async () => current.save("mp4"));
    expect(mocks.render).toHaveBeenCalledOnce();
    expect(mocks.encode.mock.calls[0][0]).toBe(rendered.buffer);
    expect(mocks.mp4.mock.calls[0][0].layerTimelines).toHaveLength(0);
    expect(mocks.mp4.mock.calls[0][1]).toBe(settings);
    expect(settings.rhythmLayers).toHaveLength(1);
  });

  it("함께 만들기의 리듬 단계는 모든 리듬 악보만 함께 연주한다", async () => {
    const settings: PracticeAudioInput = { ...input, mode: "rhythm-melody", step: "rhythm", rhythmLayers: [{
      id: "other", instrumentId: "clarinet", measures: input.measures
    }] };
    await act(async () => root.render(<Harness settings={settings} />));
    await act(async () => current.previewRhythmMix());
    const renderInput = mocks.render.mock.calls[0][0] as PracticeAudioInput;
    expect(renderInput).toMatchObject({ mode: "rhythm", step: "rhythm", rhythmLayers: settings.rhythmLayers });
    expect(buildPracticeAudioPlan(renderInput).tracks.map((track) => track.rhythm)).toEqual([true, true]);
  });

  it.each(["melody", "rhythm-melody"] as const)(
    "%s 가락 단계에서는 리듬 함께 듣기나 숨긴 악보 선택으로 리듬 연주를 우회하지 않는다", async (mode) => {
      const settings: PracticeAudioInput = { ...input, mode, rhythmLayers: [{
        id: "other", instrumentId: "clarinet", measures: input.measures
      }] };
      await act(async () => root.render(<Harness settings={settings} />));
      await act(async () => current.previewRhythmMix());
      expect(current.status).toContain("리듬만들기로 돌아가서");
      expect(current.previewRhythmMixing).toBe(false);
      await act(async () => current.previewScore(1));
      expect(current.status).toContain("악보를 다시");
      expect(current.previewScoreIndex).toBeNull();
      await act(async () => current.previewMeasure(0, 1));
      expect(current.status).toContain("악보를 다시");
      expect(current.previewMeasureIndex).toBeNull();
      expect(mocks.render).not.toHaveBeenCalled();
      expect(AudioContextMock.instances).toHaveLength(0);
      expect(current.busy).toBe(false);
      expect(current.playing).toBe(false);
    }
  );

  it("미완성 마디 하나만 리듬으로 연주하고 원래 음표를 강조한다", async () => {
    const selected = { notes: [{ id: "selected", pitch: 67, duration: rational(1, 2) }] };
    const settings: PracticeAudioInput = {
      ...input, step: "rhythm", rhythmInstrumentId: "beat:woodblock", measures: [input.measures[0], selected, { notes: [] }]
    };
    await act(async () => root.render(<Harness settings={settings} />));
    mocks.render.mockImplementation(async (renderInput: PracticeAudioInput) => ({
      ...rendered,
      timeline: buildPracticeTimeline(renderInput),
      buffer: { duration: 0.25 } as AudioBuffer
    }));
    await act(async () => current.previewMeasure(1));
    const renderInput = mocks.render.mock.calls[0][0];
    expect(renderInput).toMatchObject({ step: "rhythm", bpm: 120, rhythmInstrumentId: "beat:woodblock" });
    expect(renderInput.measures).toEqual([selected]);
    expect(current.previewMeasureIndex).toBe(1);
    expect(current.playingNoteId).toBe("selected");
    expect(current.status).toContain("2마디에 입력한 리듬");
    expect(settings.measures[1]).toBe(selected);
    expect(settings.measures[1].notes[0].duration).toEqual(rational(1, 2));
    act(() => AudioContextMock.instances[0].source.onended?.());
    expect(current.previewMeasureIndex).toBeNull();
    expect(current.playingNoteId).toBeNull();
    expect(current.status).toContain("2마디 리듬 미리듣기를 마쳤어요");
  });

  it("가락의 마디 듣기는 가락 악기와 실제 음높이를 사용하고 가락 재생 상태를 안내한다", async () => {
    const selected = { notes: [
      { id: "low", pitch: 60, duration: rational(1, 4), lyric: "봄" },
      { id: "rest", pitch: null, duration: rational(1, 4) },
      { id: "high", pitch: 67, duration: rational(1, 2), lyric: "날" }
    ] };
    const settings = { ...input, melodyInstrumentId: "clarinet", measures: [input.measures[0], selected] };
    await act(async () => root.render(<Harness settings={settings} />));
    mocks.render.mockImplementation(async (renderInput: PracticeAudioInput) => ({
      ...rendered, timeline: buildPracticeTimeline(renderInput)
    }));
    await act(async () => current.previewMeasure(1));
    expect(mocks.render.mock.calls[0][0]).toMatchObject({ step: "melody", melodyInstrumentId: "clarinet" });
    expect(mocks.render.mock.calls[0][0].measures).toEqual([selected]);
    expect(current.status).toContain("2마디에 입력한 가락을 듣고 있어요");
    expect(current.playingNoteId).toBe("low");
    const context = AudioContextMock.instances[0];
    act(() => { context.currentTime = 0.15; frames.at(-1)?.(0); });
    expect(current.playingNoteId).toBe("rest");
    act(() => { context.currentTime = 0.3; frames.at(-1)?.(0); });
    expect(current.playingNoteId).toBe("high");
    act(() => context.source.onended?.());
    expect(current.status).toContain("2마디 가락 미리듣기를 마쳤어요");
    expect(current.playingNoteId).toBeNull();
    expect(current.previewMeasureIndex).toBeNull();
  });

  it("같은 마디를 리듬에서 가락으로 바꾸면 음높이와 악기가 다른 버퍼를 준비한다", async () => {
    const buffers: AudioBuffer[] = [];
    mocks.render.mockImplementation(async (renderInput: PracticeAudioInput) => {
      const timeline = buildPracticeTimeline(renderInput);
      const buffer = { duration: timeline.durationSeconds } as AudioBuffer;
      buffers.push(buffer);
      return { ...rendered, timeline, buffer };
    });
    await act(async () => root.render(<Harness settings={{ ...input, step: "rhythm" }} />));
    await act(async () => current.previewMeasure(0));
    expect(AudioContextMock.instances[0].source.buffer).toBe(buffers[0]);
    act(() => current.stop());
    await act(async () => root.render(<Harness settings={input} />));
    await act(async () => current.previewMeasure(0));
    expect(mocks.render).toHaveBeenCalledTimes(2);
    expect(mocks.render.mock.calls.map((args) => args[0].step)).toEqual(["rhythm", "melody"]);
    expect(mocks.render.mock.calls.map((args) => buildPracticeTimeline(args[0]).events.map((event) => event.pitch)))
      .toEqual([[72, 72], [60, 72]]);
    expect(AudioContextMock.instances[1].source.buffer).toBe(buffers[1]);
    expect(buffers[1]).not.toBe(buffers[0]);
    act(() => current.stop());
    await act(async () => current.previewMeasure(0));
    expect(mocks.render).toHaveBeenCalledTimes(2);
    expect(AudioContextMock.instances[2].source.buffer).toBe(buffers[1]);
    act(() => current.stop());
    await act(async () => root.render(<Harness settings={{ ...input, melodyInstrumentId: "clarinet" }} />));
    await act(async () => current.previewMeasure(0));
    expect(mocks.render).toHaveBeenCalledTimes(3);
    expect(mocks.render.mock.calls[2][0]).toMatchObject({ step: "melody", melodyInstrumentId: "clarinet" });
    expect(AudioContextMock.instances[3].source.buffer).toBe(buffers[2]);
  });

  it("동일한 마디는 렌더를 재사용하되 전체 미리듣기와 저장의 버퍼는 구별한다", async () => {
    await act(async () => root.render(<Harness settings={{ ...input, step: "rhythm" }} />));
    await act(async () => current.preview());
    act(() => current.stop());
    await act(async () => current.previewMeasure(0));
    act(() => current.stop());
    await act(async () => current.previewMeasure(0));
    expect(mocks.render).toHaveBeenCalledTimes(2);
    act(() => current.stop());
    await act(async () => current.save("mp3"));
    expect(mocks.render).toHaveBeenCalledTimes(3);
    expect(current.previewMeasureIndex).toBeNull();
  });

  it.each([
    { label: "빈 마디", notes: [] },
    { label: "쉼표 마디", notes: [{ id: "rest", pitch: null, duration: rational(1) }] }
  ])(
    "$label 는 조용한 재생 대신 소리 음표를 넣도록 안내한다", async ({ notes }) => {
      await act(async () => root.render(<Harness settings={{ ...input, measures: [{ notes }] }} />));
      await act(async () => current.previewMeasure(0));
      expect(mocks.render).not.toHaveBeenCalled();
      expect(AudioContextMock.instances).toHaveLength(0);
      expect(current.status).toContain("소리 나는 음표를 한 개 이상");
      expect(current.busy).toBe(false);
      expect(current.playing).toBe(false);
      expect(current.previewMeasureIndex).toBeNull();
    }
  );

  it("마디 준비 중 정지하면 마디 표시를 지우고 늦은 작업이 새 연주를 덮어쓰지 않는다", async () => {
    let resolve: (value: PracticeRenderedAudio) => void;
    mocks.render.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    let pending: Promise<void>;
    await act(async () => { pending = current.previewMeasure(0); await Promise.resolve(); });
    expect(current.previewMeasureIndex).toBe(0);
    expect(current.busy).toBe(true);
    act(() => current.stop());
    expect(current.previewMeasureIndex).toBeNull();
    expect(mocks.render.mock.calls[0][1].signal.aborted).toBe(true);
    await act(async () => current.preview());
    await act(async () => { resolve!(rendered); await pending!; });
    expect(current.playing).toBe(true);
    expect(current.previewMeasureIndex).toBeNull();
    expect(AudioContextMock.instances[0].createBufferSource).not.toHaveBeenCalled();
    expect(AudioContextMock.instances[1].source.start).toHaveBeenCalledOnce();
  });

  it("마디 재생 중 정지하면 강조와 재생 대상을 함께 정리한다", async () => {
    await act(async () => current.previewMeasure(0));
    const context = AudioContextMock.instances[0];
    act(() => current.stop());
    expect(current.previewMeasureIndex).toBeNull();
    expect(current.playingNoteId).toBeNull();
    expect(current.playing).toBe(false);
    expect(context.source.stop).toHaveBeenCalledOnce();
    expect(context.source.onended).toBeNull();
    expect(context.close).toHaveBeenCalledOnce();
  });

  it("마디 준비 중 화면을 나가면 재생을 취소하고 소리를 시작하지 않는다", async () => {
    let resolve: (value: PracticeRenderedAudio) => void;
    mocks.render.mockReturnValue(new Promise((done) => { resolve = done; }));
    let pending: Promise<void>;
    await act(async () => { pending = current.previewMeasure(0); await Promise.resolve(); });
    const context = AudioContextMock.instances[0];
    const signal = mocks.render.mock.calls[0][1].signal;
    act(() => root.unmount());
    isUnmounted = true;
    expect(signal.aborted).toBe(true);
    await act(async () => { resolve!(rendered); await pending!; });
    expect(context.createBufferSource).not.toHaveBeenCalled();
    expect(context.close).toHaveBeenCalledOnce();
  });

  it("클릭에서 바로 재생 컨텍스트를 만들고 음표 진행에 맞춰 강조한다", async () => {
    let promise: Promise<void>;
    act(() => {
      promise = current.preview();
      expect(AudioContextMock.instances).toHaveLength(1);
      expect(AudioContextMock.instances[0].resume).toHaveBeenCalledOnce();
    });
    await act(async () => promise!);
    const context = AudioContextMock.instances[0];
    expect(context.source.buffer).toBe(rendered.buffer);
    expect(current.playing).toBe(true);
    expect(current.busy).toBe(false);
    expect(current.playingNoteId).toBe("a");
    act(() => { context.currentTime = 0.6; frames.at(-1)?.(0); });
    expect(current.playingNoteId).toBe("b");
    expect(current.progress).toBe(60);
    act(() => context.source.onended?.());
    expect(current.playing).toBe(false);
    expect(current.playingNoteId).toBeNull();
    expect(current.progress).toBe(100);
    expect(context.close).toHaveBeenCalledOnce();
  });

  it("악기 준비 중 정지하면 늦게 끝난 작업이 재생을 다시 시작하지 않는다", async () => {
    let resolve: (value: PracticeRenderedAudio) => void;
    mocks.render.mockReturnValue(new Promise((done) => { resolve = done; }));
    let promise: Promise<void>;
    await act(async () => { promise = current.preview(); await Promise.resolve(); });
    const first = AudioContextMock.instances[0];
    act(() => current.stop());
    expect(mocks.render.mock.calls[0][1].signal.aborted).toBe(true);
    expect(first.close).toHaveBeenCalledOnce();
    await act(async () => { resolve!(rendered); await promise!; });
    expect(first.createBufferSource).not.toHaveBeenCalled();
    expect(current.playing).toBe(false);
    expect(current.busy).toBe(false);
    expect(current.status).toContain("멈췄어요");
  });

  it("정지 직후 새 미리듣기를 시작해도 이전 작업이 새 재생을 덮어쓰지 않는다", async () => {
    let resolve: (value: PracticeRenderedAudio) => void;
    mocks.render.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    let first: Promise<void>;
    await act(async () => { first = current.preview(); await Promise.resolve(); });
    act(() => current.stop());
    await act(async () => current.preview());
    expect(current.playing).toBe(true);
    await act(async () => { resolve!(rendered); await first!; });
    expect(current.playing).toBe(true);
    expect(AudioContextMock.instances[0].createBufferSource).not.toHaveBeenCalled();
    expect(AudioContextMock.instances[1].source.start).toHaveBeenCalledOnce();
  });

  it("같은 클릭 사이클의 저장 두 번을 한 번으로 제한한다", async () => {
    let first: Promise<void>;
    let second: Promise<void>;
    act(() => { first = current.save("mp3"); second = current.save("mp3"); });
    await act(async () => { await Promise.all([first!, second!]); });
    expect(mocks.render).toHaveBeenCalledOnce();
    expect(mocks.encode).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(current.status).toContain("MP3 파일을 저장했어요");
  });

  it("미리듣기, MP3와 MP4에 같은 렌더 버퍼를 재사용한다", async () => {
    await act(async () => current.preview());
    act(() => AudioContextMock.instances[0].source.onended?.());
    await act(async () => current.save("mp3"));
    await act(async () => current.save("mp4"));
    expect(mocks.render).toHaveBeenCalledOnce();
    expect(mocks.encode.mock.calls[0][0]).toBe(rendered.buffer);
    expect(mocks.mp4.mock.calls[0][0]).toBe(rendered);
    expect(mocks.mp4.mock.calls[0][1]).toBe(input);
  });

  it("막대와 악보 모드를 바꿔도 음원을 재사용하고 현재 선택한 화면으로 MP4를 만든다", async () => {
    const bars: PracticeAudioInput = { ...input, videoMode: "bars" };
    await act(async () => root.render(<Harness settings={bars} />));
    await act(async () => current.save("mp4"));
    const score: PracticeAudioInput = { ...input, videoMode: "score" };
    await act(async () => root.render(<Harness settings={score} />));
    await act(async () => current.save("mp4"));
    expect(mocks.render).toHaveBeenCalledOnce();
    expect(mocks.mp4.mock.calls.map((args) => args[1].videoMode)).toEqual(["bars", "score"]);
    expect(mocks.mp4.mock.calls.every((args) => args[0].buffer === rendered.buffer)).toBe(true);
    expect(mocks.mp4.mock.calls.every((args) => args[1].step === "melody")).toBe(true);
  });

  it("가사 없는 리듬도 가락으로 전환하지 않고 MP3와 MP4에 같은 버퍼를 저장한다", async () => {
    const settings: PracticeAudioInput = {
      ...input,
      step: "rhythm",
      rhythmInstrumentId: "beat:shaker",
      measures: [{ notes: [{ id: "x", pitch: 60, duration: rational(4) }] }]
    };
    await act(async () => root.render(<Harness settings={settings} />));
    await act(async () => current.save("mp3"));
    await act(async () => current.save("mp4"));
    expect(mocks.render).toHaveBeenCalledOnce();
    expect(mocks.render.mock.calls[0][0]).toBe(settings);
    expect(mocks.render.mock.calls[0][0].step).toBe("rhythm");
    expect(mocks.encode.mock.calls[0][0]).toBe(rendered.buffer);
    expect(mocks.mp4.mock.calls[0][0]).toBe(rendered);
    expect(mocks.mp4.mock.calls[0][1]).toBe(settings);
    expect(click).toHaveBeenCalledTimes(2);
    expect(current.status).toContain("MP4 파일을 저장했어요");
    expect(current.busy).toBe(false);
  });

  it("내보내기 중 화면을 나가면 파일 다운로드를 막고 작업을 취소한다", async () => {
    let resolve: (value: Blob) => void;
    mocks.mp4.mockReturnValue(new Promise((done) => { resolve = done; }));
    let promise: Promise<void>;
    await act(async () => { promise = current.save("mp4"); await Promise.resolve(); });
    expect(mocks.mp4).toHaveBeenCalledOnce();
    const signal = mocks.mp4.mock.calls[0][2].signal;
    act(() => root.unmount());
    isUnmounted = true;
    expect(signal.aborted).toBe(true);
    await act(async () => { resolve!(new Blob(["mp4"])); await promise!; });
    expect(click).not.toHaveBeenCalled();
    expect(createdUrl).not.toHaveBeenCalled();
  });

  it("저장 후 화면을 나갈 때 다운로드 URL을 해제한다", async () => {
    await act(async () => current.save("mp3"));
    act(() => root.unmount());
    isUnmounted = true;
    expect(revokedUrl).toHaveBeenCalledWith("blob:practice-download");
  });

  it("추가 악보의 마디 듣기는 해당 악보의 악기와 재생 표시를 사용한다", async () => {
    const layer = { id: "layer", instrumentId: "clarinet", measures: [{ notes: [
      { id: "layer-note", pitch: 65, duration: rational(1, 2) }
    ] }] };
    await act(async () => root.render(<Harness settings={{ ...input, rhythmLayers: [layer] }} />));
    mocks.render.mockImplementation(async (renderInput: PracticeAudioInput) => ({
      ...rendered,
      timeline: buildPracticeTimeline(renderInput),
      buffer: { duration: 0.25 } as AudioBuffer
    }));
    await act(async () => current.previewMeasure(0, 1));
    expect(mocks.render.mock.calls[0][0]).toMatchObject({
      rhythmInstrumentId: "clarinet", step: "rhythm", rhythmLayers: undefined, measures: layer.measures
    });
    expect(current.previewMeasureIndex).toBe(0);
    expect(current.previewScoreIndex).toBe(1);
    expect(current.previewRhythmMixing).toBe(false);
    expect(current.playingNoteIds).toEqual(["layer-note"]);
    expect(current.status).toContain("2번 악보 1마디");
    act(() => current.stop());
    expect(current.previewScoreIndex).toBeNull();
    expect(current.playingNoteIds).toEqual([]);
  });

  it("미완성 리듬 함께 듣기는 모든 악보를 강조하며 가락 저장과 버퍼를 구별한다", async () => {
    const settings: PracticeAudioInput = {
      ...input,
      meter: { beats: 4, beatUnit: 4 },
      rhythmLayers: [{ id: "layer", instrumentId: "clarinet", measures: [{ notes: [
        { id: "layer-a", pitch: 65, duration: rational(1, 2) },
        { id: "layer-b", pitch: 65, duration: rational(1, 2) }
      ] }] }]
    };
    await act(async () => root.render(<Harness settings={settings} />));
    mocks.render.mockImplementation(async (renderInput: PracticeAudioInput) => {
      const plan = buildPracticeAudioPlan(renderInput);
      return { ...rendered, timeline: plan.timeline, layerTimelines: plan.tracks.slice(1).map((track) => track.timeline) };
    });
    await act(async () => current.previewRhythmMix());
    expect(mocks.render.mock.calls[0][0]).toMatchObject({ step: "rhythm", rhythmLayers: settings.rhythmLayers });
    expect(current.previewRhythmMixing).toBe(true);
    expect(current.previewScoreIndex).toBeNull();
    expect(current.previewMeasureIndex).toBeNull();
    expect(current.playingNoteIds).toEqual(["a", "layer-a"]);
    const context = AudioContextMock.instances[0];
    act(() => { context.currentTime = 0.3; frames.at(-1)?.(0); });
    expect(current.playingNoteIds).toEqual(["a", "layer-b"]);
    act(() => current.stop());
    expect(current.previewRhythmMixing).toBe(false);
    await act(async () => current.previewRhythmMix());
    expect(mocks.render).toHaveBeenCalledOnce();
    act(() => current.stop());
    await act(async () => current.save("mp3"));
    expect(mocks.render).toHaveBeenCalledTimes(2);
    expect(mocks.render.mock.calls[1][0].step).toBe("melody");
    expect(mocks.encode.mock.calls[0][0]).toBe(rendered.buffer);
    await act(async () => current.save("mp4"));
    expect(mocks.render).toHaveBeenCalledTimes(2);
    expect(mocks.mp4.mock.calls[0][1]).toBe(settings);
  });

  it("추가 악보의 리듬·악기·박자표 변경은 전체 렌더 캐시를 갱신한다", async () => {
    const layer = { id: "layer", instrumentId: "clarinet", measures: [{ notes: [
      { id: "layer-a", pitch: 65, duration: rational(1) }
    ] }] };
    const settings = { ...input, rhythmLayers: [layer], meter: { beats: 4, beatUnit: 4 as const } };
    await act(async () => root.render(<Harness settings={settings} />));
    await act(async () => current.preview());
    act(() => current.stop());
    await act(async () => root.render(<Harness settings={{ ...settings, rhythmLayers: [{ ...layer, instrumentId: "violin" }] }} />));
    await act(async () => current.preview());
    act(() => current.stop());
    await act(async () => root.render(<Harness settings={{ ...settings, rhythmLayers: [{ ...layer, measures: [{ notes: [
      { ...layer.measures[0].notes[0], duration: rational(1, 2) }
    ] }] }] }} />));
    await act(async () => current.preview());
    act(() => current.stop());
    await act(async () => root.render(<Harness settings={{ ...settings, meter: { beats: 3, beatUnit: 4 } }} />));
    await act(async () => current.preview());
    expect(mocks.render).toHaveBeenCalledTimes(4);
  });

  it("악보 전체 듣기는 선택한 악기만 연주하며 마디를 넘어 음표 강조와 종료 표시를 정리한다", async () => {
    const layer = { id: "layer", instrumentId: "clarinet", measures: [
      { notes: [{ id: "first", pitch: 65, duration: rational(1) }] },
      { notes: [] },
      { notes: [{ id: "third", pitch: 67, duration: rational(1) }] }
    ] };
    const settings = { ...input, measures: [{ notes: [] }], rhythmLayers: [layer] };
    await act(async () => root.render(<Harness settings={settings} />));
    mocks.render.mockImplementation(async (renderInput: PracticeAudioInput) => ({
      ...rendered, timeline: buildPracticeTimeline(renderInput), buffer: { duration: 6 } as AudioBuffer
    }));
    await act(async () => current.previewScore(1));
    expect(mocks.render.mock.calls[0][0]).toMatchObject({
      step: "rhythm", rhythmInstrumentId: "clarinet", rhythmLayers: undefined
    });
    expect(current.previewScoreIndex).toBe(1);
    expect(current.previewMeasureIndex).toBeNull();
    expect(current.previewRhythmMixing).toBe(false);
    expect(current.playingNoteIds).toEqual(["first"]);
    expect(current.status).toContain("악보2의 리듬을 듣고 있어요");
    const context = AudioContextMock.instances[0];
    act(() => { context.currentTime = 2.1; frames.at(-1)?.(0); });
    expect(current.playingNoteIds).toEqual([]);
    act(() => { context.currentTime = 4.1; frames.at(-1)?.(0); });
    expect(current.playingNoteIds).toEqual(["third"]);
    act(() => context.source.onended?.());
    expect(current.previewScoreIndex).toBeNull();
    expect(current.previewMeasureIndex).toBeNull();
    expect(current.playingNoteIds).toEqual([]);
    expect(current.playing).toBe(false);
    expect(current.progress).toBe(100);
    expect(current.status).toContain("악보2 미리듣기를 마쳤어요");
    expect(context.close).toHaveBeenCalledOnce();
  });

  it("악보 전체 듣기 준비를 정지하면 취소하고 늦은 결과가 새 연주를 덮어쓰지 않는다", async () => {
    let resolve: (value: PracticeRenderedAudio) => void;
    mocks.render.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    let pending: Promise<void>;
    await act(async () => { pending = current.previewScore(0); await Promise.resolve(); });
    expect(current.previewScoreIndex).toBe(0);
    expect(current.busy).toBe(true);
    const signal = mocks.render.mock.calls[0][1].signal;
    act(() => current.stop());
    expect(signal.aborted).toBe(true);
    expect(current.previewScoreIndex).toBeNull();
    expect(current.playingNoteIds).toEqual([]);
    await act(async () => current.previewMeasure(0));
    await act(async () => { resolve!(rendered); await pending!; });
    expect(current.previewMeasureIndex).toBe(0);
    expect(current.playing).toBe(true);
    expect(AudioContextMock.instances[0].createBufferSource).not.toHaveBeenCalled();
    expect(AudioContextMock.instances[1].source.start).toHaveBeenCalledOnce();
    act(() => current.stop());
    expect(current.playingNoteId).toBeNull();
    expect(current.previewScoreIndex).toBeNull();
    expect(AudioContextMock.instances[1].source.stop).toHaveBeenCalledOnce();
  });

  it("악보 전체 듣기 중 화면을 나가면 음원 준비를 취소하고 뒤늦은 재생을 막는다", async () => {
    let resolve: (value: PracticeRenderedAudio) => void;
    mocks.render.mockReturnValue(new Promise((done) => { resolve = done; }));
    let pending: Promise<void>;
    await act(async () => { pending = current.previewScore(0); await Promise.resolve(); });
    const context = AudioContextMock.instances[0];
    const signal = mocks.render.mock.calls[0][1].signal;
    act(() => root.unmount());
    isUnmounted = true;
    expect(signal.aborted).toBe(true);
    await act(async () => { resolve!(rendered); await pending!; });
    expect(context.createBufferSource).not.toHaveBeenCalled();
    expect(context.close).toHaveBeenCalledOnce();
  });

  it("악보 전체와 마디·함께 듣기·파일 저장의 캐시를 구별하며 같은 악보는 재사용한다", async () => {
    const settings = { ...input, step: "rhythm" as const, measures: [{ notes: [
      { id: "whole", pitch: 60, duration: rational(4) }
    ] }] };
    await act(async () => root.render(<Harness settings={settings} />));
    await act(async () => current.previewScore(0));
    act(() => current.stop());
    await act(async () => current.previewScore(0));
    expect(mocks.render).toHaveBeenCalledOnce();
    act(() => current.stop());
    await act(async () => current.previewMeasure(0));
    act(() => current.stop());
    await act(async () => current.previewRhythmMix());
    act(() => current.stop());
    await act(async () => current.save("mp3"));
    expect(mocks.render).toHaveBeenCalledTimes(4);
  });

  it("빈 악보 전체 듣기는 다른 악보가 있어도 재생하지 않고 선택 표시를 지운다", async () => {
    await act(async () => root.render(<Harness settings={{
      ...input, rhythmLayers: [{ id: "empty", instrumentId: "clarinet", measures: [{ notes: [] }] }]
    }} />));
    await act(async () => current.previewScore(1));
    expect(mocks.render).not.toHaveBeenCalled();
    expect(AudioContextMock.instances).toHaveLength(0);
    expect(current.previewScoreIndex).toBeNull();
    expect(current.busy).toBe(false);
    expect(current.status).toContain("악보2에 소리 나는 음표");
  });
});

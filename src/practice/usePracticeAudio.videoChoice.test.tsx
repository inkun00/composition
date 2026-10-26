import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePracticeAudio } from "./usePracticeAudio";
import type { PracticeAudioInput, PracticeRenderedAudio } from "./practiceAudioTypes";

const mocks = vi.hoisted(() => ({ render: vi.fn(), mp4: vi.fn(), mp3: vi.fn() }));
vi.mock("./practiceAudio", async (actual) => ({
  ...await actual<typeof import("./practiceAudio")>(), renderPracticeAudio: mocks.render,
  exportPracticeMp4: mocks.mp4, encodePracticeMp3: mocks.mp3
}));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const input: PracticeAudioInput = {
  measures: [{ notes: [{ id: "note", pitch: 67, duration: { numerator: 1, denominator: 1 }, lyric: "봄" }] }],
  bpm: 120, melodyInstrumentId: "flute", rhythmInstrumentId: "beat:shaker", step: "melody",
  title: "봄 노래", videoMode: "score"
};
const rendered: PracticeRenderedAudio = {
  buffer: { duration: .5 } as AudioBuffer, usedFallback: false,
  timeline: { durationSeconds: .5, events: [{ noteId: "note", pitch: 67, startSeconds: 0, endSeconds: .5, linkToNext: false }] }
};
let root: Root;
let host: HTMLDivElement;
let audio: ReturnType<typeof usePracticeAudio>;
function Harness() { audio = usePracticeAudio(input); return null; }

beforeEach(() => {
  vi.clearAllMocks();
  mocks.render.mockResolvedValue(rendered);
  mocks.mp4.mockResolvedValue(new Blob(["mp4"]));
  mocks.mp3.mockResolvedValue(new Blob(["mp3"]));
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:export") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(<Harness />));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  delete (URL as unknown as Record<string, unknown>).createObjectURL;
  delete (URL as unknown as Record<string, unknown>).revokeObjectURL;
});

describe("MP4 팝업 화면 선택 전달", () => {
  it("가사만 재생은 기존 곡과 미리보기 설정을 보존하고 동일한 오디오에 가사 화면을 선택한다", async () => {
    const before = structuredClone(input);
    await act(async () => audio.save("mp4", { videoMode: "lyrics" }));
    expect(mocks.render).toHaveBeenCalledExactlyOnceWith(input, expect.any(Object));
    expect(mocks.mp4).toHaveBeenCalledWith(rendered, { ...input, videoMode: "lyrics" }, expect.any(Object));
    expect(input).toEqual(before);
    await act(async () => audio.save("mp4", { videoMode: "bars" }));
    expect(mocks.render).toHaveBeenCalledOnce();
    expect(mocks.mp4).toHaveBeenLastCalledWith(rendered, { ...input, videoMode: "bars" }, expect.any(Object));
    await act(async () => audio.save("mp4"));
    expect(mocks.mp4).toHaveBeenLastCalledWith(rendered, input, expect.any(Object));
  });

  it("화면을 바꿔 연속 요청해도 현재 MP4가 끝나기 전에는 한 번만 생성한다", async () => {
    let finish!: (blob: Blob) => void;
    mocks.mp4.mockReturnValueOnce(new Promise<Blob>((resolve) => { finish = resolve; }));
    let pending!: Promise<void>;
    await act(async () => {
      pending = audio.save("mp4", { videoMode: "lyrics" });
      await audio.save("mp4", { videoMode: "score" });
      await Promise.resolve();
    });
    expect(mocks.mp4).toHaveBeenCalledOnce();
    expect(mocks.mp4.mock.calls[0][1].videoMode).toBe("lyrics");
    await act(async () => { finish(new Blob(["mp4"])); await pending; });
  });

  it("MP3는 영상 화면 선택과 관계없이 같은 원본 오디오를 저장한다", async () => {
    await act(async () => audio.save("mp3", { videoMode: "lyrics" }));
    expect(mocks.render).toHaveBeenCalledExactlyOnceWith(input, expect.any(Object));
    expect(mocks.mp3).toHaveBeenCalledWith(rendered.buffer, expect.any(Object));
    expect(mocks.mp4).not.toHaveBeenCalled();
  });
});

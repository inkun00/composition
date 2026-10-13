import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rational } from "../music/rational";
import PracticeVideoPreview from "./PracticeVideoPreview";
import { emptyPracticeDraft, type PracticeDraft } from "./practiceStorage";
import { preparePracticeVideoRenderer } from "./practiceVideoRenderer";
import type { PracticeVideoMode, PracticeVideoRenderer } from "./practiceVideoTypes";

vi.mock("./practiceVideoRenderer", () => ({ preparePracticeVideoRenderer: vi.fn() }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;
let draw: ReturnType<typeof vi.fn>;

function filledDraft(): PracticeDraft {
  const draft = emptyPracticeDraft();
  draft.bpm = 60;
  draft.measures = [
    { id: "first", chord: "C", lyric: "봄", notes: [{ id: "e", pitch: 64, lyric: "봄", duration: rational(4) }] },
    { id: "second", chord: "G", lyric: "날", notes: [{ id: "g", pitch: 67, lyric: "날", duration: rational(4) }] }
  ];
  return draft;
}

async function render(draft: PracticeDraft, mode: PracticeVideoMode = "bars", disabled = false) {
  await act(async () => root.render(<PracticeVideoPreview draft={draft} step="melody" mode={mode} disabled={disabled} />));
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  draw = vi.fn();
  vi.mocked(preparePracticeVideoRenderer).mockImplementation(async () => ({ canvas: document.createElement("canvas"), draw }));
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.clearAllMocks();
});

describe("저장 영상 미리보기", () => {
  it("음표를 만들기 전에 저장 화면을 열어도 안내를 보여 주며 깨지지 않는다", async () => {
    await render(emptyPracticeDraft());
    expect(host.textContent).toContain("음표를 넣으면 영상 미리보기가 열려요.");
    expect(host.querySelector("canvas")).toBeNull();
    expect(host.querySelector<HTMLInputElement>('input[type="range"]')?.disabled).toBe(true);
    expect(preparePracticeVideoRenderer).not.toHaveBeenCalled();
  });

  it("실제 음표와 가사를 공유 렌더러에 넘기고 저장 모드를 바꾸면 화면도 바꾼다", async () => {
    const draft = filledDraft();
    await render(draft);
    const first = vi.mocked(preparePracticeVideoRenderer).mock.calls[0];
    expect(first[0].measures[0].tracks[0][0]).toMatchObject({ note: draft.measures[0].notes[0], visualPitch: 64 });
    expect(first[0].durationSeconds).toBe(8);
    expect(first[1]).toBe("bars");
    expect(host.querySelector("canvas")?.getAttribute("aria-label")).toBe("막대 모드 영상 미리보기");
    await render(draft, "score");
    expect(preparePracticeVideoRenderer).toHaveBeenLastCalledWith(first[0], "score");
    expect(host.querySelectorAll("canvas")).toHaveLength(1);
    expect(host.querySelector("canvas")?.getAttribute("aria-label")).toBe("악보 모드 영상 미리보기");
  });

  it("위치를 옮기면 다른 마디의 영상 프레임을 그리고 저장 중에는 이동을 잠근다", async () => {
    const draft = filledDraft();
    await render(draft);
    const slider = host.querySelector<HTMLInputElement>('input[type="range"]') as HTMLInputElement;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(slider, "5");
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(draw).toHaveBeenLastCalledWith(5);
    expect(host.querySelector("output")?.textContent).toBe("5.0 / 8.0초");
    await render(draft, "bars", true);
    expect(slider.disabled).toBe(true);
  });

  it("화면을 떠난 뒤 준비가 끝나도 캔버스를 붙이거나 프레임을 그리지 않는다", async () => {
    let ready: ((renderer: PracticeVideoRenderer) => void) | undefined;
    vi.mocked(preparePracticeVideoRenderer).mockImplementation(() => new Promise((resolve) => { ready = resolve; }));
    await render(filledDraft());
    act(() => root.unmount());
    root = createRoot(host);
    await act(async () => ready?.({ canvas: document.createElement("canvas"), draw }));
    expect(host.querySelector("canvas")).toBeNull();
    expect(draw).not.toHaveBeenCalled();
  });
});

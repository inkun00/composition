import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RhythmTrainGame from "./RhythmTrainGame";

vi.mock("../LearningScore", () => ({ NoteSymbol: ({ id }: { id: string }) => <span>{id}</span> }));
vi.mock("./trainAudio", () => ({ TrainAudio: class {
  start = vi.fn(async () => ({ playAt: 100, endAt: 3100 }));
  stop = vi.fn();
  dispose = vi.fn();
  tap = vi.fn();
} }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let host: HTMLDivElement;
let clock = 0;
let scheduled: FrameRequestCallback | null;
const complete = vi.fn();
const exit = vi.fn();

function button(text: string): HTMLButtonElement {
  const match = Array.from(host.querySelectorAll("button")).find((node) => node.textContent?.includes(text));
  if (!match) throw new Error(`Missing control: ${text}`);
  return match;
}

async function click(text: string) {
  await act(async () => button(text).click());
}

function frame(time: number) {
  clock = time;
  const callback = scheduled;
  scheduled = null;
  act(() => callback?.(time));
}

async function perform(offsets: number[]) {
  await click("리듬 먼저 듣기");
  frame(3141);
  await click("열차 출발!");
  frame(100);
  for (const offset of offsets) {
    clock = 100 + offset;
    await click("톡! 눌러요");
  }
  frame(3361);
}

beforeEach(() => {
  complete.mockClear();
  exit.mockClear();
  clock = 0;
  scheduled = null;
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { scheduled = callback; return 1; });
  vi.stubGlobal("cancelAnimationFrame", () => { scheduled = null; });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(<RhythmTrainGame onComplete={complete} onExit={exit} />));
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("rhythm train expedition flow", () => {
  it("collects once, shows a visible whole-expedition reward, and offers return or a fresh replay", async () => {
    expect(document.activeElement).toBe(host.querySelector("h1"));
    await perform([0, 750, 1500, 2250]);
    await click("다음 역으로");
    expect(document.activeElement).toBe(host.querySelector("h1"));
    await perform([0, 1500, 2250]);
    await click("다음 역으로");
    await perform([0, 1500, 2250, 2625]);
    expect(complete).not.toHaveBeenCalled();
    await click("탐험 도장 받기");
    expect(complete).toHaveBeenCalledExactlyOnceWith({ stars: 3, score: 1100 });
    expect(host.querySelector("main#learn-main")?.getAttribute("aria-label")).toBe("리듬 열차 탐험 완료");
    expect(host.textContent).toContain("총 1100점");
    expect(document.activeElement).toBe(host.querySelector("h1"));
    expect(host.querySelector(".train-tap-pad")).toBeNull();
    await click("탐험 지도로 돌아가기");
    expect(exit).toHaveBeenCalledOnce();
    await click("처음부터 다시 달리기");
    expect(host.querySelector("h1")?.textContent).toContain("첫 번째 역");
    expect(button("열차 출발!").disabled).toBe(true);
    expect(host.textContent).toContain("0점");
    expect(complete).toHaveBeenCalledOnce();
  });

  it("does not count count-in taps or advance an empty performance", async () => {
    await click("리듬 먼저 듣기");
    frame(3141);
    await click("열차 출발!");
    clock = 100;
    await click("준비 박을 세어요");
    frame(3361);
    expect(host.textContent).toContain("4개 중 0개 성공");
    expect(button("다음 역으로").disabled).toBe(true);
    expect(complete).not.toHaveBeenCalled();
  });
});

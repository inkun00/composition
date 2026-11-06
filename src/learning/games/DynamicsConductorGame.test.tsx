// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DynamicsConductorGame from "./DynamicsConductorGame";
import { DYNAMICS_MISSIONS } from "./dynamicsPerformanceModel";

const state = vi.hoisted(() => ({ playing: false }));
const play = vi.hoisted(() => vi.fn());
const setMarking = vi.hoisted(() => vi.fn());
vi.mock("./useDynamicsPerformance", () => ({ useDynamicsPerformance: () => ({
  play, setMarking, stop: vi.fn(), playing: state.playing,
  frame: { progress: 0, activeIndex: -1, gain: 0 }, error: ""
}) }));
vi.mock("../../components/ScoreMeasure", () => ({ default: () => <span>가락 악보</span> }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let host: HTMLDivElement;
const complete = vi.fn();
function render() { act(() => root.render(<DynamicsConductorGame onExit={vi.fn()} onComplete={complete} />)); }
function button(label: string) {
  const value = [...host.querySelectorAll("button")].find((item) => item.textContent?.trim() === label);
  if (!value) throw Error(`Missing ${label}`);
  return value;
}
function click(label: string) { act(() => button(label).click()); }
function choose(marking: string) { act(() => host.querySelector<HTMLButtonElement>(`[data-marking="${marking}"]`)!.click()); }
function finish() { act(() => play.mock.calls.at(-1)?.[1]?.()); }
beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", vi.fn());
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  state.playing = false; play.mockClear(); setMarking.mockClear(); complete.mockClear(); render();
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

describe("셈여림 지휘자", () => {
  it("기호 선택으로 바로 듣고 재생 중에는 음을 다시 시작하지 않고 셈여림을 바꾼다", () => {
    choose("pp");
    expect(play).toHaveBeenLastCalledWith("pp");
    state.playing = true; render();
    choose("ff");
    expect(setMarking).toHaveBeenLastCalledWith("ff");
    expect(play).toHaveBeenCalledTimes(1);
    expect(host.querySelector('[data-marking="ff"]')?.getAttribute("aria-pressed")).toBe("true");
  });

  it("목표를 끝까지 듣고 정답 연주를 완료해야 미션과 최종 별을 얻는다", () => {
    click("도전! 음악회");
    expect(button("이대로 연주하기").disabled).toBe(true);
    DYNAMICS_MISSIONS.forEach((mission, index) => {
      click("목표 연주 듣기");
      expect(button("이대로 연주하기").disabled).toBe(true);
      finish();
      if (index === 0) {
        choose("ff"); click("이대로 연주하기"); finish();
        expect(host.querySelector(".dynamics-result")).toBeNull();
      }
      choose(mission.target); click("이대로 연주하기");
      expect(complete).not.toHaveBeenCalled();
      finish();
      expect(host.querySelector(".dynamics-result")).not.toBeNull();
      if (index < 3) click("다음 미션");
    });
    expect(complete).toHaveBeenCalledExactlyOnceWith({ stars: 2, score: 1160 });
    choose("p"); finish();
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("제출 연주 도중 기호를 바꾸면 정답으로 처리하지 않는다", () => {
    click("도전! 음악회"); click("목표 연주 듣기"); finish();
    choose("p"); click("이대로 연주하기");
    state.playing = true; render(); choose("f"); finish();
    expect(host.querySelector(".dynamics-result")).toBeNull();
    expect(host.querySelector(".dynamics-notice")?.textContent).toContain("중간에 기호가 바뀌었어요");
    expect(complete).not.toHaveBeenCalled();
  });

  it("같은 기호를 다시 눌러도 소리와 정답 판정을 유지한다", () => {
    click("도전! 음악회"); click("목표 연주 듣기"); finish();
    choose("p"); click("이대로 연주하기");
    state.playing = true; render(); choose("p"); finish();
    expect(host.querySelector(".dynamics-result")).not.toBeNull();
  });
});

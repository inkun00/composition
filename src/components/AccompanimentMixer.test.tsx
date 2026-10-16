// @vitest-environment jsdom

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAccompanimentMixer } from "../hooks/useAccompanimentMixer";
import type { AccompanimentTrackMixMap } from "../music/accompanimentMix";
import AccompanimentMixer from "./AccompanimentMixer";

const { updateAudioMix } = vi.hoisted(() => ({ updateAudioMix: vi.fn() }));
vi.mock("../audio/accompanimentRuntime", () => ({ setAccompanimentTrackMix: updateAudioMix }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;
let mixer: ReturnType<typeof useAccompanimentMixer>;
let changeInstruments: (ids: string[]) => void;
let soloRequests: ReturnType<typeof vi.fn>;
let removeRequests: ReturnType<typeof vi.fn>;

function Harness({ initialMix, controlsDisabled = false }: { initialMix?: AccompanimentTrackMixMap; controlsDisabled?: boolean }) {
  const [ids, setIds] = useState(["flute", "electric_bass_finger"]);
  changeInstruments = setIds;
  mixer = useAccompanimentMixer(ids, initialMix);
  return <AccompanimentMixer instrumentIds={ids} mixer={mixer} canListen editingDisabled={false}
    controlsDisabled={controlsDisabled} onSolo={soloRequests} onRemove={removeRequests} />;
}

function render(initialMix?: AccompanimentTrackMixMap, controlsDisabled = false) {
  act(() => root.render(<Harness initialMix={initialMix} controlsDisabled={controlsDisabled} />));
}

function get<T extends Element = HTMLElement>(testId: string): T {
  const element = container.querySelector<T>(`[data-testid="${testId}"]`);
  if (!element) throw new Error(`Missing ${testId}`);
  return element;
}

function setRangeValue(testId: string, value: string) {
  const slider = get<HTMLInputElement>(testId);
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(slider, value);
  slider.dispatchEvent(new Event("input", { bubbles: true }));
  slider.dispatchEvent(new Event("change", { bubbles: true }));
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  soloRequests = vi.fn();
  removeRequests = vi.fn();
  updateAudioMix.mockClear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("악기별 반주 믹서", () => {
  it("선택한 합주의 실제 역할에 맞춰 관악기 안내를 구별한다", () => {
    render();
    act(() => changeInstruments(["bright_acoustic_piano", "acoustic_bass", "clarinet", "recorder"]));
    expect(get("mixer-track-clarinet").textContent).toContain("아래에서 가락 이어주기");
    expect(get("mixer-track-recorder").textContent).toContain("노래에 답하는 가락");
  });

  it("실제 출력 이벤트가 올 때만 레벨과 연주 상태를 표시한다", () => {
    render();
    expect(get<HTMLMeterElement>("mixer-level-flute").value).toBe(0);
    expect(get("mixer-status-flute").textContent).toContain("재생하면");

    act(() => mixer.onTrackState({ instrumentId: "flute", status: "loading", level: 0 }));
    expect(get("mixer-status-flute").textContent).toBe("악기 소리 준비 중");
    act(() => mixer.onTrackState({ instrumentId: "flute", status: "playing", level: 0.43 }));
    expect(get<HTMLMeterElement>("mixer-level-flute").value).toBe(0.43);
    expect(get("mixer-status-flute").textContent).toBe("연주 중");
    expect(get<HTMLMeterElement>("mixer-level-electric_bass_finger").value).toBe(0);

    act(() => mixer.onTrackState({ instrumentId: "flute", status: "rest", level: 0 }));
    expect(get<HTMLMeterElement>("mixer-level-flute").value).toBe(0);
    expect(get("mixer-status-flute").textContent).toBe("쉬는 중");
    expect(container.querySelector(".mixer-level")).toBeNull();
  });

  it("각 악기의 음량과 음소거를 실제 오디오 믹서에 전달한다", () => {
    render();
    act(() => setRangeValue("mixer-volume-flute", "135"));
    expect(mixer.trackMix.flute).toEqual({ volume: 135, muted: false });
    expect(updateAudioMix).toHaveBeenLastCalledWith({ flute: { volume: 135, muted: false } });
    expect(get<HTMLInputElement>("mixer-volume-electric_bass_finger").value).toBe("100");

    act(() => get<HTMLButtonElement>("mixer-mute-flute").click());
    expect(mixer.trackMix.flute).toEqual({ volume: 135, muted: true });
    expect(get("mixer-mute-flute").getAttribute("aria-pressed")).toBe("true");
    expect(get("mixer-status-flute").textContent).toBe("소리 꺼짐");
    act(() => get<HTMLButtonElement>("mixer-mute-flute").click());
    expect(updateAudioMix).toHaveBeenLastCalledWith({ flute: { volume: 135, muted: false } });
  });

  it("단독 듣기와 제거는 클릭한 악기만 대상으로 한다", () => {
    render();
    act(() => get<HTMLButtonElement>("mixer-solo-flute").click());
    expect(soloRequests).toHaveBeenCalledWith("flute");
    expect(soloRequests).toHaveBeenCalledTimes(1);
    act(() => mixer.setSoloInstrumentId("flute"));
    expect(get("mixer-solo-flute").getAttribute("aria-pressed")).toBe("true");
    expect(get("mixer-solo-electric_bass_finger").getAttribute("aria-pressed")).toBe("false");
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="플루트 반주에서 빼기"]')?.click());
    expect(removeRequests).toHaveBeenCalledWith("flute");
  });

  it("샘플 실패 이유를 표시하고 성공 이벤트가 와야 해제한다", () => {
    render();
    act(() => mixer.onTrackState({ instrumentId: "flute", status: "error", level: 0, message: "다시 재생해 주세요." }));
    expect(container.textContent).toContain("악기 소리를 불러오지 못했어요");
    expect(container.textContent).toContain("다시 재생해 주세요.");
    act(() => mixer.onTrackState({ instrumentId: "electric_bass_finger", status: "ready", level: 0 }));
    expect(container.textContent).toContain("다시 재생해 주세요.");
    act(() => mixer.onTrackState({ instrumentId: "flute", status: "ready", level: 0 }));
    expect(container.textContent).not.toContain("다시 재생해 주세요.");
  });

  it("정지하면 실제 레벨을 0으로 내리고 실패 정보는 유지한다", () => {
    render();
    act(() => {
      mixer.onTrackState({ instrumentId: "flute", status: "playing", level: 0.7 });
      mixer.onTrackState({ instrumentId: "electric_bass_finger", status: "error", level: 0, message: "다시 재생해 주세요." });
    });
    act(() => mixer.resetTrackLevels());
    expect(get<HTMLMeterElement>("mixer-level-flute").value).toBe(0);
    expect(get("mixer-status-flute").textContent).toBe("악기 소리 준비됨");
    expect(get("mixer-status-electric_bass_finger").textContent).toBe("악기 소리를 불러오지 못했어요");
    expect(container.textContent).toContain("다시 재생해 주세요.");
  });

  it("저장한 믹스를 복원하고 선택에서 빠진 악기의 설정과 이벤트를 제외한다", () => {
    render({ flute: { volume: 72, muted: true }, electric_bass_finger: { volume: 119, muted: false } });
    expect(get<HTMLInputElement>("mixer-volume-flute").value).toBe("72");
    expect(get("mixer-mute-flute").getAttribute("aria-pressed")).toBe("true");
    act(() => changeInstruments(["electric_bass_finger", "violin"]));
    expect(mixer.trackMix).toEqual({ electric_bass_finger: { volume: 119, muted: false } });
    act(() => mixer.onTrackState({ instrumentId: "flute", status: "playing", level: 0.8 }));
    expect(mixer.trackStates.flute).toBeUndefined();
    expect(get<HTMLInputElement>("mixer-volume-violin").value).toBe("100");
    act(() => mixer.loadTrackMix());
    expect(mixer.trackMix).toEqual({});
    expect(get<HTMLInputElement>("mixer-volume-electric_bass_finger").value).toBe("100");
  });

  it("저장할 오디오를 만드는 동안 음량과 음소거 변경을 잠근다", () => {
    render(undefined, true);
    expect(get<HTMLInputElement>("mixer-volume-flute").disabled).toBe(true);
    expect(get<HTMLButtonElement>("mixer-mute-flute").disabled).toBe(true);
  });
});

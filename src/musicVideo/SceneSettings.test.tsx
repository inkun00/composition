// @vitest-environment jsdom

import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getMusicVideoMeasures, type MusicVideoPlan, type MusicVideoScene } from "../video/musicVideoModel";
import type { MusicVideoMeasure } from "../video/musicVideoMeasures";
import SceneSettings from "./SceneSettings";

const { preview } = vi.hoisted(() => ({ preview: vi.fn() }));
vi.mock("./SceneMotionPreview", () => ({ default: (props: { plan: MusicVideoPlan; bpm: number }) => {
  preview(props);
  return <div data-testid="captured-motion-preview" />;
} }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const source: readonly MusicVideoMeasure[] = Array.from({ length: 2 }, (_, measureIndex) => ({
  measureIndex,
  notes: Array.from("하나둘셋", (lyric, index) => ({ id: `tempo-${measureIndex}-${index}`, pitch: 60,
    duration: { numerator: 1, denominator: 1 }, lyric }))
}));
const scene: MusicVideoScene = { id: "tempo-scene", background: "#ffffff", endLyric: null, endMeasureIndex: 1,
  motion: "move-right", elements: [{ id: "tempo-line", tool: "line", color: "#1e293b", width: 8,
    points: [[100, 150, .5], [200, 150, .5]] }] };
let host: HTMLDivElement;
let root: Root;
let onChange: ReturnType<typeof vi.fn>;

function render(bpm: number, selectedScene = scene, props: Partial<ComponentProps<typeof SceneSettings>> = {}) {
  const measures = getMusicVideoMeasures(source, bpm);
  act(() => root.render(<SceneSettings scene={selectedScene} scenes={[selectedScene]} measures={measures} sourceMeasures={source}
    selected={0} bpm={bpm} title="박자에 맞춘 그림" disabled={false} onChange={onChange}
    onDelete={() => undefined} onStatus={() => undefined} {...props} />));
}

function choose(testId: string, value: string) {
  const select = host.querySelector<HTMLSelectElement>(`[data-testid="${testId}"]`)!;
  act(() => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  onChange = vi.fn();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

describe("겹치는 장면 구간도 자유롭게 선택", () => {
  it("앞뒤 장면이 연결되어도 모든 시작·끝 마디를 활성화한다", () => {
    const first = { ...scene, id: "first", endMeasureIndex: 0 };
    const selected = { ...scene, id: "middle", startMeasureIndex: 0, endMeasureIndex: 1 };
    const last = { ...scene, id: "last", startMeasureIndex: 1, endMeasureIndex: 1 };
    render(120, selected, { scenes: [first, selected, last], selected: 1 });
    for (const testId of ["scene-start-measure", "scene-end-measure"]) {
      const select = host.querySelector<HTMLSelectElement>(`[data-testid="${testId}"]`)!;
      expect(select.disabled).toBe(false);
      expect(Array.from(select.options).filter((option) => option.value !== "").every((option) => !option.disabled)).toBe(true);
    }
    choose("scene-end-measure", "0");
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ endMeasureIndex: 0 }));
  });

  it("구간 콜백에 시작과 끝의 원래 마디 번호를 전달하고 직접 장면을 변경하지 않는다", () => {
    const onRangeChange = vi.fn();
    render(120, scene, { onRangeChange });
    choose("scene-start-measure", "1");
    choose("scene-end-measure", "0");
    expect(onRangeChange.mock.calls).toEqual([["start", 1], ["end", 0]]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("독립된 시작 마디를 요약과 움직임 미리보기에 반영한다", () => {
    const selected = { ...scene, startMeasureIndex: 1 };
    render(120, selected);
    const { plan } = preview.mock.lastCall![0] as { plan: MusicVideoPlan };
    expect(plan.scenes[0].startSeconds).toBe(2);
    expect(plan.scenes[0].endSeconds).toBe(4);
    expect(host.querySelector(".mv-range-summary")!.textContent).toContain("02마디");
    expect(host.querySelector('[data-testid="scene-start-measure"]')!.getAttribute("aria-label")).toBe("장면 시작 마디");
    choose("scene-start-measure", "0");
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ startMeasureIndex: 0 }));
  });

  it("전주로 바꾸면 본곡 시작과 끝 마디 정보를 모두 제거한다", () => {
    render(120, { ...scene, startMeasureIndex: 1 });
    choose("scene-end-measure", "intro");
    const changed = onChange.mock.lastCall![0] as MusicVideoScene;
    expect(changed.section).toBe("intro");
    expect(changed.startMeasureIndex).toBeUndefined();
    expect(changed.endMeasureIndex).toBeUndefined();
    render(120, changed);
    expect(host.querySelector('[data-testid="scene-start-measure"]')).toBeNull();
  });

  it("작업 중에는 시작·끝 선택을 함께 잠근다", () => {
    render(120, scene, { disabled: true });
    expect(host.querySelector<HTMLSelectElement>('[data-testid="scene-start-measure"]')!.disabled).toBe(true);
    expect(host.querySelector<HTMLSelectElement>('[data-testid="scene-end-measure"]')!.disabled).toBe(true);
  });

  it("전주에서 본곡으로 바꾸는 선택도 구간 콜백으로 전달해 이웃 장면을 보존한다", () => {
    const onRangeChange = vi.fn();
    render(120, { ...scene, section: "intro", endMeasureIndex: undefined }, { onRangeChange });
    choose("scene-end-measure", "1");
    expect(onRangeChange).toHaveBeenCalledWith("end", 1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("구간 콜백 없이도 전주를 본곡 마디로 바꾸는 선택을 지원한다", () => {
    render(120, { ...scene, section: "intro", endMeasureIndex: undefined });
    choose("scene-end-measure", "1");
    const changed = onChange.mock.lastCall![0] as MusicVideoScene;
    expect(changed.section).toBeUndefined();
    expect(changed.endMeasureIndex).toBe(1);
  });
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

describe("현재 노래 빠르기를 장면 미리보기에 전달", () => {
  it("BPM 변경으로 마디와 가사 시간을 다시 계산하며 선택한 효과와 원본 그림은 바꾸지 않는다", () => {
    const original = structuredClone(scene);
    render(120);
    const first = preview.mock.lastCall![0] as { plan: MusicVideoPlan; bpm: number };
    expect(first.bpm).toBe(120);
    expect(first.plan.bpm).toBe(120);
    expect(first.plan.scenes[0].endSeconds).toBe(4);
    expect(first.plan.lyrics.frames[0].endSeconds).toBe(.5);
    expect(host.querySelector('[data-testid="scene-motion-tempo"]')!.textContent)
      .toBe("BPM 120 · 박자에 맞춰 자동 조절");

    render(180);
    const faster = preview.mock.lastCall![0] as { plan: MusicVideoPlan; bpm: number };
    expect(faster.bpm).toBe(180);
    expect(faster.plan.bpm).toBe(180);
    expect(faster.plan.scenes[0].endSeconds).toBeCloseTo(8 * 60 / 180);
    expect(faster.plan.lyrics.frames[0].endSeconds).toBeCloseTo(60 / 180);
    expect(faster.plan.scenes[0].scene).toBe(scene);
    expect(host.querySelector('[data-testid="scene-motion-tempo"]')!.textContent)
      .toBe("BPM 180 · 박자에 맞춰 자동 조절");
    expect(host.querySelector('[data-testid="scene-motion-category-travel"]')!.getAttribute("aria-selected"))
      .toBe("true");
    expect(host.querySelector('[data-testid="scene-motion-preset-move-right"]')!.getAttribute("aria-pressed"))
      .toBe("true");
    expect(onChange).not.toHaveBeenCalled();
    expect(scene).toEqual(original);
  });

  it.each([90, 120, 180])("끝 마디를 고르기 전에도 BPM %s에서 정확히 8박 길이로 미리 본다", (bpm) => {
    const incomplete = { ...scene, endMeasureIndex: undefined };
    render(bpm, incomplete);
    const { plan } = preview.mock.lastCall![0] as { plan: MusicVideoPlan };
    const timed = plan.scenes[0];
    expect(timed.endSeconds - timed.startSeconds).toBeCloseTo(8 * 60 / bpm);
    expect(onChange).not.toHaveBeenCalled();
    expect(incomplete.motion).toBe("move-right");
    expect(incomplete.endMeasureIndex).toBeUndefined();
  });

  it.each([97, 119])("BPM %s 원래 값을 부동소수점 역산 오차 없이 표시하고 전달한다", (bpm) => {
    render(bpm);
    const captured = preview.mock.lastCall![0] as { plan: MusicVideoPlan; bpm: number };
    expect(captured.bpm).toBe(bpm);
    expect(captured.plan.bpm).toBe(bpm);
    expect(host.querySelector('[data-testid="scene-motion-tempo"]')!.textContent)
      .toBe(`BPM ${bpm} · 박자에 맞춰 자동 조절`);
  });
});

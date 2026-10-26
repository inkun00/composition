// @vitest-environment jsdom

import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getMusicVideoMeasures, type MusicVideoScene } from "../video/musicVideoModel";
import SceneRangeWarnings from "./SceneRangeWarnings";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const measures = getMusicVideoMeasures(Array.from({ length: 6 }, (_, measureIndex) => ({
  measureIndex,
  notes: [{ id: `lyric-${measureIndex}`, pitch: 60, duration: { numerator: 4, denominator: 1 }, lyric: "노래" }]
})), 120);
const scenes: readonly MusicVideoScene[] = [
  { id: "first", startMeasureIndex: 0, endMeasureIndex: 2, background: "#ffffff", endLyric: null, motion: "still", elements: [] },
  { id: "second", startMeasureIndex: 2, endMeasureIndex: 4, background: "#ffffff", endLyric: null, motion: "still", elements: [] }
];
let host: HTMLDivElement;
let root: Root;
let onSelect: ReturnType<typeof vi.fn>;
let onShift: ReturnType<typeof vi.fn>;

function render(props: Partial<ComponentProps<typeof SceneRangeWarnings>> = {}) {
  act(() => root.render(<SceneRangeWarnings scenes={scenes} measures={measures} disabled={false}
    onSelect={onSelect} onShift={onShift} {...props} />));
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  onSelect = vi.fn();
  onShift = vi.fn();
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

describe("겹친 장면 구간 안내와 해결 선택", () => {
  it("겹친 마디와 장면을 구체적으로 표시하고 수정할 장면을 선택한다", () => {
    render();
    expect(host.querySelector('[data-testid="scene-range-conflict-row"]')!.textContent).toContain("3마디 겹침");
    expect(host.textContent).toContain("겹친 구간이 있으면 뮤직비디오를 만들 수 없어요.");
    expect(host.textContent).toContain("필요 없는 장면을 삭제");
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="겹친 장면 2 선택"]')!.click());
    expect(onSelect).toHaveBeenCalledWith(1);
    expect(onShift).not.toHaveBeenCalled();
  });

  it("사용자가 뒤로 밀기를 선택했을 때만 구간 이동을 요청한다", () => {
    render();
    const shift = host.querySelector<HTMLButtonElement>('[data-testid="scene-range-shift-forward"]')!;
    expect(shift.disabled).toBe(false);
    expect(onShift).not.toHaveBeenCalled();
    act(() => shift.click());
    expect(onShift).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("좁은 화면용 경고를 펼쳐 확인하고 문제 장면으로 이동하면 다시 접는다", () => {
    render();
    const toggle = host.querySelector<HTMLButtonElement>('[data-testid="scene-range-warning-toggle"]')!;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.textContent).toContain("3마디 겹침");
    act(() => toggle.click());
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(host.querySelector(".mv-range-warning-content")?.getAttribute("data-expanded")).toBe("true");
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="겹친 장면 2 선택"]')!.click());
    expect(onSelect).toHaveBeenCalledWith(1);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("노래 끝 공간이 부족하면 밀기를 막고 구간 축소·장면 삭제를 안내한다", () => {
    const issue = "뒤로 밀려면 2마디가 더 필요해요. 필요 없는 장면을 삭제하거나 앞 장면의 끝 마디를 당겨 주세요.";
    render({ shiftIssue: issue });
    const shift = host.querySelector<HTMLButtonElement>('[data-testid="scene-range-shift-forward"]')!;
    expect(shift.disabled).toBe(true);
    expect(shift.title).toBe(issue);
    expect(host.querySelector(".mv-range-shift-issue")!.textContent).toBe(issue);
    act(() => shift.click());
    expect(onShift).not.toHaveBeenCalled();
    expect(host.querySelector<HTMLButtonElement>('[aria-label="겹친 장면 1 선택"]')!.disabled).toBe(false);
  });

  it("영상 작업 중에는 장면 선택과 이동을 함께 잠근다", () => {
    render({ disabled: true });
    for (const button of host.querySelectorAll<HTMLButtonElement>("button")) {
      expect(button.disabled).toBe(true);
      act(() => button.click());
    }
    expect(onShift).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("중간에 비어 있는 마디는 겹침과 구분해 시작·끝 수정으로 연결하도록 안내한다", () => {
    render({ scenes: [{ ...scenes[0], endMeasureIndex: 1 }, { ...scenes[1], startMeasureIndex: 3, endMeasureIndex: 5 }] });
    expect(host.textContent).toContain("3마디에 연결된 장면이 없어요");
    expect(host.textContent).toContain("빈 마디 없이 연결");
    expect(host.querySelector('[data-testid="scene-range-conflict-row"]')).toBeNull();
    expect(host.querySelector('[data-testid="scene-range-shift-forward"]')).toBeNull();
  });

  it("유효한 전체 연결은 경고를 표시하지 않는다", () => {
    render({ scenes: [scenes[0], { ...scenes[1], startMeasureIndex: 3, endMeasureIndex: 5 }] });
    expect(host.querySelector('[data-testid="scene-range-warning"]')).toBeNull();
  });

  it("전주를 겹침 계산에서 제외하면서 장면 번호는 타임라인과 일치시킨다", () => {
    const intro: MusicVideoScene = { ...scenes[0], id: "intro", section: "intro", startMeasureIndex: undefined, endMeasureIndex: undefined };
    render({ scenes: [intro, ...scenes] });
    const row = host.querySelector('[data-testid="scene-range-conflict-row"]')!;
    expect(row.textContent).toBe("3마디 겹침장면 2 보기장면 3 보기");
    expect(host.querySelector('[aria-label="겹친 장면 1 선택"]')).toBeNull();
  });
});

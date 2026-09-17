// @vitest-environment jsdom

import { useState } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BeatPatternEvent } from "../music/beatPattern";
import BeatInstrumentChooser from "./BeatInstrumentChooser";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function Harness() {
  const [events, setEvents] = useState<BeatPatternEvent[]>([]);
  const [volume, setVolume] = useState(100);
  return <BeatInstrumentChooser events={events} meter={{ beats: 4, beatUnit: 4 }}
    bpm={96} volume={volume} disabled={false} playing={false}
    onChange={setEvents} onVolumeChange={setVolume} onPlayingChange={vi.fn()} />;
}

function renderHarness() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(<Harness />));
}

async function click(testId: string) {
  await act(async () => {
    container?.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`)?.click();
  });
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("악기별 4마디 비트 겹치기", () => {
  it("처음에는 한 악기의 네 마디 한 박자 칸을 보여준다", () => {
    renderHarness();
    expect(container?.querySelectorAll('[data-testid^="beat-track-"]')).toHaveLength(1);
    expect(container?.querySelectorAll('[data-testid^="beat-slot-"]')).toHaveLength(16);
    expect(container?.querySelectorAll(".beat-pattern-track-editor .beat-pattern-measure")).toHaveLength(4);
    expect(container?.textContent).toContain("겹친 악기1 / 3");
    expect(container?.textContent).toContain("소리가 든 칸은 다시 눌러 지워요");
    expect(container?.textContent).toContain("비트는 자동으로 들어가지 않아요");
  });

  it("첫 악기 패턴을 만든 뒤 두 번째 악기를 추가해 모든 줄을 함께 편집한다", async () => {
    renderHarness();
    await click("beat-slot-0-0-0");
    await click("beat-slot-0-3-3");
    await click("beat-add-instrument");

    expect(container?.querySelectorAll('[data-testid^="beat-track-"]')).toHaveLength(2);
    expect(container?.querySelectorAll('[data-testid^="beat-slot-"]')).toHaveLength(32);
    expect(container?.textContent).toContain("2번 악기로 쓸 소리를 골라요");
    expect(container?.textContent).toContain("2번 · 작은북의 4마디");

    await click("beat-slot-1-0-0");
    expect(container?.textContent).toContain("놓은 소리 3개");
    expect(container?.querySelector('[aria-label="4마디 4번째 박자에 큰북 삭제"]')).not.toBeNull();
    expect(container?.querySelector('[aria-label="1마디 1번째 박자에 작은북 삭제"]')).not.toBeNull();
    expect(container?.querySelector('[aria-label="4마디 4번째 박자에 작은북 삭제"]')).toBeNull();
  });

  it("악기는 최대 세 개까지만 추가할 수 있다", async () => {
    renderHarness();
    await click("beat-add-instrument");
    await click("beat-add-instrument");

    const addButton = container?.querySelector<HTMLButtonElement>('[data-testid="beat-add-instrument"]');
    expect(container?.querySelectorAll('[data-testid^="beat-track-"]')).toHaveLength(3);
    expect(container?.querySelectorAll('[data-testid^="beat-slot-"]')).toHaveLength(48);
    expect(addButton?.disabled).toBe(true);
    expect(addButton?.textContent).toContain("악기 3개 모두 사용 중");
  });

  it("악기를 바꾸면 그 줄에 만든 네 마디 패턴을 새 악기 소리로 유지한다", async () => {
    renderHarness();
    await click("beat-slot-0-2-1");
    await click("beat-instrument-timpani");

    expect(container?.textContent).toContain("1번 · 팀파니의 4마디");
    expect(container?.querySelector('[aria-label="3마디 2번째 박자에 팀파니 삭제"]')).not.toBeNull();
    expect(container?.textContent).toContain("놓은 소리 1개");
  });

  it("추가한 악기 줄을 빼면 그 악기의 비트도 함께 지운다", async () => {
    renderHarness();
    await click("beat-slot-0-0-0");
    await click("beat-add-instrument");
    await click("beat-slot-1-1-1");
    await click("beat-remove-track-1");

    expect(container?.querySelectorAll('[data-testid^="beat-track-"]')).toHaveLength(1);
    expect(container?.textContent).toContain("놓은 소리 1개");
  });

  it("칸을 한 번 누르면 비트를 넣고 다시 누르면 삭제한다", async () => {
    renderHarness();
    await click("beat-half-0-0");
    expect(container?.querySelectorAll('[data-testid^="beat-slot-"]')).toHaveLength(20);
    expect(container?.querySelectorAll('[data-testid^="beat-slot-0-0-"]')).toHaveLength(8);
    expect(container?.querySelectorAll('[data-testid^="beat-slot-0-1-"]')).toHaveLength(4);
    expect(container?.textContent).toContain("1/2박자");

    await click("beat-half-0-0");
    expect(container?.querySelectorAll('[data-testid^="beat-slot-"]')).toHaveLength(28);
    expect(container?.querySelectorAll('[data-testid^="beat-slot-0-0-"]')).toHaveLength(16);
    expect(container?.querySelectorAll('[data-testid^="beat-slot-0-1-"]')).toHaveLength(4);
    expect(container?.textContent).toContain("1/4박자");

    await click("beat-slot-0-0-1");
    expect(container?.querySelector('[aria-label="1마디 1번째 박자의 2/4 지점에 큰북 삭제"]')).not.toBeNull();
    expect(container?.textContent).toContain("놓은 소리 1개");

    await click("beat-slot-0-0-1");
    expect(container?.querySelector('[aria-label="1마디 1번째 박자의 2/4 지점에 큰북 넣기"]')).not.toBeNull();
    expect(container?.textContent).toContain("놓은 소리 0개");

    await click("beat-slot-0-0-1");
    const deleteButton = container?.querySelector<HTMLButtonElement>('[data-testid="beat-delete-0-0"]');
    expect(deleteButton?.disabled).toBe(false);
    await click("beat-delete-0-0");
    expect(container?.textContent).toContain("놓은 소리 0개");
  });

  it("2배 버튼은 촘촘한 박자를 앞쪽의 긴 박자 칸으로 합친다", async () => {
    renderHarness();
    await click("beat-half-0-0");
    await click("beat-half-0-0");
    await click("beat-slot-0-0-1");
    await click("beat-slot-0-0-2");
    expect(container?.textContent).toContain("놓은 소리 2개");

    await click("beat-double-0-0");
    expect(container?.querySelectorAll('[data-testid^="beat-slot-"]')).toHaveLength(20);
    expect(container?.querySelectorAll('[data-testid^="beat-slot-0-1-"]')).toHaveLength(4);
    expect(container?.textContent).toContain("놓은 소리 2개");

    await click("beat-double-0-0");
    expect(container?.querySelectorAll('[data-testid^="beat-slot-"]')).toHaveLength(16);
    expect(container?.textContent).toContain("놓은 소리 1개");
  });

  it("비트 음량은 최대 260%까지 조절한다", async () => {
    renderHarness();
    const slider = container?.querySelector<HTMLInputElement>('[data-testid="beat-volume"]');
    expect(slider?.max).toBe("260");
    await act(async () => {
      if (!slider) return;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(slider, "235");
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container?.textContent).toContain("235%");
  });
});

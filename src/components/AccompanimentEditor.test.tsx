// @vitest-environment jsdom

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACCOMPANIMENT_MODES, type AccompanimentStyleId } from "../music/accompaniment";
import AccompanimentEditor from "./AccompanimentEditor";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;
const toggleInstrument = vi.fn();

function Harness() {
  const [styleId, setStyle] = useState<AccompanimentStyleId>(ACCOMPANIMENT_MODES[0].styleId);
  const [ids, setIds] = useState<readonly string[]>(ACCOMPANIMENT_MODES[0].instrumentIds);
  return <AccompanimentEditor styleId={styleId} instrumentIds={ids} disabled={false}
    playback={{ state: "idle", disabled: false, onListen: vi.fn() }}
    onChange={(style, instruments) => { setStyle(style); if (instruments) setIds(instruments); }}
    onToggleInstrument={toggleInstrument}>
    <div data-testid="mixer-visible">악기별 소리 확인</div>
  </AccompanimentEditor>;
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(<Harness />));
  toggleInstrument.mockClear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("반주 편집기", () => {
  it("쉬운 반주에서도 악기 선택을 펼쳐 추가할 수 있다", () => {
    expect(container.querySelector('[data-testid="accompaniment-mode-tab"]')?.getAttribute("aria-selected")).toBe("true");
    expect(container.querySelector('[data-testid="mixer-visible"]')).not.toBeNull();
    const tracks = container.querySelector<HTMLDetailsElement>(".accompaniment-tracks-disclosure")!;
    expect(tracks.open).toBe(false);
    act(() => { tracks.open = true; });
    act(() => container.querySelector<HTMLButtonElement>('[data-testid="accompaniment-instrument-flute"]')?.click());
    expect(toggleInstrument).toHaveBeenCalledWith("flute");
  });

  it("탭을 옮겨도 선택한 반주 악기를 유지한다", () => {
    const ids = ACCOMPANIMENT_MODES[0].instrumentIds;
    const selectedBefore = container.querySelectorAll(".accompaniment-instrument.active").length;
    act(() => container.querySelector<HTMLButtonElement>('[data-testid="accompaniment-playing-tab"]')?.click());
    expect(container.querySelector('[data-testid="accompaniment-playing-tab"]')?.getAttribute("aria-selected")).toBe("true");
    expect(container.querySelectorAll(".accompaniment-instrument.active")).toHaveLength(selectedBefore);
    for (const id of ids) expect(container.querySelector(`[data-testid="accompaniment-instrument-${id}"]`)?.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector('[data-testid="mixer-visible"]')).not.toBeNull();
  });

  it("쉬운 반주를 고르면 연주 방식과 무관하게 쉬운 반주 화면을 유지한다", () => {
    act(() => container.querySelector<HTMLButtonElement>('[data-testid="accompaniment-mode-piano_ballad"]')?.click());
    expect(container.querySelector('[data-testid="accompaniment-mode-tab"]')?.getAttribute("aria-selected")).toBe("true");
    expect(container.querySelector('[data-testid="accompaniment-mode-piano_ballad"]')?.getAttribute("aria-pressed")).toBe("true");
    expect(container.textContent).toContain("반주를 골랐어요");
    expect(container.textContent).toContain("개 악기 선택됨");
  });
});

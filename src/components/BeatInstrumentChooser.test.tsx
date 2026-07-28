// @vitest-environment jsdom

import { useState } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BeatInstrumentId } from "../music/beatInstruments";
import BeatInstrumentChooser from "./BeatInstrumentChooser";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function Harness() {
  const [value, setValue] = useState<BeatInstrumentId[]>([]);
  const [volume, setVolume] = useState(100);
  return <BeatInstrumentChooser value={value} styleId="children_song"
    meter={{ beats: 4, beatUnit: 4 }} bpm={96} volume={volume} disabled={false} playing={false}
    onChange={setValue} onVolumeChange={setVolume} onPlayingChange={vi.fn()} />;
}

async function click(id: BeatInstrumentId) {
  await act(async () => {
    container?.querySelector<HTMLButtonElement>(`[data-testid="beat-instrument-${id}"]`)?.click();
  });
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("비트 악기 직접 고르기", () => {
  it("자동 추천 없이 사용자가 고른 수만큼 한 겹부터 세 겹까지 만든다", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root?.render(<Harness />));

    expect(container.textContent).toContain("비트 없이");
    await click("kick");
    expect(container.textContent).toContain("1겹 · 가볍게");
    await click("clap");
    expect(container.textContent).toContain("2겹 · 알차게");
    await click("shaker");
    expect(container.textContent).toContain("3겹 · 신나게");
  });

  it("같은 역할에서 다른 악기를 누르면 겹 수를 늘리지 않고 소리를 바꾼다", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root?.render(<Harness />));

    await click("kick");
    await click("soft-kick");
    expect(container.textContent).toContain("1겹 · 가볍게");
    expect(container.querySelector('[data-testid="beat-instrument-kick"]')?.getAttribute("aria-pressed")).toBe("false");
    expect(container.querySelector('[data-testid="beat-instrument-soft-kick"]')?.getAttribute("aria-pressed")).toBe("true");
  });

  it("추가된 실제 타악기 다섯 가지를 선택 화면에 보여 준다", () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root?.render(<Harness />));

    ["큰 톰", "젬베", "콩가", "카우벨", "트라이앵글"].forEach((name) => {
      expect(container?.textContent).toContain(name);
    });
  });

  it("새로 추가된 비트 악기 여섯 가지를 선택 화면에 보여 준다", () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root?.render(<Harness />));

    ["팀파니", "카혼", "봉고", "클라베스", "라이드 심벌", "귀로"].forEach((name) => {
      expect(container?.textContent).toContain(name);
    });
  });

  it("비트 소리 크기를 사용자가 직접 조절한다", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root?.render(<Harness />));
    const slider = container.querySelector<HTMLInputElement>('[data-testid="beat-volume"]');
    expect(slider?.value).toBe("100");
    await act(async () => {
      if (!slider) return;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(slider, "135");
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.textContent).toContain("135%");
  });
});

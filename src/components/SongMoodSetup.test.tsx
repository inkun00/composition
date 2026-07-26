// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import SongMoodSetup from "./SongMoodSetup";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function renderSetup() {
  const onTempoChange = vi.fn();
  const onRhythmChange = vi.fn();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(
    <SongMoodSetup bpm={96} rhythmStyleId="children_song" disabled={false}
      onTempoChange={onTempoChange} onRhythmChange={onRhythmChange} />
  ));
  return { onTempoChange, onRhythmChange };
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("노래 느낌 사전 설정", () => {
  it("느림·보통·빠름의 BPM과 세 가지 리듬만 쉽게 고른다", () => {
    const callbacks = renderSetup();
    expect(container?.textContent).toContain("느림72 BPM");
    expect(container?.textContent).toContain("보통96 BPM");
    expect(container?.textContent).toContain("빠름128 BPM");
    expect(container?.querySelectorAll(".rhythm-mood-options button")).toHaveLength(3);
    expect(container?.textContent).not.toContain("어떤 악기 느낌이 어울릴까요?");

    act(() => container?.querySelector<HTMLButtonElement>('[data-testid="mood-tempo-fast"]')?.click());
    act(() => container?.querySelector<HTMLButtonElement>('[data-testid="mood-rhythm-medium"]')?.click());
    act(() => container?.querySelector<HTMLButtonElement>('[data-testid="mood-rhythm-long"]')?.click());
    expect(callbacks.onTempoChange).toHaveBeenCalledWith(128);
    expect(callbacks.onRhythmChange).toHaveBeenCalledWith("folk");
    expect(callbacks.onRhythmChange).toHaveBeenCalledWith("opera");
  });
});

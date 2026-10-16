// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import ComposerLyrics, { distributeComposerLyrics } from "./ComposerLyrics";
import type { NoteEvent } from "../music/types";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const notes: NoteEvent[] = [
  { id: "a", pitch: 60, duration: { numerator: 1, denominator: 1 }, lyric: "봄" },
  { id: "rest", pitch: null, duration: { numerator: 1, denominator: 1 } },
  { id: "b", pitch: 64, duration: { numerator: 2, denominator: 1 }, lyric: "날" }
];

describe("일반 작곡 한 줄 가사", () => {
  it("쉼표는 건너뛰고 빈 음표 가사 위치는 유지한다", () => {
    const updated = distributeComposerLyrics(notes, " 꽃");
    expect(updated[0].lyric).toBe("");
    expect(updated[1]).toBe(notes[1]);
    expect(updated[2].lyric).toBe("꽃");
  });

  it("긴 가사 붙여넣기를 일부만 잘라 넣지 않고 제한을 안내한다", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const onChange = vi.fn();
    act(() => root.render(<ComposerLyrics notes={notes} meter={{ beats: 4, beatUnit: 4 }}
      measureIndex={0} selectedNoteId="" onChange={onChange} onFocusNote={() => undefined} />));
    const field = host.querySelector<HTMLInputElement>('input[aria-label="1마디 가사 한 줄"]')!;
    field.setSelectionRange(0, 2);
    const paste = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(paste, "clipboardData", { value: { getData: () => "봄이왔어요" } });
    act(() => field.dispatchEvent(paste));
    expect(paste.defaultPrevented).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
    expect(host.textContent).toContain("2글자까지 넣을 수 있어요");
    expect(field.value).toBe("봄날");
    expect(host.querySelector("details")?.open).toBe(false);
    act(() => root.unmount());
    host.remove();
  });
});

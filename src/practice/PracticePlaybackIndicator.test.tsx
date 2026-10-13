import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { rational } from "../music/rational";
import type { NoteEvent } from "../music/types";
import PracticePlaybackIndicator from "./PracticePlaybackIndicator";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const notes: readonly NoteEvent[] = [
  { id: "eighth", pitch: 60, duration: rational(1, 2) },
  { id: "pause", pitch: null, duration: rational(1, 2) },
  { id: "dotted", pitch: 64, duration: rational(3, 2) }
];

function render(playingNoteId: string | null, active = true, preparing = false) {
  if (!container) {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  }
  act(() => root?.render(
    <PracticePlaybackIndicator notes={notes} playingNoteId={playingNoteId}
      active={active} preparing={preparing} />
  ));
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("마디 재생 위치 안내", () => {
  it("앞 음표 길이를 더해 쉼표와 다음 음표의 시작 박자를 표시한다", () => {
    render("pause");
    expect(container?.textContent).toBe("재생 중 · 2번째 쉼표 · 1.5박부터 0.5박");
    render("dotted");
    expect(container?.textContent).toBe("재생 중 · 3번째 음표 · 2박부터 1.5박");
    expect(container?.querySelector("[aria-live]")).toBeNull();
  });

  it("재생 준비나 정지 중에는 이전 음표를 현재 위치로 안내하지 않는다", () => {
    render("eighth", true, true);
    expect(container?.textContent).toBe("연주 준비 중");
    render("eighth", false);
    expect(container?.textContent).toBe("");
  });
});

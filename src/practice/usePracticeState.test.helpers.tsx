import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, vi } from "vitest";
import { rational } from "../music/rational";
import { emptyPracticeDraft, writePracticeDraft, type PracticeDraft } from "./practiceStorage";
import { usePracticeState } from "./usePracticeState";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
export let current: ReturnType<typeof usePracticeState>;

function Harness() {
  current = usePracticeState();
  return null;
}

export function mount(draft?: PracticeDraft) {
  if (draft) writePracticeDraft(draft);
  act(() => { root.render(<Harness />); });
}

export function fullDraft(): PracticeDraft {
  const draft = emptyPracticeDraft();
  draft.measures[0].lyric = "안녕";
  draft.measures[0].notes = [
    { id: "first-a", pitch: 60, duration: rational(2), lyric: "안" },
    { id: "first-b", pitch: 64, duration: rational(2), lyric: "녕" }
  ];
  draft.measures[1].lyric = "친구";
  draft.measures[1].notes = [
    { id: "second-a", pitch: 67, duration: rational(3), dotted: true, lyric: "친" },
    { id: "second-b", pitch: 72, duration: rational(1), lyric: "구" }
  ];
  return draft;
}

export function setupPracticeStateTests() {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
    vi.restoreAllMocks();
    localStorage.clear();
  });
}

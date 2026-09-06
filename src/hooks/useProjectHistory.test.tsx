// @vitest-environment jsdom

import { act, useMemo, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { useProjectHistory } from "./useProjectHistory";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type TestSnapshot = Readonly<{
  melody: number;
  beat: boolean;
  lyric: string;
}>;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function HistoryHarness() {
  const [melody, setMelody] = useState(60);
  const [beat, setBeat] = useState(false);
  const [lyric, setLyric] = useState("");
  const snapshot = useMemo<TestSnapshot>(() => ({ melody, beat, lyric }), [beat, lyric, melody]);
  const { canUndo, canRedo, undo, redo } = useProjectHistory({
    current: snapshot,
    onRestore: (saved) => {
      setMelody(saved.melody);
      setBeat(saved.beat);
      setLyric(saved.lyric);
    }
  });
  return <div>
    <output data-testid="state">{`${melody}|${beat}|${lyric}`}</output>
    <button type="button" data-testid="melody" onClick={() => setMelody(62)}>악보 바꾸기</button>
    <button type="button" data-testid="beat" onClick={() => setBeat(true)}>비트 바꾸기</button>
    <button type="button" data-testid="lyric" onClick={() => setLyric("봄")}>가사 쓰기</button>
    <button type="button" data-testid="undo" disabled={!canUndo} onClick={undo}>되돌리기</button>
    <button type="button" data-testid="redo" disabled={!canRedo} onClick={redo}>다시 하기</button>
    <input data-testid="lyric-input" data-project-history="true" value={lyric} readOnly />
    <input data-testid="ordinary-input" defaultValue="제목" />
  </div>;
}

function renderHarness() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(<HistoryHarness />));
}

function click(testId: string) {
  act(() => container?.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`)?.click());
}

function pressUndo(target: Element, options: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", {
    key: "z",
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
    ...options
  });
  act(() => target.dispatchEvent(event));
  return event;
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("프로젝트 편집 기록", () => {
  it("Ctrl+Z로 가사, 비트, 악보를 최근 순서대로 되돌린다", () => {
    renderHarness();
    click("melody");
    click("beat");
    click("lyric");
    expect(container?.querySelector('[data-testid="state"]')?.textContent).toBe("62|true|봄");

    const lyricInput = container?.querySelector('[data-testid="lyric-input"]');
    expect(lyricInput).not.toBeNull();
    expect(pressUndo(lyricInput as Element).defaultPrevented).toBe(true);
    expect(container?.querySelector('[data-testid="state"]')?.textContent).toBe("62|true|");

    pressUndo(document.body);
    expect(container?.querySelector('[data-testid="state"]')?.textContent).toBe("62|false|");
    pressUndo(document.body);
    expect(container?.querySelector('[data-testid="state"]')?.textContent).toBe("60|false|");
  });

  it("Ctrl+Shift+Z로 되돌린 편집을 다시 적용한다", () => {
    renderHarness();
    click("beat");
    pressUndo(document.body);
    expect(container?.querySelector('[data-testid="state"]')?.textContent).toBe("60|false|");
    pressUndo(document.body, { shiftKey: true });
    expect(container?.querySelector('[data-testid="state"]')?.textContent).toBe("60|true|");
  });

  it("일반 글 입력칸에서는 브라우저의 기본 되돌리기를 막지 않는다", () => {
    renderHarness();
    click("melody");
    const ordinaryInput = container?.querySelector('[data-testid="ordinary-input"]');
    expect(ordinaryInput).not.toBeNull();
    const event = pressUndo(ordinaryInput as Element);
    expect(event.defaultPrevented).toBe(false);
    expect(container?.querySelector('[data-testid="state"]')?.textContent).toBe("62|false|");
  });
});

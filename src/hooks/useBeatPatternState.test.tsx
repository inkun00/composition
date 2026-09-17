// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useBeatPatternState } from "./useBeatPatternState";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let current: ReturnType<typeof useBeatPatternState>;

function Harness() {
  current = useBeatPatternState({ meter: { beats: 4, beatUnit: 4 } });
  return null;
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("useBeatPatternState", () => {
  it("기본 상태와 초기값을 정규화하여 설정한다", () => {
    act(() => {
      root.render(<Harness />);
    });
    expect(current.beatPattern).toEqual([]);
    expect(current.beatVolume).toBe(100);
    expect(current.beatPreviewing).toBe(false);
  });

  it("비트 패턴 및 볼륨을 업데이트하고 리셋할 수 있다", () => {
    act(() => {
      root.render(<Harness />);
    });
    act(() => {
      current.setBeatVolume(120);
      current.setBeatPattern([
        { id: "b1", instrumentId: "kick", measureIndex: 0, offsetBeats: 0 }
      ]);
    });
    expect(current.beatVolume).toBe(120);
    expect(current.beatPattern).toHaveLength(1);

    act(() => {
      current.resetBeatPattern();
    });
    expect(current.beatPattern).toHaveLength(0);
  });
});

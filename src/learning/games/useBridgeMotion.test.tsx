import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBridgeSceneMotion, useBridgeTileMotion } from "./useBridgeMotion";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let nextFrame: number;
let frames: Map<number, FrameRequestCallback>;
const disconnected = vi.fn();
const removedListener = vi.fn();

function MotionFixture({ cleared = true }: { cleared?: boolean }) {
  const motion = useBridgeSceneMotion(cleared, 1, "first");
  const tileRef = useBridgeTileMotion();
  return <div ref={motion.sceneRef}>
    <div ref={motion.travelerRef} data-testid="traveler" />
    <div ref={motion.trackRef}><div ref={tileRef} /></div>
  </div>;
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  nextFrame = 0;
  frames = new Map();
  disconnected.mockClear();
  removedListener.mockClear();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    disconnect() { disconnected(); }
  });
  vi.stubGlobal("matchMedia", () => ({
    matches: false, addEventListener: vi.fn(), removeEventListener: removedListener
  }));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("bridge motion lifecycle", () => {
  it("cancels each animation and disconnects scene measurements on unmount", () => {
    act(() => root.render(<MotionFixture />));
    expect(frames.size).toBe(3);
    act(() => root.render(null));
    expect(frames.size).toBe(0);
    expect(disconnected).toHaveBeenCalledOnce();
    expect(removedListener).toHaveBeenCalledTimes(2);
  });

  it("immediately places the successful bird on the far bank with reduced motion", () => {
    vi.stubGlobal("matchMedia", () => ({
      matches: true, addEventListener: vi.fn(), removeEventListener: removedListener
    }));
    const width = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(600);
    act(() => root.render(<MotionFixture />));
    expect(frames.size).toBe(0);
    const traveler = container.querySelector<HTMLElement>('[data-testid="traveler"]');
    expect(traveler?.style.transform).toContain("translate3d(312px, 0px, 0)");
    width.mockRestore();
  });
});

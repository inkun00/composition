import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ScoreMeasure from "./ScoreMeasure";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const renderCount = vi.hoisted(() => ({ value: 0 }));

vi.mock("../music/vexflow", () => {
  class Renderer {
    static Backends = { SVG: 1, CANVAS: 2 };
    svg: SVGSVGElement;
    constructor(host: HTMLElement) {
      renderCount.value += 1;
      this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      host.append(this.svg);
    }
    resize() {}
    getContext() { return { svg: this.svg, setFillStyle() {}, setStrokeStyle() {} }; }
  }
  class Stave {
    addClef() { return this; }
    addTimeSignature() { return this; }
    setEndBarType() { return this; }
    setStyle() { return this; }
    setNoteStartX() { return this; }
    setContext() { return this; }
    draw() {}
  }
  class StaveNote {
    element = document.createElementNS("http://www.w3.org/2000/svg", "g");
    constructor() {
      const head = document.createElementNS("http://www.w3.org/2000/svg", "path");
      head.classList.add("vf-notehead");
      this.element.append(head);
    }
    setStyle() { return this; }
    setStemStyle() { return this; }
    setFlagStyle() { return this; }
    getSVGElement() { return this.element; }
    getBoundingBox() { return { getX: () => 70, getW: () => 20, getY: () => 40, getH: () => 10 }; }
    getAbsoluteX() { return 80; }
  }
  class Voice {
    static Mode = { SOFT: 1 };
    notes: StaveNote[] = [];
    setMode() { return this; }
    addTickables(notes: StaveNote[]) { this.notes = notes; }
    draw(context: { svg: SVGSVGElement }) {
      this.notes.forEach((note) => context.svg.append(note.element));
    }
  }
  class Formatter {
    joinVoices() { return this; }
    format() { return this; }
  }
  return { loadVexFlow: async () => ({
    Renderer, Stave, StaveNote, Voice, Formatter, Stem: { UP: 1, DOWN: -1 },
    BarlineType: { END: 1, SINGLE: 2 }, Beam: { generateBeams: () => [] }
  }) };
});

class ResizeObserverMock {
  static instances: ResizeObserverMock[] = [];
  observe = vi.fn();
  disconnect = vi.fn();
  constructor(readonly callback: ResizeObserverCallback) {
    ResizeObserverMock.instances.push(this);
  }
  resize(width: number, height: number) {
    this.callback([{ contentRect: new DOMRect(0, 0, width, height) } as ResizeObserverEntry],
      this as unknown as ResizeObserver);
  }
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let svgBox = new DOMRect();
let headBox = new DOMRect();
let nextFrame = 0;
const frames = new Map<number, FrameRequestCallback>();

beforeEach(() => {
  svgBox = new DOMRect();
  headBox = new DOMRect();
  frames.clear();
  nextFrame = 0;
  renderCount.value = 0;
  ResizeObserverMock.instances = [];
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => { frames.delete(id); });
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    if (this.matches(".vex-score-layer > svg")) return svgBox;
    if (this.matches(".vf-notehead")) return headBox;
    return new DOMRect();
  });
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function mount() {
  const onNoteLayout = vi.fn();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<ScoreMeasure notes={[{ id: "note", pitch: 60, duration: { numerator: 1, denominator: 1 } }]}
      onNoteLayout={onNoteLayout} />);
  });
  return onNoteLayout;
}

function nextAnimationFrame() {
  const pending = [...frames.entries()];
  frames.clear();
  act(() => pending.forEach(([, callback]) => callback(0)));
}

function settleLayout() {
  nextAnimationFrame();
  nextAnimationFrame();
}

describe("접힌 악보를 펼칠 때 음표 위치 재측정", () => {
  it("처음 숨겨진 악보와 이후 크기 변경에서 실제 음표·가사 위치를 다시 맞춘다", async () => {
    const onNoteLayout = await mount();
    settleLayout();
    expect(onNoteLayout).toHaveBeenLastCalledWith({ note: { x: 80, y: 45 } });
    const observer = ResizeObserverMock.instances[0];
    expect(observer.observe).toHaveBeenCalledWith(container?.querySelector(".vex-score-layer"));

    svgBox = new DOMRect(20, 30, 350, 98);
    headBox = new DOMRect(120, 55, 10, 6);
    observer.resize(350, 98);
    settleLayout();
    expect(onNoteLayout).toHaveBeenLastCalledWith({ note: { x: 210, y: 56 } });
    const target = container?.querySelector(".note-hit");
    const targetCenter = Number(target?.getAttribute("y")) + Number(target?.getAttribute("height")) / 2;
    expect(Math.abs(targetCenter - 56)).toBeLessThanOrEqual(1);

    svgBox = new DOMRect(20, 30, 700, 196);
    headBox = new DOMRect(250, 90, 20, 12);
    observer.resize(700, 196);
    settleLayout();
    expect(onNoteLayout).toHaveBeenLastCalledWith({ note: { x: 240, y: 66 } });
    expect(renderCount.value).toBe(1);
  });

  it("재측정 프레임 도중 제거하면 관찰과 예약을 정리하고 늦은 알림을 무시한다", async () => {
    const onNoteLayout = await mount();
    settleLayout();
    const observer = ResizeObserverMock.instances[0];
    const callsBefore = onNoteLayout.mock.calls.length;
    observer.resize(350, 98);
    nextAnimationFrame();
    expect(frames.size).toBe(1);
    act(() => root?.unmount());
    root = null;
    expect(observer.disconnect).toHaveBeenCalledOnce();
    expect(frames.size).toBe(0);
    observer.resize(350, 98);
    settleLayout();
    expect(frames.size).toBe(0);
    expect(onNoteLayout).toHaveBeenCalledTimes(callsBefore);
  });
});

// @vitest-environment jsdom

import { act, createRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_ELEMENTS, type MusicVideoScene, type SceneElement } from "../video/musicVideoModel";
import SceneCanvas, { type SceneCanvasHandle } from "./SceneCanvas";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Props = Parameters<typeof SceneCanvas>[0];
let root: Root;
let host: HTMLDivElement;
let canvas: SVGSVGElement;
let onChange: ReturnType<typeof vi.fn>;
let onStatus: ReturnType<typeof vi.fn>;
let capture: ReturnType<typeof vi.fn>;
let release: ReturnType<typeof vi.fn>;
const emptyScene: MusicVideoScene = {
  id: "scene", background: "#ffffff", motion: "auto", endLyric: null, elements: []
};

function render(overrides: Partial<Props> = {}) {
  act(() => root.render(<SceneCanvas scene={emptyScene} tool="brush" color="#2356ab" width={8}
    disabled={false} onChange={onChange} onStatus={onStatus} {...overrides} />));
  canvas = host.querySelector("svg")!;
  const captured = new Set<number>();
  capture = vi.fn((id: number) => { captured.add(id); });
  release = vi.fn((id: number) => { captured.delete(id); });
  Object.defineProperties(canvas, {
    setPointerCapture: { configurable: true, value: capture },
    hasPointerCapture: { configurable: true, value: (id: number) => captured.has(id) },
    releasePointerCapture: { configurable: true, value: release },
    getBoundingClientRect: { configurable: true, value: () => ({ left: 10, top: 20, width: 480, height: 270 }) }
  });
}

function pointer(type: string, x: number, y: number,
  overrides: Partial<{ pointerId: number; pointerType: string; pressure: number; button: number;
    shiftKey: boolean; ctrlKey: boolean; metaKey: boolean;
    getCoalescedEvents: () => PointerEvent[] }> = {}) {
  const { button = 0, shiftKey = false, ctrlKey = false, metaKey = false, ...pointerProperties } = overrides;
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button,
    shiftKey, ctrlKey, metaKey });
  Object.assign(event, { pointerId: 7, pointerType: "mouse", pressure: 0, ...pointerProperties });
  act(() => canvas.dispatchEvent(event));
}

function completedScene(): MusicVideoScene {
  expect(onChange).toHaveBeenCalledOnce();
  return onChange.mock.calls[0][0] as MusicVideoScene;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 16));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  onChange = vi.fn();
  onStatus = vi.fn();
});

describe("장면 개체 선택 입력", () => {
  const rectangle: SceneElement = { id: "box", tool: "rectangle", color: "#ef4444", width: 8,
    points: [[100, 100, .5], [300, 300, .5]] };
  const top: SceneElement = { id: "top-stroke", tool: "line", color: "#22c55e", width: 8,
    points: [[150, 200, .5], [200, 200, .5], [250, 200, .5]] };
  const drawn = { ...emptyScene, elements: [rectangle, top] };

  it.each(["mouse", "pen", "touch"])("%s 한 번 누르기로 최상단 개체 전체를 선택하고 그림이나 히스토리를 수정하지 않는다", (pointerType) => {
    const onSelectElement = vi.fn();
    const original = structuredClone(drawn);
    render({ tool: "select", scene: drawn, onSelectElement });
    pointer("pointerdown", 110, 120, { pointerType, pressure: .8 });
    pointer("pointermove", 120, 120, { pointerType });
    pointer("pointerup", 120, 120, { pointerType });
    expect(onSelectElement).toHaveBeenCalledExactlyOnceWith("top-stroke", false);
    expect(onChange).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
    expect(drawn).toEqual(original);
    expect(top.points).toHaveLength(3);
  });

  it("닫힌 도형의 안쪽과 빈 곳을 구분하며 추가 선택 키를 전달한다", () => {
    const onSelectElement = vi.fn();
    render({ tool: "select", scene: drawn, onSelectElement });
    pointer("pointerdown", 75, 85, { shiftKey: true });
    expect(onSelectElement).toHaveBeenLastCalledWith("box", true);
    pointer("pointerdown", 400, 50);
    expect(onSelectElement).toHaveBeenLastCalledWith(null, false);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("선택 윤곽은 원본 path를 바꾸지 않는 별도 파란 오버레이로 표시한다", () => {
    render({ tool: "select", scene: drawn, selectedIds: ["top-stroke"] });
    expect(canvas.querySelectorAll(":scope > path")).toHaveLength(2);
    const overlay = canvas.querySelector('[data-testid="scene-selection-outline"]')!;
    expect(overlay.getAttribute("pointer-events")).toBe("none");
    expect(overlay.querySelectorAll("[data-element-id]")).toHaveLength(1);
    expect(overlay.querySelector('[data-element-id="top-stroke"]')).not.toBeNull();
    expect(overlay.querySelector("rect")!.getAttribute("stroke")).toBe("#1a73e8");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("그릴 수 있는 개체 수가 꽉 차도 선택은 계속 허용한다", () => {
    const onSelectElement = vi.fn();
    const full = { ...emptyScene, elements: Array.from({ length: MAX_ELEMENTS }, (_, index) =>
      ({ ...rectangle, id: `box-${index}` })) };
    render({ tool: "select", scene: full, onSelectElement });
    pointer("pointerdown", 110, 120);
    expect(onSelectElement).toHaveBeenCalledExactlyOnceWith(`box-${MAX_ELEMENTS - 1}`, false);
    expect(onStatus).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("장면 그림판 포인터 입력", () => {
  it("화면 크기를 그림 좌표로 변환하고 펜 압력과 마지막 점을 한 번에 저장한다", () => {
    render();
    pointer("pointerdown", 60, 45, { pointerType: "pen", pressure: .37 });
    pointer("pointermove", 110, 70, { pointerType: "pen", pressure: .81 });
    expect(onChange).not.toHaveBeenCalled();
    expect(canvas.querySelectorAll(":scope > path")).toHaveLength(1);
    expect(capture).toHaveBeenCalledWith(7);
    pointer("pointerup", 160, 95, { pointerType: "pen", pressure: .24 });
    expect(completedScene()).toMatchObject({
      ...emptyScene,
      elements: [{ tool: "brush", color: "#2356ab", width: 8,
        points: [[100, 50, .37], [200, 100, .81], [300, 150, .24]] }]
    });
    expect(release).toHaveBeenCalledWith(7);
  });

  it.each(["line", "rectangle", "ellipse"] as const)("%s 도형은 시작점과 최종점만 보존한다", (tool) => {
    render({ tool });
    pointer("pointerdown", 35, 45);
    pointer("pointermove", 110, 95);
    pointer("pointermove", 160, 145);
    pointer("pointerup", 210, 195);
    expect(completedScene().elements[0]).toMatchObject({ tool, points: [[50, 50, .5], [400, 350, .5]] });
  });

  it("그림 밖에서 끝나는 드래그는 경계 안으로 맞추고 다른 손가락 입력을 섞지 않는다", () => {
    render({ tool: "line" });
    pointer("pointerdown", -30, -10);
    pointer("pointermove", 80, 80, { pointerId: 9 });
    pointer("pointerup", 80, 80, { pointerId: 9 });
    expect(onChange).not.toHaveBeenCalled();
    pointer("pointerup", 900, 900);
    expect(completedScene().elements[0].points).toEqual([[0, 0, .5], [960, 540, .5]]);
  });

  it("지우개로 실제 선을 가로지른 요소만 지우고 떨어진 그림은 보존한다", () => {
    const crossed: SceneElement = {
      id: "crossed", tool: "line", color: "#112233", width: 6, points: [[100, 100, .5], [300, 100, .5]]
    };
    const preserved: SceneElement = { ...crossed, id: "preserved", points: [[100, 300, .5], [300, 300, .5]] };
    render({ tool: "eraser", scene: { ...emptyScene, elements: [crossed, preserved] } });
    pointer("pointerdown", 35, 30);
    pointer("pointermove", 110, 70);
    act(() => vi.advanceTimersByTime(16));
    expect(onChange).not.toHaveBeenCalled();
    expect(canvas.querySelectorAll(":scope > path")).toHaveLength(1);
    pointer("pointerup", 110, 70);
    expect(completedScene().elements).toEqual([preserved]);
  });

  it.each(["pointercancel", "lostpointercapture"])("%s 때도 마지막으로 그린 점까지 저장하고 다음 그리기를 허용한다", (event) => {
    render();
    pointer("pointerdown", 60, 45);
    pointer("pointermove", 110, 70);
    pointer(event, 110, 70);
    pointer("pointerup", 160, 95);
    expect(completedScene().elements[0].points).toEqual([[100, 50, .5], [200, 100, .5]]);
    expect(canvas.querySelectorAll(":scope > path")).toHaveLength(0);
    pointer("pointerdown", 210, 120);
    pointer("pointerup", 260, 145);
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange.mock.calls[1][0].elements[0].points).toEqual([[400, 200, .5], [500, 250, .5]]);
  });

  it("그리는 동안 체크포인트를 제한된 간격과 같은 제스처 ID로 프로젝트에 전달한다", () => {
    const onGestureChange = vi.fn();
    render({ onGestureChange });
    pointer("pointerdown", 60, 45);
    const first = onGestureChange.mock.calls[0];
    expect(first[0].elements[0].points).toEqual([[100, 50, .5]]);
    pointer("pointermove", 110, 70);
    expect(onGestureChange).toHaveBeenCalledOnce();
    act(() => vi.advanceTimersByTime(120));
    expect(onGestureChange.mock.calls.at(-1)![0].elements[0].points)
      .toEqual([[100, 50, .5], [200, 100, .5]]);
    const checkpoint = onGestureChange.mock.calls.at(-1)![0];
    render({ scene: checkpoint, onGestureChange });
    pointer("pointerup", 160, 95);
    expect(onGestureChange.mock.calls.at(-1)![0].elements[0].points)
      .toEqual([[100, 50, .5], [200, 100, .5], [300, 150, .5]]);
    expect(new Set(onGestureChange.mock.calls.map((call) => call[1])).size).toBe(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("한 프레임의 많은 입력은 한 번만 그려도 점을 빠짐없이 보존하고 저장은 120ms마다 제한한다", () => {
    const onGestureChange = vi.fn();
    render({ onGestureChange });
    pointer("pointerdown", 20, 30);
    const first = structuredClone(onGestureChange.mock.calls[0][0]);
    for (let index = 1; index <= 100; index++) pointer("pointermove", 20 + index * 2, 30 + index);
    expect(onGestureChange).toHaveBeenCalledOnce();
    act(() => vi.advanceTimersByTime(16));
    expect(canvas.querySelectorAll(":scope > path")).toHaveLength(1);
    expect(onGestureChange).toHaveBeenCalledOnce();
    act(() => vi.advanceTimersByTime(104));
    expect(onGestureChange).toHaveBeenCalledTimes(2);
    const middle = onGestureChange.mock.calls[1][0] as MusicVideoScene;
    const middleSnapshot = structuredClone(middle);
    expect(middle.elements[0].points).toHaveLength(101);
    pointer("pointermove", 222, 131);
    pointer("pointermove", 224, 132);
    pointer("pointerup", 226, 133);
    expect(onGestureChange).toHaveBeenCalledTimes(3);
    const last = onGestureChange.mock.calls[2][0] as MusicVideoScene;
    expect(last.elements[0].points).toHaveLength(104);
    expect(last.elements[0].points.at(-1)).toEqual([432, 226, .5]);
    expect(onGestureChange.mock.calls[0][0]).toEqual(first);
    expect(middle).toEqual(middleSnapshot);
    act(() => vi.advanceTimersByTime(1000));
    expect(onGestureChange).toHaveBeenCalledTimes(3);
  });

  it("펜이 묶어 보낸 중간 점과 압력을 보존하고 마지막 이벤트를 중복 저장하지 않는다", () => {
    render();
    pointer("pointerdown", 60, 45, { pointerType: "pen", pressure: .2 });
    pointer("pointermove", 160, 95, { pointerType: "pen", pressure: .8,
      getCoalescedEvents: () => [
        { clientX: 110, clientY: 70, pointerType: "pen", pressure: .5 },
        { clientX: 160, clientY: 95, pointerType: "pen", pressure: .8 }
      ] as PointerEvent[] });
    pointer("pointerup", 210, 120, { pointerType: "pen", pressure: .7 });
    expect(completedScene().elements[0].points).toEqual([
      [100, 50, .2], [200, 100, .5], [300, 150, .8], [400, 200, .7]
    ]);
  });

  it.each(["pointercancel", "lostpointercapture", "pagehide", "beforeunload", "visibilitychange", "unmount"])(
    "체크포인트 직후 추가된 점도 %s에서 즉시 보존한다", (event) => {
      const onGestureChange = vi.fn();
      render({ onGestureChange });
      pointer("pointerdown", 60, 45);
      pointer("pointermove", 110, 70);
      act(() => vi.advanceTimersByTime(120));
      pointer("pointermove", 160, 95);
      act(() => {
        if (event === "unmount") root.unmount();
        else if (event === "visibilitychange") {
          vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
          document.dispatchEvent(new Event(event));
        } else if (event === "pagehide" || event === "beforeunload") window.dispatchEvent(new Event(event));
        else pointer(event, 160, 95);
      });
      expect(onGestureChange.mock.calls.at(-1)![0].elements[0].points)
        .toEqual([[100, 50, .5], [200, 100, .5], [300, 150, .5]]);
      const calls = onGestureChange.mock.calls.length;
      act(() => vi.advanceTimersByTime(1000));
      expect(onGestureChange).toHaveBeenCalledTimes(calls);
    });

  it.each(["pagehide", "beforeunload", "visibilitychange"])(
    "%s 저장 처리기가 실행되기 전에 부모 React 상태까지 마지막 점을 반영한다", (event) => {
      let pointsSeenByStorage = 0;
      const target = event === "visibilitychange" ? document : window;
      const readStorage = () => {
        pointsSeenByStorage = Number(host.querySelector("output")?.textContent);
      };
      // The application installs this bubble listener before its child drawing surface mounts.
      target.addEventListener(event, readStorage);
      const statefulRef = createRef<SceneCanvasHandle>();
      function StatefulCanvas() {
        const [scene, setScene] = useState(emptyScene);
        return <><output>{scene.elements[0]?.points.length ?? 0}</output>
          <SceneCanvas ref={statefulRef} scene={scene} tool="brush" color="#2356ab" width={8}
            disabled={false} onChange={setScene} onGestureChange={setScene} onStatus={onStatus} /></>;
      }
      render();
      act(() => root.render(<StatefulCanvas />));
      canvas = host.querySelector("svg")!;
      Object.defineProperties(canvas, {
        setPointerCapture: { configurable: true, value: vi.fn() },
        hasPointerCapture: { configurable: true, value: () => false },
        getBoundingClientRect: { configurable: true,
          value: () => ({ left: 10, top: 20, width: 480, height: 270 }) }
      });
      pointer("pointerdown", 60, 45);
      pointer("pointermove", 110, 70);
      act(() => vi.advanceTimersByTime(120));
      pointer("pointermove", 160, 95);
      expect(host.querySelector("output")?.textContent).toBe("2");
      if (event === "visibilitychange") {
        vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
      }
      act(() => {
        target.dispatchEvent(new Event(event));
        expect(host.querySelector("output")?.textContent).toBe("3");
      });
      expect(pointsSeenByStorage).toBe(3);
      target.removeEventListener(event, readStorage);
    });

  it("그리기 상태는 최초 체크포인트 전에 시작하고 마지막 점 저장 후 끝낸다", () => {
    const order: string[] = [];
    const onDrawingChange = vi.fn((drawing: boolean) => order.push(drawing ? "start" : "end"));
    const onGestureChange = vi.fn(() => order.push("save"));
    render({ onDrawingChange, onGestureChange });
    pointer("pointerdown", 60, 45);
    pointer("pointermove", 110, 70);
    pointer("pointerup", 160, 95);
    expect(order).toEqual(["start", "save", "save", "end"]);
    expect(onDrawingChange).toHaveBeenCalledTimes(2);
  });

  it("저장 대기 중 초기화한 그림은 타이머가 되살리지 않고 그리기 상태도 종료한다", () => {
    const onGestureChange = vi.fn();
    const onDrawingChange = vi.fn();
    render({ onGestureChange, onDrawingChange });
    pointer("pointerdown", 60, 45);
    pointer("pointermove", 110, 70);
    act(() => vi.advanceTimersByTime(120));
    const checkpoint = onGestureChange.mock.calls.at(-1)![0] as MusicVideoScene;
    render({ scene: checkpoint, onGestureChange, onDrawingChange });
    pointer("pointermove", 160, 95);
    render({ scene: { ...checkpoint, elements: [] }, onGestureChange, onDrawingChange });
    const calls = onGestureChange.mock.calls.length;
    act(() => vi.advanceTimersByTime(1000));
    pointer("pointerup", 210, 120);
    expect(onGestureChange).toHaveBeenCalledTimes(calls);
    expect(onDrawingChange.mock.calls).toEqual([[true], [false]]);
    expect(canvas.querySelectorAll(":scope > path")).toHaveLength(0);
  });

  it("구조 변경 전 명시적인 flush는 대기 중 마지막 점을 정확히 한 번 저장하고 예약을 취소한다", () => {
    const ref = createRef<SceneCanvasHandle>();
    const onGestureChange = vi.fn();
    const onDrawingChange = vi.fn();
    render({ ref, onGestureChange, onDrawingChange });
    pointer("pointerdown", 60, 45);
    pointer("pointermove", 110, 70);
    act(() => vi.advanceTimersByTime(120));
    pointer("pointermove", 160, 95);
    act(() => ref.current!.flush());
    expect(onGestureChange).toHaveBeenCalledTimes(3);
    expect(onGestureChange.mock.calls.at(-1)![0].elements[0].points)
      .toEqual([[100, 50, .5], [200, 100, .5], [300, 150, .5]]);
    expect(onDrawingChange.mock.calls).toEqual([[true], [false]]);
    act(() => ref.current!.flush());
    act(() => vi.advanceTimersByTime(1000));
    pointer("pointerup", 210, 120);
    expect(onGestureChange).toHaveBeenCalledTimes(3);
  });

  it("도구 버튼으로 포커스를 옮기면 클릭 전에 진행 중인 점을 저장한다", () => {
    const onGestureChange = vi.fn();
    render({ onGestureChange });
    pointer("pointerdown", 60, 45);
    pointer("pointermove", 110, 70);
    const button = document.createElement("button");
    host.append(button);
    act(() => button.focus());
    expect(onGestureChange).toHaveBeenCalledTimes(2);
    expect(onGestureChange.mock.calls.at(-1)![0].elements[0].points)
      .toEqual([[100, 50, .5], [200, 100, .5]]);
    act(() => vi.advanceTimersByTime(1000));
    expect(onGestureChange).toHaveBeenCalledTimes(2);
  });

  it.each(["pagehide", "visibilitychange", "unmount"])("%s 전에 진행 중인 선을 보존한다", (event) => {
    render();
    pointer("pointerdown", 60, 45);
    pointer("pointermove", 110, 70);
    act(() => {
      if (event === "unmount") root.unmount();
      else if (event === "visibilitychange") {
        vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
        document.dispatchEvent(new Event("visibilitychange"));
      } else window.dispatchEvent(new Event(event));
    });
    expect(completedScene().elements[0].points).toEqual([[100, 50, .5], [200, 100, .5]]);
  });

  it.each(["tool", "scene"])("%s 전환 시 원래 장면에 진행 중인 선을 남긴다", (change) => {
    render();
    pointer("pointerdown", 60, 45);
    pointer("pointermove", 110, 70);
    render(change === "tool" ? { tool: "line" } : { scene: { ...emptyScene, id: "next-scene" } });
    expect(completedScene()).toMatchObject({ id: emptyScene.id,
      elements: [{ tool: "brush", points: [[100, 50, .5], [200, 100, .5]] }] });
  });

  it("그리는 중 바뀐 배경과 모션을 이전 값으로 덮어쓰지 않는다", () => {
    render();
    pointer("pointerdown", 60, 45);
    pointer("pointermove", 110, 70);
    render({ scene: { ...emptyScene, background: "#fff8ed", motion: "bounce" } });
    pointer("pointerup", 160, 95);
    expect(completedScene()).toMatchObject({ background: "#fff8ed", motion: "bounce" });
  });

  it("그리는 중 초기화되거나 불러온 장면을 미완성 선으로 되살리지 않는다", () => {
    render();
    pointer("pointerdown", 60, 45);
    pointer("pointermove", 110, 70);
    render({ scene: { ...emptyScene, elements: [] } });
    pointer("pointerup", 160, 95);
    expect(onChange).not.toHaveBeenCalled();
    expect(canvas.querySelectorAll(":scope > path")).toHaveLength(0);
  });

  it("전체 그림의 남은 저장 한도 안에서 마지막 선을 보존하며 한도를 안내한다", () => {
    render({ remainingPoints: 2 });
    pointer("pointerdown", 60, 45);
    pointer("pointermove", 110, 70);
    pointer("pointermove", 160, 95);
    pointer("pointerup", 210, 120);
    expect(completedScene().elements[0].points).toEqual([[100, 50, .5], [400, 200, .5]]);
    expect(onStatus.mock.calls.at(-1)![0]).toContain("저장 한도");
    render({ remainingPoints: 0 });
    pointer("pointerdown", 60, 45);
    expect(capture).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("잠긴 그림판과 마우스 보조 버튼은 그리기를 시작하지 않는다", () => {
    render({ disabled: true });
    pointer("pointerdown", 60, 45);
    pointer("pointerup", 110, 70);
    expect(capture).not.toHaveBeenCalled();
    render();
    pointer("pointerdown", 60, 45, { button: 2 });
    pointer("pointerup", 110, 70, { button: 2 });
    expect(capture).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });
});

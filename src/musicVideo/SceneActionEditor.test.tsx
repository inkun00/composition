// @vitest-environment jsdom

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getMusicVideoMeasures, type MusicVideoScene, type SceneElement } from "../video/musicVideoModel";
import { createSceneAction, createSceneActor } from "../video/sceneActionTypes";
import type { MusicVideoMeasure } from "../video/musicVideoMeasures";
import SceneActionEditor from "./SceneActionEditor";
import SceneActionOverlay from "./SceneActionOverlay";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const elements: readonly SceneElement[] = [
  { id: "finger", tool: "line", color: "#202030", width: 8, points: [[100, 100, .5], [300, 180, .5]] },
  { id: "switch", tool: "rectangle", color: "#202030", width: 5, points: [[400, 100, .5], [440, 180, .5]] }
];
const song: readonly MusicVideoMeasure[] = [{ measureIndex: 0, notes: [
  { id: "n0", lyric: "손으로", pitch: 60, duration: { numerator: 1, denominator: 1 } },
  { id: "n1", lyric: "눌러요", pitch: 60, duration: { numerator: 3, denominator: 1 } }
] }];
const blank: MusicVideoScene = { id: "scene", background: "#ffffff", motion: "auto", endLyric: null,
  endMeasureIndex: 0, elements };
let root: Root;
let host: HTMLDivElement;
let current: MusicVideoScene;
let commits: ReturnType<typeof vi.fn>;
let status: ReturnType<typeof vi.fn>;

function Harness({ initial = blank, source = song }: { initial?: MusicVideoScene; source?: readonly MusicVideoMeasure[] }) {
  const [scene, setScene] = useState(initial);
  const [actorId, setActorId] = useState<string | null>(initial.choreography?.actors[0]?.id ?? null);
  current = scene;
  const change = (next: MusicVideoScene) => { commits(next); setScene(next); };
  return <><SceneActionEditor scene={scene} measures={getMusicVideoMeasures(source, 120)} sourceMeasures={source} bpm={120}
    selectedActorId={actorId} disabled={false} onSelectedActorChange={setActorId} onChange={change} onStatus={status} />
    <SceneActionOverlay scene={scene} selectedActorId={actorId} disabled={false} onChange={change} onStatus={status} /></>;
}

function mount(initial = blank, source = song) {
  act(() => root.render(<Harness initial={initial} source={source} />));
}

function labelled<T extends Element = HTMLButtonElement>(label: string): T {
  const element = host.querySelector<T>(`[aria-label="${label}"]`);
  if (!element) throw new Error(`${label} 항목이 없습니다.`);
  return element;
}

function click(element: Element) { act(() => (element as HTMLElement).click()); }
function changeSelect(label: string, value: string) {
  const select = labelled<HTMLSelectElement>(label);
  act(() => { select.value = value; select.dispatchEvent(new Event("change", { bubbles: true })); });
}

function pointer(target: Element, type: string, x: number, y: number) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y });
  Object.assign(event, { pointerId: 4, pointerType: "mouse" });
  act(() => target.dispatchEvent(event));
}

function canvas() {
  const svg = host.querySelector<SVGSVGElement>("[data-testid='scene-action-canvas']")!;
  Object.defineProperties(svg, {
    setPointerCapture: { configurable: true, value: vi.fn() },
    hasPointerCapture: { configurable: true, value: () => false },
    getBoundingClientRect: { configurable: true, value: () => ({ left: 0, top: 0, width: 960, height: 540 }) }
  });
  return svg;
}

beforeEach(() => {
  commits = vi.fn();
  status = vi.fn();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

describe("장면별 대상과 동작 편집", () => {
  it("그림의 선을 대상으로 묶고 지원 동작과 시작 마디를 편집한다", () => {
    mount();
    click(labelled("손 대상 추가"));
    expect(current.choreography!.actors[0].elementIds).toEqual([]);
    expect(host.querySelector<HTMLButtonElement>("[data-testid='scene-add-action']")!.disabled).toBe(true);
    click(labelled("1번 선 포함"));
    expect(current.choreography!.actors[0].elementIds).toEqual(["finger"]);
    click(host.querySelector("[data-testid='scene-add-action']")!);
    changeSelect("1번 동작 종류", "bend");
    expect(current.choreography!.actions[0]).toMatchObject({ kind: "bend", startMeasureIndex: 0, startBeat: 0 });
    expect(current.elements).toBe(elements);
  });

  it("다른 대상에서 선택한 선은 새 대상으로 이동시켜 이중 변형을 막는다", () => {
    const hand = createSceneActor([elements[0]], "손");
    const button = createSceneActor([elements[1]], "스위치");
    mount({ ...blank, choreography: { version: 1, description: "", actors: [hand, button], actions: [] } });
    click(labelled("2번 선 포함"));
    expect(current.choreography!.actors[0].elementIds).toEqual(["finger", "switch"]);
    expect(current.choreography!.actors[1].elementIds).toEqual([]);
  });

  it("가사의 동사에 맞춰 대상의 동작을 제안하고 수동 동작과 중복 제안을 보존한다", () => {
    const hand = createSceneActor([elements[0]], "손");
    const manual = createSceneAction(hand.id, "bend");
    mount({ ...blank, choreography: { version: 1, description: "", actors: [hand], actions: [manual] } });
    click(host.querySelector("[data-testid='scene-recommend-actions']")!);
    expect(current.choreography!.actions).toContainEqual(manual);
    expect(current.choreography!.actions.find((action) => action.kind === "press")).toMatchObject({
      actorId: hand.id, startMeasureIndex: 0, startBeat: 1
    });
    const count = current.choreography!.actions.length;
    click(host.querySelector("[data-testid='scene-recommend-actions']")!);
    expect(current.choreography!.actions).toHaveLength(count);
  });

  it("장면의 마지막 짧은 마디에 추가한 동작의 길이를 장면 끝으로 제한한다", () => {
    const hand = createSceneActor([elements[0]], "손");
    const source: readonly MusicVideoMeasure[] = [{ measureIndex: 0, notes: [
      { id: "short", pitch: 60, lyric: "손", duration: { numerator: 1, denominator: 2 } }
    ] }];
    mount({ ...blank, choreography: { version: 1, description: "", actors: [hand], actions: [] } }, source);
    click(host.querySelector("[data-testid='scene-add-action']")!);
    expect(current.choreography!.actions[0].durationBeats).toBe(.5);
  });
});

describe("그림 위의 부분 동작 제어", () => {
  it("선을 클릭하거나 영역을 드래그해 대상에 포함하고 취소한 선택은 저장하지 않는다", () => {
    const hand = createSceneActor([], "손");
    mount({ ...blank, choreography: { version: 1, description: "", actors: [hand], actions: [] } });
    const svg = canvas();
    pointer(svg, "pointerdown", 190, 135);
    pointer(svg, "pointerup", 190, 135);
    expect(current.choreography!.actors[0].elementIds).toEqual(["finger"]);
    const count = commits.mock.calls.length;
    pointer(svg, "pointerdown", 380, 80);
    pointer(svg, "pointermove", 460, 200);
    pointer(svg, "pointercancel", 460, 200);
    expect(commits).toHaveBeenCalledTimes(count);
    pointer(svg, "pointerdown", 380, 80);
    pointer(svg, "pointerup", 460, 200);
    expect(current.choreography!.actors[0].elementIds).toEqual(["finger", "switch"]);
  });

  it("도착점 드래그는 끝날 때 한 번 저장하며 원본 선과 고정점을 바꾸지 않는다", () => {
    const hand = createSceneActor([elements[0]], "손");
    mount({ ...blank, choreography: { version: 1, description: "", actors: [hand], actions: [] } });
    const svg = canvas();
    const handle = host.querySelector("[data-testid='scene-handle-endPoint']")!;
    pointer(handle, "pointerdown", hand.endPoint[0], hand.endPoint[1]);
    pointer(svg, "pointermove", 350, 230);
    expect(commits).not.toHaveBeenCalled();
    pointer(svg, "pointerup", 350, 230);
    expect(commits).toHaveBeenCalledTimes(1);
    expect(current.choreography!.actors[0].endPoint).toEqual([350, 230]);
    expect(current.choreography!.actors[0].fixedPoint).toEqual(hand.fixedPoint);
    expect(current.elements).toBe(elements);
    act(() => handle.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowLeft", shiftKey: true })));
    expect(current.choreography!.actors[0].endPoint).toEqual([340, 230]);
  });
});

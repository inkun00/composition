// @vitest-environment jsdom

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MusicVideoScene } from "../video/musicVideoModel";
import { parseSceneFile, serializeSceneFile } from "./sceneFile";
import { currentScenes, onScenesChange, mount, open, byTestId, byLabel, click, choosePreset,
  setupFeatureHarness, cleanupFeatureHarness } from "./MusicVideoFeature.testHarness";

const exporter = vi.hoisted(() => vi.fn());
vi.mock("../video/exportMusicVideoMp4", () => ({ exportMusicVideoMp4: exporter }));
vi.mock("./SceneMotionPreview", () => ({ default: () => <div data-testid="motion-preview" /> }));

function fixture(): MusicVideoScene {
  return { id: "groups", motion: "still", background: "#fff8ed", endLyric: null, endMeasureIndex: 3,
    elements: Array.from({ length: 5 }, (_, index) => ({ id: `shape-${index + 1}`, tool: "rectangle", color: "#4488ee",
      width: 8, points: [[50 + index * 160, 100, .5], [150 + index * 160, 250, .5]],
      ...(index === 4 ? { motion: "bounce" as const } : {}) })) };
}

function groupedFixture(): MusicVideoScene {
  const scene = fixture();
  return { ...scene, elements: scene.elements.map((element, index) => ({ ...element, motion: "bounce",
    motionGroupId: index < 3 ? "first-group" : "second-group" })) };
}

function rows() {
  return [...document.querySelectorAll<HTMLElement>('[data-testid="scene-assigned-motion-row"]')];
}

function selectedIds() {
  return [...document.querySelectorAll<SVGElement>('[data-testid="scene-selection-outline"] [data-element-id]')]
    .map((element) => element.dataset.elementId);
}

function rowClick(id: string, modifier?: "shiftKey" | "ctrlKey" | "metaKey") {
  act(() => byTestId(`scene-assigned-motion-select-${id}`).dispatchEvent(new MouseEvent("click", {
    bubbles: true, ...(modifier ? { [modifier]: true } : {})
  })));
}

function selectShape(index: number, additive = false) {
  const canvas = document.querySelector<SVGSVGElement>('[data-testid="scene-paint-canvas"]')!;
  Object.defineProperty(canvas, "getBoundingClientRect", {
    configurable: true, value: () => ({ left: 0, top: 0, width: 960, height: 540 })
  });
  const event = new MouseEvent("pointerdown", { bubbles: true, button: 0,
    clientX: 100 + index * 160, clientY: 180, shiftKey: additive });
  Object.assign(event, { pointerId: 1, pointerType: "mouse", pressure: 0 });
  act(() => canvas.dispatchEvent(event));
}

function applyThree() {
  click(byTestId("scene-select-tool"));
  selectShape(0);
  selectShape(1, true);
  selectShape(2, true);
  choosePreset("bounce");
  return currentScenes[0].elements[0].motionGroupId!;
}

beforeEach(() => setupFeatureHarness(exporter));
afterEach(cleanupFeatureHarness);

describe("여러 그림에 함께 적용한 동작 그룹", () => {
  it("세 개를 함께 적용하면 합친 미리보기와 삭제 버튼 하나를 표시하고 그룹 전체를 선택한다", () => {
    mount({ initialScenes: [fixture()] });
    open();
    const groupId = applyThree();
    expect(groupId).toEqual(expect.any(String));
    expect(currentScenes[0].elements.slice(0, 3).every((element) => element.motionGroupId === groupId)).toBe(true);
    expect(rows()).toHaveLength(2);
    const row = rows().find((element) => element.dataset.motionGroupId === groupId)!;
    expect(JSON.parse(row.dataset.elementIds!)).toEqual(["shape-1", "shape-2", "shape-3"]);
    expect(row.textContent).toContain("그룹 1 · 개체 3개");
    expect(row.querySelectorAll("svg path")).toHaveLength(3);
    expect(row.querySelectorAll(".mv-assigned-remove")).toHaveLength(1);
    click(byTestId("scene-clear-selection"));
    rowClick(groupId);
    expect(selectedIds()).toEqual(["shape-1", "shape-2", "shape-3"]);
    expect(byTestId(`scene-assigned-motion-select-${groupId}`).getAttribute("aria-pressed")).toBe("true");
    expect(onScenesChange).toHaveBeenCalledTimes(1);
  });

  it("그룹 삭제 한 번은 멤버 전부만 제거하고 같은 효과의 다른 개체를 보존하며 한 번에 되돌린다", () => {
    const scene = fixture();
    mount({ initialScenes: [scene] });
    open();
    const groupId = applyThree();
    const assigned = currentScenes[0];
    click(byTestId(`scene-remove-element-motion-${groupId}`));
    const removed = currentScenes[0];
    expect(removed.elements.slice(0, 3).every((element) => element.motion === undefined && element.motionGroupId === undefined)).toBe(true);
    expect(removed.elements[4]).toBe(assigned.elements[4]);
    expect(rows()).toHaveLength(1);
    expect(document.activeElement).toBe(byTestId("scene-remove-element-motion-shape-5"));
    expect(onScenesChange).toHaveBeenCalledTimes(2);
    expect(removed.elements.map((element) => element.points)).toEqual(scene.elements.map((element) => element.points));
    expect(parseSceneFile(serializeSceneFile(removed))).toEqual(removed);
    click(byLabel("그림 되돌리기"));
    expect(currentScenes[0]).toEqual(assigned);
    expect(rows()).toHaveLength(2);
    click(byLabel("그림 다시 실행"));
    expect(currentScenes[0]).toEqual(removed);
    expect(rows()).toHaveLength(1);
  });

  it("같은 효과의 별도 그룹을 합치지 않고 Shift·Ctrl·Meta로 그룹 단위 선택을 토글한다", () => {
    const scene = groupedFixture();
    mount({ initialScenes: [scene] });
    open();
    expect(rows()).toHaveLength(2);
    rowClick("first-group");
    rowClick("second-group", "shiftKey");
    expect(selectedIds()).toEqual(scene.elements.map((element) => element.id));
    rowClick("first-group", "ctrlKey");
    expect(selectedIds()).toEqual(["shape-4", "shape-5"]);
    rowClick("second-group", "metaKey");
    expect(selectedIds()).toEqual([]);
    rowClick("first-group");
    rowClick("first-group");
    expect(selectedIds()).toEqual(["shape-1", "shape-2", "shape-3"]);
    expect(currentScenes[0]).toBe(scene);
    expect(onScenesChange).not.toHaveBeenCalled();
    expect(byLabel("그림 되돌리기").disabled).toBe(true);
  });

  it("그룹 일부만 다시 적용하면 새 그룹으로 분리하고 남은 멤버와 별도 그룹을 유지한다", () => {
    const saved = groupedFixture();
    const scene = parseSceneFile(serializeSceneFile(saved));
    mount({ initialScenes: [scene] });
    open();
    rowClick("first-group");
    choosePreset("bounce");
    expect(currentScenes[0]).toBe(scene);
    selectShape(0);
    expect(byTestId("scene-assigned-motion-select-first-group").getAttribute("data-partially-selected")).toBe("true");
    choosePreset("fade");
    const changed = currentScenes[0];
    expect(changed.elements[0].motion).toBe("fade");
    expect(changed.elements[0].motionGroupId).not.toBe("first-group");
    expect(changed.elements.slice(1, 3).map((element) => element.motionGroupId)).toEqual(["first-group", "first-group"]);
    expect(changed.elements.slice(3)).toEqual(scene.elements.slice(3));
    expect(rows()).toHaveLength(3);
    click(byTestId("scene-remove-element-motion-first-group"));
    expect(currentScenes[0].elements[0]).toBe(changed.elements[0]);
    expect(currentScenes[0].elements.slice(1, 3).every((element) => element.motion === undefined)).toBe(true);
    expect(currentScenes[0].elements.slice(3)).toEqual(scene.elements.slice(3));
  });

  it("제작 중에는 그룹 선택·그룹 전체 삭제·선택 삭제를 잠근다", async () => {
    let finish!: (blob: Blob) => void;
    exporter.mockImplementation(() => new Promise<Blob>((resolve) => { finish = resolve; }));
    const scene = groupedFixture();
    mount({ initialScenes: [scene] });
    open();
    rowClick("first-group");
    click(byTestId("create-music-video"));
    await act(async () => byTestId("confirm-music-video").click());
    expect(byTestId("scene-assigned-motion-select-first-group").disabled).toBe(true);
    expect(byTestId("scene-remove-element-motion-first-group").disabled).toBe(true);
    expect(byTestId("scene-remove-selected-motions").disabled).toBe(true);
    click(byTestId("scene-remove-element-motion-first-group"));
    expect(currentScenes[0]).toBe(scene);
    expect(onScenesChange).not.toHaveBeenCalled();
    await act(async () => finish(new Blob(["video"], { type: "video/mp4" })));
    expect(byTestId("scene-remove-element-motion-first-group").disabled).toBe(false);
  });
});

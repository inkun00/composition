// @vitest-environment jsdom

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MusicVideoScene } from "../video/musicVideoModel";
import { serializeSceneFile } from "./sceneFile";
import { currentScenes, onScenesChange, mount, open, canvasClick, byTestId, byLabel, click,
  choosePreset, setupFeatureHarness, cleanupFeatureHarness } from "./MusicVideoFeature.testHarness";

const exporter = vi.hoisted(() => vi.fn());
vi.mock("../video/exportMusicVideoMp4", () => ({ exportMusicVideoMp4: exporter }));
vi.mock("./SceneMotionPreview", () => ({ default: () => <div data-testid="motion-preview" /> }));

function fixture(): MusicVideoScene {
  return { id: "parts", background: "#fff8ed", motion: "still", endLyric: null, endMeasureIndex: 3,
    elements: [
      { id: "line", tool: "line", color: "#ea4335", width: 12, points: [[100, 120, .5], [300, 120, .5]] },
      { id: "rectangle", tool: "rectangle", color: "#4285f4", width: 8, points: [[380, 120, .5], [560, 300, .5]] },
      { id: "ellipse", tool: "ellipse", color: "#34a853", width: 10, points: [[650, 160, .5], [840, 340, .5]] },
      { id: "top", tool: "rectangle", color: "#fbbc04", width: 6, points: [[420, 160, .5], [530, 260, .5]] }
    ] };
}

function selectedIds() {
  return [...document.querySelectorAll<SVGElement>('[data-testid="scene-selection-outline"] [data-element-id]')]
    .map((element) => element.dataset.elementId);
}

function selectionMode() { click(byTestId("scene-select-tool")); }

beforeEach(() => setupFeatureHarness(exporter));
afterEach(cleanupFeatureHarness);

describe("그림 개체 선택과 부분 움직임", () => {
  it.each([
    ["line", 200, 120], ["rectangle", 390, 280], ["ellipse", 740, 250], ["top", 470, 200]
  ] as const)("%s 개체를 한 번 눌러 선이나 닫힌 도형 전체를 고르되 작품과 실행 취소를 변경하지 않는다", (id, x, y) => {
    const scene = fixture();
    mount({ initialScenes: [scene] });
    open();
    selectionMode();
    canvasClick(x, y);
    expect(selectedIds()).toEqual([id]);
    expect(document.querySelector('[data-testid="scene-selection-status"]')?.textContent).toContain("1개");
    expect(currentScenes).toEqual([scene]);
    expect(onScenesChange).not.toHaveBeenCalled();
    expect(byLabel("그림 되돌리기").disabled).toBe(true);
  });

  it("새 개체 클릭은 선택을 교체하고 빈 곳 클릭은 선택만 지운다", () => {
    const scene = fixture();
    mount({ initialScenes: [scene] });
    open();
    selectionMode();
    canvasClick(200, 120);
    canvasClick(740, 250);
    expect(selectedIds()).toEqual(["ellipse"]);
    canvasClick(900, 500);
    expect(selectedIds()).toEqual([]);
    expect(byTestId("scene-motion-scope-selection").getAttribute("aria-pressed")).toBe("true");
    choosePreset("bounce");
    expect(currentScenes).toEqual([scene]);
    expect(onScenesChange).not.toHaveBeenCalled();
  });

  it("손가락으로 닫힌 도형 안을 눌러도 선택만 하고 새 선을 그리지 않는다", () => {
    const scene = fixture();
    mount({ initialScenes: [scene] });
    open();
    selectionMode();
    canvasClick(740, 250, "touch");
    expect(selectedIds()).toEqual(["ellipse"]);
    expect(currentScenes[0].elements).toEqual(scene.elements);
    expect(onScenesChange).not.toHaveBeenCalled();
  });

  it("선택 개체에만 효과를 저장하고 다른 개체의 효과·원본·배경·마디를 보존한다", () => {
    const original = fixture();
    const scene: MusicVideoScene = { ...original, motion: "pulse", elements: original.elements.map((element) =>
      element.id === "ellipse" ? { ...element, motion: "float" } : element), choreography: { version: 1, description: "이전 연출",
        actors: [{ id: "actor", name: "선", elementIds: ["line"], fixedPoint: [100, 120], movingPoint: [300, 120], endPoint: [300, 110] }],
        actions: [{ id: "action", actorId: "actor", kind: "jump", startMeasureIndex: 0, startBeat: 0, durationBeats: 2, strength: 1 }] } };
    mount({ initialScenes: [scene] });
    open();
    selectionMode();
    canvasClick(200, 120);
    choosePreset("move-up");
    expect(currentScenes[0]).toEqual({ ...scene, motion: "still", choreography: undefined,
      elements: scene.elements.map((element) => element.id === "line"
        ? { ...element, motion: "move-up", motionGroupId: expect.any(String) } : element) });
    canvasClick(390, 280);
    choosePreset("draw-on");
    expect(currentScenes[0].elements.map((element) => element.motion)).toEqual(["move-up", "draw-on", "float", undefined]);
    expect(JSON.parse(serializeSceneFile(currentScenes[0])).scene.elements[1].motion).toBe("draw-on");
  });

  it("선택 해제는 저장한 개체 효과를 유지하고 부분 변경만 실행 취소·재실행한다", () => {
    const scene = fixture();
    mount({ initialScenes: [scene] });
    open();
    selectionMode();
    canvasClick(200, 120);
    choosePreset("move-right");
    const chosen = currentScenes[0];
    const changes = onScenesChange.mock.calls.length;
    click(byTestId("scene-clear-selection"));
    expect(selectedIds()).toEqual([]);
    expect(currentScenes[0]).toBe(chosen);
    expect(onScenesChange).toHaveBeenCalledTimes(changes);
    click(byLabel("그림 되돌리기"));
    expect(currentScenes[0]).toEqual(scene);
    click(byLabel("그림 다시 실행"));
    expect(currentScenes[0]).toEqual(chosen);
  });

  it("전체 그림으로 돌아가 효과를 고르면 모든 개체 효과를 지우고 장면 효과 하나로 바꾼다", () => {
    const original = fixture();
    const scene: MusicVideoScene = { ...original, elements: original.elements.map((element, index) =>
      ({ ...element, motion: index % 2 ? "float" : "move-right" })) };
    mount({ initialScenes: [scene] });
    open();
    selectionMode();
    canvasClick(740, 250);
    click(byTestId("scene-motion-scope-whole"));
    expect(currentScenes[0]).toEqual(scene);
    choosePreset("pulse");
    expect(currentScenes[0].motion).toBe("pulse");
    expect(currentScenes[0].elements.every((element) => element.motion === undefined)).toBe(true);
    expect(currentScenes[0].elements.map(({ motion: _motion, ...element }) => element)).toEqual(original.elements);
    click(byLabel("그림 되돌리기"));
    expect(currentScenes[0]).toEqual(scene);
  });

  it("선택한 장면의 개체만 수정하고 다른 장면과 BPM 변경 뒤에도 부분 효과를 보존한다", () => {
    const first = { ...fixture(), endMeasureIndex: 1 };
    const second = { ...fixture(), id: "other", endMeasureIndex: 3 };
    mount({ initialScenes: [first, second], bpm: 90 });
    open();
    selectionMode();
    canvasClick(200, 120);
    choosePreset("bounce-left");
    const chosen = currentScenes;
    expect(chosen[1]).toEqual(second);
    mount({ initialScenes: [first, second], bpm: 180 });
    expect(currentScenes).toBe(chosen);
    click(byLabel("2번 장면 선택"));
    expect(selectedIds()).toEqual([]);
    expect(currentScenes).toBe(chosen);
    click(byLabel("1번 장면 선택"));
    expect(currentScenes[0].elements[0].motion).toBe("bounce-left");
  });

  it.each([true, false])("부분 효과를 애니메이션 %s 영상 제작에 그대로 전달한다", async (animated) => {
    mount({ initialScenes: [fixture()] });
    open();
    selectionMode();
    canvasClick(200, 120);
    choosePreset("move-right");
    click(byTestId("create-music-video"));
    const label = [...document.querySelectorAll(".mv-animation-options label")]
      .find((item) => item.textContent?.includes(animated ? "애니메이션 있음" : "애니메이션 없음"))!;
    act(() => label.querySelector<HTMLInputElement>("input")!.click());
    await act(async () => byTestId("confirm-music-video").click());
    expect(exporter.mock.calls[0][0]).toMatchObject({ animated, scenes: currentScenes });
    expect(exporter.mock.calls[0][0].scenes[0].elements[0].motion).toBe("move-right");
  });
});

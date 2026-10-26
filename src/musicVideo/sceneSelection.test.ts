import { describe, expect, it } from "vitest";
import type { MusicVideoScene, SceneElement } from "../video/musicVideoModel";
import { elementHit } from "../video/sceneDrawing";
import { hitSceneElement, sceneElementContains } from "./sceneSelection";

const rectangle: SceneElement = { id: "rectangle", tool: "rectangle", color: "#ef4444", width: 8,
  points: [[100, 100, .5], [300, 300, .5]] };
const ellipse: SceneElement = { id: "ellipse", tool: "ellipse", color: "#3b82f6", width: 8,
  points: [[150, 150, .5], [250, 250, .5]] };
const brush: SceneElement = { id: "brush", tool: "brush", color: "#22c55e", width: 24,
  points: [[50, 400, .2], [120, 380, 1], [210, 420, .7], [300, 390, .5]] };
const scene: MusicVideoScene = { id: "selection", background: "#ffffff", endLyric: null, motion: "still",
  elements: [rectangle, brush, ellipse] };

describe("그림판 개체 선택 판정", () => {
  it("겹친 도형 안쪽을 누르면 마지막에 그린 개체 하나를 선택한다", () => {
    expect(hitSceneElement(scene, 200, 200)).toBe("ellipse");
    expect(hitSceneElement({ ...scene, elements: [ellipse, rectangle] }, 200, 200)).toBe("rectangle");
  });

  it("네모와 타원의 안쪽을 선택하되 지우개는 원래 윤곽 판정을 유지한다", () => {
    expect(sceneElementContains(rectangle, 200, 200)).toBe(true);
    expect(sceneElementContains(ellipse, 200, 200)).toBe(true);
    expect(elementHit(rectangle, 200, 200, 5)).toBe(false);
    expect(elementHit(ellipse, 200, 200, 5)).toBe(false);
    expect(sceneElementContains(ellipse, 151, 151)).toBe(false);
  });

  it("반대 방향으로 그린 닫힌 도형의 안쪽도 선택한다", () => {
    expect(sceneElementContains({ ...rectangle, points: [...rectangle.points].reverse() }, 200, 200)).toBe(true);
    expect(sceneElementContains({ ...ellipse, points: [...ellipse.points].reverse() }, 200, 200)).toBe(true);
  });

  it("긴 붓 획의 어느 부분을 눌러도 원본 획 전체의 ID를 반환한다", () => {
    const before = structuredClone(scene);
    expect(hitSceneElement(scene, 50, 400)).toBe("brush");
    expect(hitSceneElement(scene, 210, 420)).toBe("brush");
    expect(scene.elements[1]).toBe(brush);
    expect(brush.points).toHaveLength(4);
    expect(scene).toEqual(before);
  });

  it("굵고 겹친 붓 획은 실제 그림과 같은 nonzero 채움 영역에서 선택한다", () => {
    const points: [number, number, number][] = [];
    for (let index = 0; index <= 80; index++) points.push([100 + index * 5, 100, 1]);
    for (let index = 1; index <= 16; index++) points.push([500, 100 + index * 4, 1]);
    for (let index = 1; index <= 80; index++) points.push([500 - index * 5, 164, 1]);
    const folded: SceneElement = { ...brush, width: 48, points };
    expect(elementHit(folded, 160, 130, 5)).toBe(false);
    expect(sceneElementContains(folded, 160, 130)).toBe(true);
  });

  it("선택 가능한 선과 도형이 없는 빈 곳은 null을 반환한다", () => {
    expect(hitSceneElement(scene, 700, 50)).toBeNull();
    expect(hitSceneElement({ ...scene, elements: [] }, 200, 200)).toBeNull();
  });
});

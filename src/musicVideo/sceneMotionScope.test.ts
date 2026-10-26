import { describe, expect, it } from "vitest";
import type { MusicVideoScene, SceneElement } from "../video/musicVideoModel";
import { applyScopedSceneMotion, getScopedSceneMotion } from "./sceneMotionScope";
import { getSceneMotionLabel } from "./sceneMotionPresets";

const line: SceneElement = { id: "a", tool: "brush", color: "#123456", width: 12,
  points: [[50, 100, .3], [150, 180, .7], [230, 120, 1]] };
const scene: MusicVideoScene = { id: "scope", background: "#fff8ed", motion: "bounce", endLyric: null,
  endMeasureIndex: 3, elements: [line, { ...line, id: "b", motion: "rotate-in" }, { ...line, id: "c", motion: "still" }] };

describe("개체별 모션 적용 범위", () => {
  it("선택한 획 전체에만 효과를 넣고 다른 개체의 서로 다른 효과와 원본 점을 보존한다", () => {
    const original = structuredClone(scene);
    const applied = applyScopedSceneMotion(scene, "move-right", "selection", ["a"])!;
    expect(applied.motion).toBe("still");
    expect(applied.choreography).toBeUndefined();
    expect(applied.elements[0]).toEqual({ ...line, motion: "move-right", motionGroupId: expect.any(String) });
    expect(applied.elements[0].points).toBe(line.points);
    expect(applied.elements[1]).toBe(scene.elements[1]);
    expect(applied.elements[2]).toBe(scene.elements[2]);
    expect(applied.background).toBe(scene.background);
    expect(applied.endMeasureIndex).toBe(3);
    expect(scene).toEqual(original);
  });

  it("빈 선택이나 삭제된 ID는 전체 그림 적용으로 바꾸지 않는다", () => {
    expect(applyScopedSceneMotion(scene, "move-left", "selection", [])).toBeNull();
    expect(applyScopedSceneMotion(scene, "move-left", "selection", ["missing"])).toBeNull();
  });

  it("전역 still이 같아도 전체 그림을 고르면 모든 개체의 효과를 제거한다", () => {
    const current = { ...scene, motion: "still" as const };
    const applied = applyScopedSceneMotion(current, "still", "whole", [])!;
    expect(applied).not.toBe(current);
    expect(applied.motion).toBe("still");
    expect(applied.elements.every((element) => !Object.hasOwn(element, "motion"))).toBe(true);
    expect(applied.elements.map((element) => element.points)).toEqual(scene.elements.map((element) => element.points));
    expect(applyScopedSceneMotion(applied, "still", "whole", [])).toBe(applied);
  });

  it("여러 개체를 함께 고를 수 있고 같은 효과 재선택은 불필요한 데이터 변경을 만들지 않는다", () => {
    const applied = applyScopedSceneMotion(scene, "float", "selection", ["a", "b"])!;
    expect(applied.elements.slice(0, 2).every((element) => element.motion === "float")).toBe(true);
    expect(applied.elements[2]).toBe(scene.elements[2]);
    expect(applyScopedSceneMotion(applied, "float", "selection", ["a", "b"])).toBe(applied);
  });

  it("선택 범위의 현재 효과와 혼합 상태를 표시하고 부분효과가 있는 장면을 구별한다", () => {
    expect(getScopedSceneMotion(scene, "selection", ["b"])).toMatchObject({ motion: "rotate-in", label: "회전 등장" });
    expect(getScopedSceneMotion(scene, "selection", ["a"])).toMatchObject({ motion: "bounce", label: "통통 뛰기" });
    expect(getScopedSceneMotion(scene, "selection", ["b", "c"])).toMatchObject({ motion: undefined, label: "서로 다른 움직임" });
    expect(getScopedSceneMotion(scene, "selection", [])).toMatchObject({ empty: true, motion: undefined });
    expect(getScopedSceneMotion(scene, "whole", [])).toMatchObject({ motion: undefined, label: "개체별 움직임" });
    expect(getSceneMotionLabel(scene)).toBe("개체별 움직임");
  });

  it("부분 적용과 전체 적용 모두 이전 대상별 동작을 제거한다", () => {
    const legacy: MusicVideoScene = { ...scene, choreography: { version: 1, description: "이전 동작",
      actors: [], actions: [] } };
    expect(applyScopedSceneMotion(legacy, "fade", "whole", [])!.choreography).toBeUndefined();
    expect(applyScopedSceneMotion(legacy, "fade", "selection", ["a"])!.choreography).toBeUndefined();
  });
});

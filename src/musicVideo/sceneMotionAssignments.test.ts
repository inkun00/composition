import { describe, expect, it } from "vitest";
import type { MusicVideoScene, SceneMotion } from "../video/musicVideoModel";
import type { SceneChoreography } from "../video/sceneActionTypes";
import { parseSceneFile, serializeSceneFile } from "./sceneFile";
import { isAssignedElementMotion, removeAssignedElementMotions } from "./sceneMotionAssignments";
import { SCENE_MOTION_PRESETS } from "./sceneMotionPresets";

function fixture(motion: SceneMotion = "still"): MusicVideoScene {
  return {
    id: "assigned",
    background: "#fff8ed",
    motion,
    endLyric: { measureIndex: 3, noteId: "last-note" },
    endMeasureIndex: 3,
    elements: [
      { id: "first", tool: "brush", color: "#123456", width: 12, motion: "bounce",
        points: [[70, 90, .2], [160, 150, .9], [250, 110, 1]] },
      { id: "second", tool: "ellipse", color: "#654321", width: 8, motion: "rotate-in",
        points: [[400, 150, .4], [600, 350, .6]] },
      { id: "inherited", tool: "line", color: "#4285f4", width: 10,
        points: [[100, 400, .5], [300, 420, .8]] },
      { id: "stopped", tool: "rectangle", color: "#34a853", width: 6, motion: "still",
        points: [[650, 100, .3], [800, 300, .7]] },
      { id: "automatic", tool: "line", color: "#ea4335", width: 4, motion: "auto",
        points: [[650, 400, .4], [800, 450, .8]] }
    ]
  };
}

function legacyActions(): SceneChoreography {
  return {
    version: 1,
    description: "이전 개체 연출",
    actors: [{ id: "actor", name: "첫 선", elementIds: ["first"], fixedPoint: [70, 90],
      movingPoint: [250, 110], endPoint: [250, 100] }],
    actions: [{ id: "jump", actorId: "actor", kind: "jump", startMeasureIndex: 0,
      startBeat: 0, durationBeats: 2, strength: 1 }]
  };
}

describe("개체에 할당한 모션 삭제", () => {
  it("명시적으로 움직이는 29종과 이전 sway만 할당 목록에 포함한다", () => {
    const presets = SCENE_MOTION_PRESETS.filter((preset) => preset.id !== "still");
    expect(presets).toHaveLength(29);
    expect(presets.every((preset) => isAssignedElementMotion(preset.id))).toBe(true);
    expect(isAssignedElementMotion("sway")).toBe(true);
    expect([undefined, "still", "auto"].map((motion) => isAssignedElementMotion(motion as SceneMotion | undefined)))
      .toEqual([false, false, false]);
  });

  it.each(["still", "auto"] as const)("기본 %s 장면에서는 지정한 효과만 제거하고 원본과 다른 개체를 보존한다", (motion) => {
    const scene = fixture(motion);
    const original = structuredClone(scene);
    const removed = removeAssignedElementMotions(scene, ["first"]);
    const { motion: _motion, ...artwork } = scene.elements[0];
    expect(removed).toEqual({ ...scene, elements: [artwork, ...scene.elements.slice(1)] });
    expect(Object.hasOwn(removed.elements[0], "motion")).toBe(false);
    expect(removed.elements[0].points).toBe(scene.elements[0].points);
    expect(removed.elements.slice(1).every((element, index) => element === scene.elements[index + 1])).toBe(true);
    expect(scene).toEqual(original);
  });

  it.each(["float", "sway"] as const)("장면 기본 효과 %s가 다시 살아나지 않도록 정지 override를 남긴다", (motion) => {
    const scene = fixture(motion);
    const removed = removeAssignedElementMotions(scene, ["first"]);
    expect(removed.motion).toBe(motion);
    expect(removed.elements[0]).toEqual({ ...scene.elements[0], motion: "still" });
    expect(removed.elements[0].points).toBe(scene.elements[0].points);
    expect(removed.elements[1]).toBe(scene.elements[1]);
    expect(removeAssignedElementMotions(removed, ["first"])).toBe(removed);
  });

  it.each(["still", "auto"] as const)("기본 %s여도 이전 연출이 있으면 정지 override를 남기고 연출 정보를 보존한다", (motion) => {
    const choreography = legacyActions();
    const scene = { ...fixture(motion), choreography };
    const removed = removeAssignedElementMotions(scene, ["first"]);
    expect(removed.elements[0].motion).toBe("still");
    expect(removed.choreography).toBe(choreography);
    expect(scene.elements[0].motion).toBe("bounce");
  });

  it("실행할 이전 동작이 없는 연출 데이터는 보존하되 불필요한 정지 속성을 만들지 않는다", () => {
    const choreography = { ...legacyActions(), actions: [] };
    const scene = { ...fixture(), choreography };
    const removed = removeAssignedElementMotions(scene, ["first"]);
    expect(Object.hasOwn(removed.elements[0], "motion")).toBe(false);
    expect(removed.choreography).toBe(choreography);
  });

  it("빈 선택·없는 ID·효과 없는 개체를 지워도 같은 장면 객체를 반환한다", () => {
    const scene = fixture("pulse");
    for (const ids of [[], ["missing"], ["inherited", "stopped", "automatic"]]) {
      expect(removeAssignedElementMotions(scene, ids)).toBe(scene);
    }
  });

  it("중복 ID를 포함한 여러 효과를 한 번에 지우고 미선택 효과와 모든 그림 정보를 유지한다", () => {
    const scene = fixture();
    const removed = removeAssignedElementMotions(scene, ["first", "first", "second", "missing", "stopped"]);
    expect(removed.elements.map((element) => element.motion)).toEqual([undefined, undefined, undefined, "still", "auto"]);
    expect(removed.elements.map(({ motion: _motion, ...artwork }) => artwork))
      .toEqual(scene.elements.map(({ motion: _motion, ...artwork }) => artwork));
    expect(removed.elements.every((element, index) => element.points === scene.elements[index].points)).toBe(true);
    expect(removed.elements.slice(2).every((element, index) => element === scene.elements[index + 2])).toBe(true);
    expect(removeAssignedElementMotions(removed, ["first", "second"])).toBe(removed);
  });

  it("삭제 후 JSON 저장·불러오기로 정지 override와 나머지 효과·이전 연출을 그대로 복원한다", () => {
    const scene = { ...fixture("zoom"), choreography: legacyActions() };
    const removed = removeAssignedElementMotions(scene, ["first"]);
    const restored = parseSceneFile(serializeSceneFile(removed));
    expect(restored).toEqual(removed);
    expect(restored.elements[0].motion).toBe("still");
    expect(restored.elements[1].motion).toBe("rotate-in");
  });
});

import { describe, expect, it } from "vitest";
import {
  isMusicVideoScenes, MAX_ELEMENTS, MAX_TOTAL_POINTS, SCENE_HEIGHT, SCENE_WIDTH,
  type MusicVideoScene, type SceneElement
} from "../video/musicVideoModel";
import { copySceneElements, pasteSceneElements, type ScenePasteResult } from "./sceneClipboard";

function element(id: string, extra: Partial<SceneElement> = {}): SceneElement {
  return { id, tool: "brush", color: "#123456", width: 8,
    points: [[100, 120, .2], [180, 200, .8]], ...extra };
}

function scene(elements = [element("a"), element("b")]): MusicVideoScene {
  return { id: "source", background: "#fff8ed", motion: "float", endLyric: null,
    endMeasureIndex: 3, elements };
}

function success(result: ScenePasteResult) {
  if (!result.ok) throw new Error(result.status);
  return result;
}

describe("장면 개체 복사와 붙여넣기", () => {
  it("유효하게 선택한 개체만 원래 그린 순서로 복사하고 선택 목록 중복과 오래된 ID를 무시한다", () => {
    const source = scene([element("a"), element("b"), element("c")]);
    const copied = copySceneElements(source, ["c", "missing", "a", "a"])!;
    expect(copied.elements.map((item) => item.id)).toEqual(["a", "c"]);
    expect(copied.elements[0]).toEqual(source.elements[0]);
    expect(copied.elements[0]).not.toBe(source.elements[0]);
    expect(copied.elements[0].points[0]).not.toBe(source.elements[0].points[0]);
    expect(copySceneElements(source, ["missing"])).toBeNull();
    expect(copySceneElements(source, [])).toBeNull();
  });

  it("원본을 나중에 바꾸거나 지워도 복사 시점의 그림과 압력을 보존한다", () => {
    const points: [number, number, number][] = [[100, 120, .2], [180, 200, .8]];
    const source = scene([element("a", { points })]);
    const copied = copySceneElements(source, ["a"])!;
    points[0][0] = 900;
    points.pop();
    const result = success(pasteSceneElements(scene([]), copied, MAX_TOTAL_POINTS));
    expect(result.scene.elements[0].points).toEqual([[116, 136, .2], [196, 216, .8]]);
    expect(copied.elements[0].points).toEqual([[100, 120, .2], [180, 200, .8]]);
    expect(result.scene.elements[0].points[0]).not.toBe(copied.elements[0].points[0]);
  });

  it("다른 장면의 배경·구간·전체 동작·기존 연출과 개체는 그대로 두고 위에 추가한다", () => {
    const choreography = { version: 1 as const, description: "이전 연출",
      actors: [{ id: "actor", name: "그림", elementIds: ["existing"], fixedPoint: [100, 120] as const,
        movingPoint: [180, 200] as const, endPoint: [250, 250] as const }],
      actions: [{ id: "action", actorId: "actor", kind: "jump" as const, startMeasureIndex: 0,
        startBeat: 0, durationBeats: 1, strength: 1 }] };
    const target = { ...scene([element("existing")]), id: "other", background: "#112233",
      motion: "snow" as const, endMeasureIndex: 7, choreography };
    const result = success(pasteSceneElements(target, copySceneElements(scene(), ["b"]), MAX_TOTAL_POINTS));
    expect(result.scene).toMatchObject({ id: "other", background: "#112233", motion: "snow", endMeasureIndex: 7 });
    expect(result.scene.choreography).toBe(choreography);
    expect(result.scene.elements[0]).toBe(target.elements[0]);
    expect(target.elements).toHaveLength(1);
    expect(result.scene.elements).toHaveLength(2);
    expect(result.selectedIds).toEqual([result.scene.elements[1].id]);
    expect(isMusicVideoScenes([result.scene])).toBe(true);
  });

  it("선·도형의 색·굵기·개체 동작을 보존하고 매번 새 개체 ID와 새 그룹 ID를 만든다", () => {
    const source = scene([
      element("a", { tool: "line", motion: "pulse", motionGroupId: "together" }),
      element("b", { tool: "rectangle", color: "#ef4444", width: 16, motion: "pulse", motionGroupId: "together" }),
      element("c", { tool: "ellipse", motion: "float", motionGroupId: "separate" }),
      element("d", { motion: "still" })
    ]);
    const copied = copySceneElements(source, ["a", "b", "c", "d"]);
    const first = success(pasteSceneElements(source, copied, MAX_TOTAL_POINTS));
    const second = success(pasteSceneElements(first.scene, copied, MAX_TOTAL_POINTS, 1));
    const additions = first.scene.elements.slice(4);
    expect(additions.map(({ tool, color, width, motion }) => ({ tool, color, width, motion })))
      .toEqual(source.elements.map(({ tool, color, width, motion }) => ({ tool, color, width, motion })));
    expect(additions[0].motionGroupId).toBe(additions[1].motionGroupId);
    expect(additions[0].motionGroupId).not.toBe("together");
    expect(additions[2].motionGroupId).not.toBe(additions[0].motionGroupId);
    expect(additions[3].motionGroupId).toBeUndefined();
    expect(new Set(second.scene.elements.map((item) => item.id)).size).toBe(12);
    expect(second.scene.elements[8].motionGroupId).not.toBe(additions[0].motionGroupId);
    expect(second.scene.elements[8].motionGroupId).toBe(second.scene.elements[9].motionGroupId);
    expect(isMusicVideoScenes([second.scene])).toBe(true);
  });

  it("기존 legacy 동작 개체를 복사할 때 대상의 같은 효과 그룹과 합치지 않는다", () => {
    const source = scene([element("a", { motion: "pulse" }), element("b", { motion: "pulse" })]);
    const result = success(pasteSceneElements(source, copySceneElements(source, ["a", "b"]), MAX_TOTAL_POINTS));
    expect(result.scene.elements[0].motionGroupId).toBeUndefined();
    expect(result.scene.elements[2].motionGroupId).toEqual(expect.any(String));
    expect(result.scene.elements[2].motionGroupId).toBe(result.scene.elements[3].motionGroupId);
  });

  it("여러 번 붙여넣을 때 작은 위치 차이를 주며 선택 개체 사이의 상대 위치를 보존한다", () => {
    const source = scene([element("a"), element("b", { points: [[300, 50, .5], [350, 100, .7]] })]);
    const copied = copySceneElements(source, ["a", "b"]);
    const first = success(pasteSceneElements(scene([]), copied, MAX_TOTAL_POINTS));
    const second = success(pasteSceneElements(scene([]), copied, MAX_TOTAL_POINTS, 1));
    expect(first.scene.elements[0].points[0]).toEqual([116, 136, .2]);
    expect(second.scene.elements[0].points[0]).toEqual([132, 152, .2]);
    expect(first.scene.elements[1].points[0][0] - first.scene.elements[0].points[0][0]).toBe(200);
    expect(first.scene.elements[1].points[0][1] - first.scene.elements[0].points[0][1]).toBe(-70);
  });

  it("오른쪽·아래 경계에서는 전체 묶음을 반대쪽으로 옮겨 점을 캔버스 안에 유지한다", () => {
    const source = scene([element("edge", { points: [[930, 520, .1], [960, 540, 1]] }),
      element("near", { points: [[880, 460, .5], [920, 500, .8]] })]);
    const result = success(pasteSceneElements(scene([]), copySceneElements(source, ["edge", "near"]), MAX_TOTAL_POINTS));
    expect(result.scene.elements[0].points).toEqual([[914, 504, .1], [944, 524, 1]]);
    expect(result.scene.elements[1].points[0]).toEqual([864, 444, .5]);
    expect(result.scene.elements.flatMap((item) => item.points).every(([x, y]) =>
      x >= 0 && x <= SCENE_WIDTH && y >= 0 && y <= SCENE_HEIGHT)).toBe(true);
  });

  it("화면 전체를 쓰는 도형은 크기를 바꾸거나 점을 잘라내지 않는다", () => {
    const source = scene([element("full", { tool: "rectangle", points: [[0, 0, .5], [960, 540, .5]] })]);
    const result = success(pasteSceneElements(scene([]), copySceneElements(source, ["full"]), MAX_TOTAL_POINTS));
    expect(result.scene.elements[0].points).toEqual(source.elements[0].points);
    expect(result.scene.elements[0].id).not.toBe("full");
  });

  it("개체나 전체 점 용량을 넘으면 일부만 붙이지 않고 대상과 클립보드를 그대로 유지한다", () => {
    const copied = copySceneElements(scene(), ["a", "b"])!;
    const target = scene(Array.from({ length: MAX_ELEMENTS - 1 }, (_, index) => element(`target-${index}`)));
    const original = structuredClone(target);
    const clipboardBefore = structuredClone(copied);
    expect(pasteSceneElements(target, copied, MAX_TOTAL_POINTS)).toMatchObject({ ok: false });
    expect(pasteSceneElements(scene([]), copied, 3)).toMatchObject({ ok: false });
    expect(pasteSceneElements(scene([]), copied, 4)).toMatchObject({ ok: true });
    expect(target).toEqual(original);
    expect(copied).toEqual(clipboardBefore);
  });

  it("빈 클립보드와 유효하지 않은 잔여 용량은 변경 없이 거절한다", () => {
    const source = scene();
    expect(pasteSceneElements(source, null, MAX_TOTAL_POINTS)).toMatchObject({ ok: false });
    expect(pasteSceneElements(source, { elements: [] }, MAX_TOTAL_POINTS)).toMatchObject({ ok: false });
    expect(pasteSceneElements(source, copySceneElements(source, ["a"]), Number.NaN)).toMatchObject({ ok: false });
    expect(pasteSceneElements(source, copySceneElements(source, ["a"]), -1)).toMatchObject({ ok: false });
  });
});

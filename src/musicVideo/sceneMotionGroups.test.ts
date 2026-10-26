import { describe, expect, it } from "vitest";
import { decodeCloudDraft, encodeCloudDraft } from "../firebase/cloudDraft";
import { readDraft, writeDraft, type SavedDraft } from "../music/draft";
import { isMusicVideoScenes, type MusicVideoScene, type SceneElement, type SceneMotion } from "../video/musicVideoModel";
import { parseSceneFile, serializeSceneFile } from "./sceneFile";
import { removeAssignedElementMotions } from "./sceneMotionAssignments";
import { getAssignedMotionGroups } from "./sceneMotionGroups";
import { applyScopedSceneMotion } from "./sceneMotionScope";

function element(id: string, motion?: SceneMotion, motionGroupId?: string): SceneElement {
  return { id, tool: "brush", width: 8, color: "#123456", points: [[20, 30, .5], [80, 90, .8]],
    ...(motion === undefined ? {} : { motion }), ...(motionGroupId === undefined ? {} : { motionGroupId }) };
}

function scene(elements = [element("a"), element("b"), element("c"), element("d")]): MusicVideoScene {
  return { id: "grouped", background: "#fff8ed", endLyric: null, endMeasureIndex: 7, motion: "still", elements };
}

function apply(current: MusicVideoScene, ids: readonly string[], motion: SceneMotion = "pulse") {
  return applyScopedSceneMotion(current, motion, "selection", ids)!;
}

function draft(current: MusicVideoScene): SavedDraft {
  return {
    version: 1, updatedAt: 123, sourceHash: "", title: "함께 움직이기", creator: "새봄", originalCreator: "새봄", presetId: "H001",
    meter: { beats: 4, beatUnit: 4 }, songLength: 8, instrumentId: "piano", lyrics: Array(8).fill("별"),
    showArrangement: true, measures: Array.from({ length: 8 }, (_, index) => ({ candidateId: "custom",
      candidateName: "가락", notes: [{ id: `note-${index}`, pitch: 60,
        duration: { numerator: 4, denominator: 1 }, lyric: "별" }] })), musicVideoScenes: [current]
  };
}

describe("실제로 함께 적용한 개체 모션 그룹", () => {
  it("다중 선택은 한 새 그룹으로 기록하고 그림과 미선택 개체를 변경하지 않는다", () => {
    const original = scene();
    const updated = apply(original, ["a", "b"]);
    const groupId = updated.elements[0].motionGroupId;
    expect(groupId).toEqual(expect.any(String));
    expect(updated.elements[1].motionGroupId).toBe(groupId);
    expect(updated.elements.slice(2)).toEqual(original.elements.slice(2));
    expect(updated.elements[2]).toBe(original.elements[2]);
    expect(updated.elements.every((item, index) => item.points === original.elements[index].points)).toBe(true);
    expect(original.elements.every((item) => item.motionGroupId === undefined && item.motion === undefined)).toBe(true);
    expect(getAssignedMotionGroups(updated)).toMatchObject([{ id: groupId, motion: "pulse", name: "그룹 1 · 개체 2개" }]);
  });

  it("단일 선택에도 적용 ID를 기록하고 같은 효과를 따로 적용한 단위는 합치지 않는다", () => {
    const first = apply(scene(), ["a"]);
    const second = apply(first, ["b"]);
    expect(first.elements[0].motionGroupId).toEqual(expect.any(String));
    expect(second.elements[1].motionGroupId).not.toBe(first.elements[0].motionGroupId);
    expect(getAssignedMotionGroups(second).map((group) => group.name)).toEqual(["붓 1", "붓 2"]);
    expect(getAssignedMotionGroups(second)).toHaveLength(2);
  });

  it("정확히 같은 전체 그룹과 효과 재적용은 ID와 장면 객체를 유지한다", () => {
    const updated = apply(scene(), ["a", "b"]);
    expect(apply(updated, ["b", "a", "a", "missing"])).toBe(updated);
    const singleton = apply(scene(), ["c"]);
    expect(apply(singleton, ["c"])).toBe(singleton);
  });

  it("같은 효과여도 그룹 일부에 재적용하면 선택한 개체만 새 그룹으로 분리한다", () => {
    const grouped = apply(scene(), ["a", "b", "c"]);
    const split = apply(grouped, ["b"]);
    expect(split.elements[1].motionGroupId).not.toBe(grouped.elements[1].motionGroupId);
    expect(split.elements[0]).toBe(grouped.elements[0]);
    expect(split.elements[2]).toBe(grouped.elements[2]);
    expect(getAssignedMotionGroups(split).map((group) => group.elements.map((item) => item.id)))
      .toEqual([["a", "c"], ["b"]]);
  });

  it("서로 다른 그룹의 일부를 함께 재적용해도 남은 멤버의 그룹을 보존한다", () => {
    const grouped = apply(apply(scene(), ["a", "b"]), ["c", "d"]);
    const combined = apply(grouped, ["b", "c"], "float");
    expect(combined.elements[1].motionGroupId).toBe(combined.elements[2].motionGroupId);
    expect(combined.elements[1].motionGroupId).not.toBe(grouped.elements[0].motionGroupId);
    expect(combined.elements[1].motionGroupId).not.toBe(grouped.elements[3].motionGroupId);
    expect(combined.elements[0]).toBe(grouped.elements[0]);
    expect(combined.elements[3]).toBe(grouped.elements[3]);
    expect(isMusicVideoScenes([combined])).toBe(true);
  });

  it("그룹 전체에 다른 효과를 적용하면 새 적용 단위로 기록한다", () => {
    const grouped = apply(scene(), ["a", "b"]);
    const changed = apply(grouped, ["a", "b"], "float");
    expect(changed.elements[0].motionGroupId).not.toBe(grouped.elements[0].motionGroupId);
    expect(changed.elements[0].motionGroupId).toBe(changed.elements[1].motionGroupId);
  });

  it.each(["still", "auto"] as const)("선택한 개체를 %s로 바꾸면 그룹 메타데이터를 제거한다", (motion) => {
    const grouped = apply(scene(), ["a", "b"]);
    const stopped = apply(grouped, ["a"], motion);
    expect(Object.hasOwn(stopped.elements[0], "motionGroupId")).toBe(false);
    expect(stopped.elements[0].motion).toBe(motion);
    expect(stopped.elements[1]).toBe(grouped.elements[1]);
    expect(isMusicVideoScenes([stopped])).toBe(true);
  });

  it("전체 그림 효과는 개체 효과와 그룹 메타데이터를 모두 제거한다", () => {
    const grouped = apply(scene(), ["a", "b"]);
    const whole = applyScopedSceneMotion(grouped, "float", "whole", [])!;
    expect(whole.motion).toBe("float");
    expect(whole.elements.every((item) => !Object.hasOwn(item, "motion") && !Object.hasOwn(item, "motionGroupId"))).toBe(true);
    expect(getAssignedMotionGroups(whole)).toEqual([]);
    expect(applyScopedSceneMotion(whole, "float", "whole", [])).toBe(whole);
  });

  it.each(["still", "zoom"] as const)("그룹 삭제는 %s 기본 효과가 되살아나지 않게 하고 별도 적용 그룹을 보존한다", (motion) => {
    const grouped = { ...apply(apply(scene(), ["a", "b"]), ["c", "d"]), motion };
    const [first, second] = getAssignedMotionGroups(grouped);
    const removed = removeAssignedElementMotions(grouped, first.elements.map((item) => item.id));
    expect(removed.elements.slice(0, 2).every((item) => !Object.hasOwn(item, "motionGroupId"))).toBe(true);
    expect(removed.elements[0].motion).toBe(motion === "still" ? undefined : "still");
    expect(getAssignedMotionGroups(removed)).toMatchObject([{ id: second.id, elements: second.elements, motion: second.motion }]);
    expect(removed.elements[2]).toBe(grouped.elements[2]);
    expect(removed.elements[0].points).toBe(grouped.elements[0].points);
  });

  it("이전 대상별 연출이 있는 그룹을 삭제해도 정지 override로 남기고 연출은 보존한다", () => {
    const choreography = { version: 1 as const, description: "이전 연출",
      actors: [{ id: "actor", name: "그림", elementIds: ["a", "b"], fixedPoint: [20, 30] as const,
        movingPoint: [80, 90] as const, endPoint: [100, 100] as const }],
      actions: [{ id: "action", actorId: "actor", kind: "jump" as const, startMeasureIndex: 0,
        startBeat: 0, durationBeats: 1, strength: 1 }] };
    const grouped = { ...apply(scene(), ["a", "b"]), choreography };
    const removed = removeAssignedElementMotions(grouped, ["a", "b"]);
    expect(removed.choreography).toBe(choreography);
    expect(removed.elements.slice(0, 2).every((item) => item.motion === "still" && !Object.hasOwn(item, "motionGroupId"))).toBe(true);
    expect(removed.elements[2]).toBe(grouped.elements[2]);
    expect(isMusicVideoScenes([removed])).toBe(true);
  });
});

describe("저장된 모션 그룹과 이전 개체 효과의 목록", () => {
  it("그룹과 멤버를 첫 등장 순서로 유지하고 이전 같은 효과는 한 그룹으로 묶는다", () => {
    const current = scene([element("a", "float"), element("b", "pulse", "authored"), element("c", "float"),
      element("d", "pulse", "authored"), element("e", "rotate-in"), element("stopped", "still"), element("base")]);
    const groups = getAssignedMotionGroups(current);
    expect(groups.map(({ id, name }) => [id, name])).toEqual([
      ["legacy:float", "그룹 1 · 개체 2개"], ["authored", "그룹 2 · 개체 2개"], ["e", "붓 5"]
    ]);
    expect(groups.map((group) => group.elements.map((item) => item.id))).toEqual([["a", "c"], ["b", "d"], ["e"]]);
    expect(groups[0].elements[0]).toBe(current.elements[0]);
  });

  it("같은 효과의 별도 explicit 그룹과 기존 unmarked 그룹을 섞지 않는다", () => {
    const current = scene([element("a", "pulse", "first"), element("b", "pulse"), element("c", "pulse", "second"),
      element("d", "pulse"), element("e", "pulse", "first")]);
    expect(getAssignedMotionGroups(current).map((group) => group.elements.map((item) => item.id)))
      .toEqual([["a", "e"], ["b", "d"], ["c"]]);
  });

  it("명시한 그룹 ID와 legacy ID나 singleton 개체 ID가 겹쳐도 행 ID가 중복되지 않는다", () => {
    const current = scene([element("a", "float"), element("reserved", "pulse"),
      element("b", "float"), element("c", "bounce", "legacy:float"),
      element("d", "slide", "legacy:float:1"), element("e", "fade", "reserved")]);
    const groups = getAssignedMotionGroups(current);
    expect(groups.map((group) => group.id)).toEqual(["legacy:float:2", "reserved:1", "legacy:float", "legacy:float:1", "reserved"]);
    expect(new Set(groups.map((group) => group.id)).size).toBe(groups.length);
    expect(getAssignedMotionGroups(current)).toEqual(groups);
  });

  it("잘못된 혼합 그룹도 읽기 helper에서는 구분하고 schema에서는 저장을 거절한다", () => {
    const invalid = scene([element("a", "float", "mixed"), element("b", "pulse", "mixed")]);
    expect(getAssignedMotionGroups(invalid).map((group) => [group.id, group.motion]))
      .toEqual([["mixed", "float"], ["mixed:1", "pulse"]]);
    expect(isMusicVideoScenes([invalid])).toBe(false);
  });
});

describe("모션 그룹 저장 검증과 roundtrip", () => {
  it.each(["x", "그룹 이름", "x".repeat(120)])("그룹 ID 허용 범위 %s를 복원한다", (id) => {
    expect(isMusicVideoScenes([scene([element("a", "sway", id), element("b", "sway", id)])])).toBe(true);
  });

  it.each(["", " ", "x".repeat(121), null, 123, {}])("유효하지 않은 그룹 ID %j를 거절한다", (id) => {
    expect(isMusicVideoScenes([scene([{ ...element("a", "float"), motionGroupId: id as string }])])).toBe(false);
  });

  it.each([undefined, "still", "auto"] as const)("움직임 %s에는 저장된 그룹 ID를 허용하지 않는다", (motion) => {
    expect(isMusicVideoScenes([scene([element("a", motion, "unused")])])).toBe(false);
  });

  it("JSON 파일·브라우저 draft·클라우드 문자열에 적용 단위와 그림을 그대로 보존한다", () => {
    const grouped = apply(apply(scene(), ["a", "b"]), ["c", "d"]);
    expect(parseSceneFile(serializeSceneFile(grouped))).toEqual(grouped);
    let saved = "";
    const storage = { getItem: () => saved, setItem: (_key: string, value: string) => { saved = value; } };
    expect(writeDraft(storage, draft(grouped))).toBe(true);
    const restored = readDraft(storage)!;
    expect(restored.musicVideoScenes).toEqual([grouped]);
    const encoded = encodeCloudDraft(restored);
    expect(encoded.musicVideoScenesJson).toContain("motionGroupId");
    const decoded = decodeCloudDraft(JSON.parse(JSON.stringify(encoded)))!;
    expect(decoded.musicVideoScenes).toEqual([grouped]);
    expect(getAssignedMotionGroups(decoded.musicVideoScenes![0])).toEqual(getAssignedMotionGroups(grouped));
  });

  it("손상된 그룹 정보는 파일·draft·클라우드에서 조용히 지우지 않고 거절한다", () => {
    const invalid = scene([element("a", "pulse", "mixed"), element("b", "fade", "mixed")]);
    const json = JSON.stringify({ format: "maeum-melody-scene", version: 1, scene: invalid });
    expect(() => parseSceneFile(json)).toThrow();
    expect(readDraft({ getItem: () => JSON.stringify(draft(invalid)) })).toBeNull();
    const { musicVideoScenes: _scenes, ...rest } = draft(invalid);
    expect(decodeCloudDraft({ ...rest, musicVideoScenesJson: JSON.stringify([invalid]) })).toBeNull();
  });
});

import { describe, expect, it, vi } from "vitest";
import { isMusicVideoScenes, resolveSceneEndMeasure, type MusicVideoMeasureCue,
  type MusicVideoScene } from "../video/musicVideoModel";
import type { SceneChoreography } from "../video/sceneActionTypes";
import { appendSceneSlide, deleteSceneSlide, getSceneSlideDeletionIssue, getSceneSlideInsertionIssue,
  insertSceneSlide } from "./sceneSequenceEditing";
import { getSceneMeasureRanges, getSceneRangeIssue } from "../video/musicVideoSceneRanges";
import { validateSceneActionRanges } from "../video/sceneActionPlan";

function cues(count: number, indices = Array.from({ length: count }, (_, index) => index)): MusicVideoMeasureCue[] {
  return indices.map((measureIndex, index) => ({ measureIndex, key: String(measureIndex), label: `${measureIndex + 1}마디`,
    lyricText: "노래", startSeconds: index * 2, endSeconds: (index + 1) * 2 }));
}

function scene(id: string, endMeasureIndex: number): MusicVideoScene {
  return { id, background: "#fff8ed", motion: "pulse", endLyric: null, endMeasureIndex,
    elements: [{ id: `${id}-line`, tool: "line", color: "#123456", width: 8,
      points: [[10, 20, .5], [40, 80, .7]], motion: "move-right", motionGroupId: `${id}-group` }] };
}

function intro(): MusicVideoScene {
  const { endMeasureIndex: _end, ...drawing } = scene("intro", 0);
  return { ...drawing, section: "intro" };
}

describe("명시한 시작 마디와 슬라이드 편집", () => {
  it("삽입하면 명시한 시작 마디도 새 경계와 함께 바뀐다", () => {
    const source = [{ ...scene("a", 1), startMeasureIndex: 0 }, { ...scene("b", 3), startMeasureIndex: 2 }];
    const result = insertSceneSlide(source, cues(4), 1, "before");
    expect(result.issue).toBeUndefined();
    expect(getSceneRangeIssue(result.scenes, cues(4))).toBeNull();
    expect(getSceneMeasureRanges(result.scenes, cues(4)).map((range) => [range.startIndex, range.endIndex]))
      .toEqual([[0, 1], [2, 2], [3, 3]]);
    expect(result.scenes[2].elements).toBe(source[1].elements);
  });

  it("명시한 구간에 겹침이 있어도 기존 구간을 보존하며 한 마디 장면을 삽입한다", () => {
    const source = [{ ...scene("a", 2), startMeasureIndex: 0 }, { ...scene("b", 3), startMeasureIndex: 2 }];
    const result = insertSceneSlide(source, cues(4), 1, "before");
    expect(result.issue).toBeUndefined();
    expect(result.selected).toBe(1);
    expect(result.scenes[0]).toBe(source[0]);
    expect(result.scenes[2]).toBe(source[1]);
    expect(result.scenes[1]).toMatchObject({ startMeasureIndex: 2, endMeasureIndex: 2, elements: [] });
    expect(getSceneRangeIssue(result.scenes, cues(4))).toMatch(/겹/);
    expect(result.status).toContain("경고");
  });

  it.each(["before", "after"] as const)("중간에 빈 마디가 있어도 %s 삽입은 기존 그림과 구간을 유지한다", (placement) => {
    const source = [withAction(scene("a", 0), 0), { ...scene("b", 3), startMeasureIndex: 2 }];
    const result = insertSceneSlide(source, cues(4), 1, placement, 120);
    const inserted = placement === "before" ? 1 : 2;
    const anchor = placement === "before" ? 2 : 3;
    expect(result.issue).toBeUndefined();
    expect(result.selected).toBe(inserted);
    expect(result.scenes[inserted]).toMatchObject({ startMeasureIndex: anchor, endMeasureIndex: anchor, elements: [] });
    expect(result.scenes.filter((_, index) => index !== inserted).map((item) => [item.startMeasureIndex, item.endMeasureIndex]))
      .toEqual([[0, 0], [2, 3]]);
    expect(result.scenes[0].elements).toBe(source[0].elements);
    expect(result.scenes[0].choreography).toBe(source[0].choreography);
    expect(result.scenes[placement === "before" ? 2 : 1]).toBe(source[1]);
  });

  it("삭제한 빈 구간은 이웃 시작 마디를 확장하고 다른 겹침은 임의로 바꾸지 않는다", () => {
    const source = [0, 1, 2, 3].map((end, index) => ({ ...scene(String(index), end), startMeasureIndex: index }));
    const result = deleteSceneSlide(source, cues(4), 1);
    expect(result.scenes.map((item) => [item.startMeasureIndex, item.endMeasureIndex])).toEqual([[0, 0], [1, 2], [3, 3]]);
    expect(getSceneRangeIssue(result.scenes, cues(4))).toBeNull();
    const overlap = [{ ...scene("a", 2), startMeasureIndex: 0 },
      { ...scene("b", 2), startMeasureIndex: 1 }, { ...scene("c", 3), startMeasureIndex: 2 }];
    const remaining = deleteSceneSlide(overlap, cues(4), 1);
    expect(remaining.scenes[1].startMeasureIndex).toBe(2);
    expect(getSceneRangeIssue(remaining.scenes, cues(4))).toMatch(/겹/);
  });
});

function partition(scenes: readonly MusicVideoScene[], measures: readonly MusicVideoMeasureCue[]): number[] {
  let previous = -1;
  const lengths = scenes.filter((item) => item.section !== "intro").map((item) => {
    const end = measures.indexOf(resolveSceneEndMeasure(item, measures)!);
    const length = end - previous;
    expect(length).toBeGreaterThan(0);
    previous = end;
    return length;
  });
  expect(previous).toBe(measures.length - 1);
  expect(isMusicVideoScenes(scenes)).toBe(true);
  return lengths;
}

function withAction(drawing: MusicVideoScene, startMeasureIndex: number, durationBeats = 4): MusicVideoScene {
  const choreography: SceneChoreography = { version: 1, description: "이전 동작 유지", actors: [{ id: `${drawing.id}-actor`,
    name: "손", elementIds: [drawing.elements[0].id], fixedPoint: [10, 20], movingPoint: [40, 80], endPoint: [60, 80] }],
    actions: [{ id: `${drawing.id}-action`, actorId: `${drawing.id}-actor`, kind: "walk", startMeasureIndex,
      startBeat: 0, durationBeats, strength: 1 }] };
  return { ...drawing, choreography };
}

describe("장면 슬라이드 삽입", () => {
  it("선택 장면 뒤를 균등 분할하고 기존 추가 동작과 그림 정보를 유지한다", () => {
    const original = [scene("first", 3)];
    const result = appendSceneSlide(original, cues(4));
    expect(result.issue).toBeUndefined();
    expect(result.selected).toBe(1);
    expect(result.scenes.map((item) => item.endMeasureIndex)).toEqual([1, 3]);
    expect(result.scenes[0]).toEqual({ ...original[0], endMeasureIndex: 1 });
    expect(result.scenes[0].elements).toBe(original[0].elements);
    expect(result.scenes[1]).toMatchObject({ background: "#ffffff", motion: "still", elements: [], endLyric: null });
    expect(result.scenes[1].id).not.toBe(original[0].id);
    expect(original[0].endMeasureIndex).toBe(3);
    expect(partition(result.scenes, cues(4))).toEqual([2, 2]);
  });

  it("중간 앞 삽입은 선택 장면을 분할하며 나머지 그림 참조와 순서를 보존한다", () => {
    const original = [scene("first", 0), scene("middle", 4), scene("last", 5)];
    const result = insertSceneSlide(original, cues(6), 1, "before");
    expect(result.selected).toBe(1);
    expect(result.scenes.map((item) => item.id)).toEqual(["first", expect.any(String), "middle", "last"]);
    expect(result.scenes[0]).toBe(original[0]);
    expect(result.scenes[2]).toBe(original[1]);
    expect(result.scenes[3]).toBe(original[2]);
    expect(partition(result.scenes, cues(6))).toEqual([1, 2, 2, 1]);
  });

  it("인접 두 장면 모두 한 마디여도 뒤쪽 여유 구간에서 한 마디를 가져온다", () => {
    const original = [scene("a", 0), scene("b", 1), scene("c", 2), scene("d", 5)];
    const result = insertSceneSlide(original, cues(6), 1, "after");
    expect(result.issue).toBeUndefined();
    expect(result.scenes.map((item) => item.id)).toEqual(["a", "b", expect.any(String), "c", "d"]);
    expect(partition(result.scenes, cues(6))).toEqual([1, 1, 1, 1, 2]);
    expect(result.scenes[3]).toMatchObject({ endMeasureIndex: 3, elements: original[2].elements });
    expect(result.scenes[4]).toBe(original[3]);
  });

  it("앞쪽 먼 여유 구간에서도 경계를 당겨 중간 삽입을 허용한다", () => {
    const original = [scene("a", 2), scene("b", 3), scene("c", 4), scene("d", 5)];
    const result = insertSceneSlide(original, cues(6), 2, "after");
    expect(result.issue).toBeUndefined();
    expect(result.scenes.map((item) => item.id)).toEqual(["a", "b", "c", expect.any(String), "d"]);
    expect(partition(result.scenes, cues(6))).toEqual([2, 1, 1, 1, 1]);
    expect(result.scenes[4]).toBe(original[3]);
  });

  it("앞뒤에 여유가 같으면 사용자가 선택한 장면 쪽을 우선 분할한다", () => {
    const original = [scene("a", 3), scene("b", 7)];
    expect(partition(insertSceneSlide(original, cues(8), 1, "before").scenes, cues(8))).toEqual([4, 2, 2]);
    expect(partition(insertSceneSlide(original, cues(8), 0, "after").scenes, cues(8))).toEqual([2, 2, 4]);
  });

  it.each(["before", "after"] as const)("전주의 %s 삽입은 전주 뒤 본곡 시작으로 정규화한다", (placement) => {
    const original = [intro(), scene("song", 3)];
    const result = insertSceneSlide(original, cues(4), 0, placement);
    expect(result.issue).toBeUndefined();
    expect(result.selected).toBe(1);
    expect(result.scenes[0]).toBe(original[0]);
    expect(result.scenes[1].section).toBeUndefined();
    expect(result.scenes[2]).toBe(original[1]);
    expect(result.status).toContain("전주 다음");
    expect(partition(result.scenes, cues(4))).toEqual([2, 2]);
  });

  it("전주만 있거나 비어 있는 타임라인에 본곡 첫 장면을 추가한다", () => {
    const onlyIntro = [intro()];
    const added = appendSceneSlide(onlyIntro, cues(1));
    expect(added.scenes[0]).toBe(onlyIntro[0]);
    expect(added.selected).toBe(1);
    expect(partition(added.scenes, cues(1))).toEqual([1]);
    const empty = appendSceneSlide([], cues(3));
    expect(empty.selected).toBe(0);
    expect(partition(empty.scenes, cues(3))).toEqual([3]);
  });

  it("원본 마디 번호가 연속적이지 않아도 큐 순서대로 분할한다", () => {
    const measures = cues(4, [2, 5, 7, 11]);
    const original = [{ ...scene("legacy", 11), endMeasureIndex: undefined,
      endLyric: { measureIndex: 11, noteId: "old-note" } }];
    const result = appendSceneSlide(original, measures);
    expect(result.scenes.map((item) => item.endMeasureIndex)).toEqual([5, 11]);
    expect(result.scenes[0].endLyric).toBeNull();
    expect(partition(result.scenes, measures)).toEqual([2, 2]);
    expect(original[0].endLyric?.measureIndex).toBe(11);
  });

  it("끝 마디가 변하지 않는 레거시 경계는 음절 앵커까지 그대로 보존한다", () => {
    const original = [{ ...scene("legacy", 3), endMeasureIndex: undefined,
      endLyric: { measureIndex: 3, noteId: "old-note" } }];
    const result = insertSceneSlide(original, cues(4), 0, "before");
    expect(result.scenes[1]).toBe(original[0]);
    expect(result.scenes[1].endLyric).toBe(original[0].endLyric);
  });

  it("끝에 남은 미지정 마디는 기존 장면을 줄이지 않고 새 마지막 장면에 배정한다", () => {
    const original = [withAction(scene("a", 1), 0)];
    const result = appendSceneSlide(original, cues(4), 120);
    expect(result.issue).toBeUndefined();
    expect(result.scenes[0]).toBe(original[0]);
    expect(result.scenes[1]).toMatchObject({ endMeasureIndex: 3, elements: [] });
    expect(partition(result.scenes, cues(4))).toEqual([2, 2]);
    const middle = insertSceneSlide(original, cues(4), 0, "before", 120);
    expect(middle.issue).toBeUndefined();
    expect(middle.scenes[0]).toMatchObject({ startMeasureIndex: 0, endMeasureIndex: 0 });
    expect(middle.scenes[1]).toMatchObject({ startMeasureIndex: 0, endMeasureIndex: 1 });
    expect(middle.scenes[1].elements).toBe(original[0].elements);
    expect(middle.scenes[1].choreography).toBe(original[0].choreography);
    expect(getSceneRangeIssue(middle.scenes, cues(4))).toMatch(/겹/);
    expect(middle.status).toContain("경고");
  });

  it.each(["before", "after"] as const)("모든 장면이 한 마디여도 %s 삽입하고 기존 구간을 고정한다", (placement) => {
    const original = [scene("a", 0), scene("b", 1)];
    const result = insertSceneSlide(original, cues(2), 0, placement);
    const inserted = placement === "before" ? 0 : 1;
    expect(result.issue).toBeUndefined();
    expect(result.selected).toBe(inserted);
    expect(result.scenes).toHaveLength(3);
    expect(result.scenes[inserted]).toMatchObject({ startMeasureIndex: 0, endMeasureIndex: 0, elements: [] });
    const retained = result.scenes.filter((_, index) => index !== inserted);
    expect(retained.map((item) => [item.startMeasureIndex, item.endMeasureIndex])).toEqual([[0, 0], [1, 1]]);
    expect(retained.map((item) => item.elements)).toEqual(original.map((item) => item.elements));
    expect(getSceneRangeIssue(result.scenes, cues(2))).toMatch(/겹/);
    expect(result.status).toContain("경고");
  });

  it("전주를 포함한 전체 24장면 상한을 지킨다", () => {
    const original = [intro(), ...Array.from({ length: 23 }, (_, index) => scene(`song-${index}`, index === 22 ? 31 : index))];
    const result = appendSceneSlide(original, cues(32));
    expect(result.scenes).toBe(original);
    expect(result.issue).toContain("24개");
    expect(getSceneSlideInsertionIssue(original, cues(32), 1, "before")).toContain("24개");
  });

  it("범위가 비거나 순서가 깨진 기록도 삽입을 허용하며 기존 값과 순서는 보존한다", () => {
    const invalids = [[scene("a", 1), scene("b", 1)], [scene("a", 3), intro()]];
    for (const original of invalids) {
      const result = insertSceneSlide(original, cues(4), 0, "after");
      expect(result.issue).toBeUndefined();
      expect(result.selected).toBe(1);
      expect(result.scenes[1]).toMatchObject({ startMeasureIndex: original[0].endMeasureIndex,
        endMeasureIndex: original[0].endMeasureIndex });
      const retained = result.scenes.filter((_, index) => index !== result.selected);
      expect(retained.map((item) => item.id)).toEqual(original.map((item) => item.id));
      expect(retained.map((item) => item.endMeasureIndex)).toEqual(original.map((item) => item.endMeasureIndex));
      expect(retained.map((item) => item.elements)).toEqual(original.map((item) => item.elements));
      expect(result.status).toContain("경고");
    }
    expect(appendSceneSlide([], []).issue).toContain("마디를 먼저");
    expect(getSceneSlideInsertionIssue([], [], 0, "after")).toContain("마디를 먼저");
    expect(insertSceneSlide([scene("a", 3)], cues(4), -1, "before").issue).toContain("선택");
    expect(getSceneSlideInsertionIssue([scene("a", 3)], cues(4), 9, "after")).toContain("선택");
  });

  it("저장된 잘못된 시작과 끝 번호를 임의로 고치지 않고 삽입한다", () => {
    const invalid = { ...scene("invalid", 99), startMeasureIndex: 88 };
    const original = [scene("a", 0), invalid, scene("c", 3)];
    const result = insertSceneSlide(original, cues(4), 1, "before");
    expect(result.issue).toBeUndefined();
    expect(result.scenes[2]).toBe(invalid);
    expect(result.scenes[3]).toBe(original[2]);
    expect(result.scenes[1]).toMatchObject({ startMeasureIndex: 0, endMeasureIndex: 0 });
  });

  it("구간 축소가 기존 동작을 깨뜨리면 다른 인접 구간으로 안전하게 삽입한다", () => {
    const original = [withAction(scene("a", 1), 1), scene("b", 3)];
    const result = insertSceneSlide(original, cues(4), 0, "after", 120);
    expect(result.issue).toBeUndefined();
    expect(partition(result.scenes, cues(4))).toEqual([2, 1, 1]);
    expect(result.scenes[0]).toBe(original[0]);
    expect(result.scenes[0].choreography).toBe(original[0].choreography);
  });

  it("모든 분할이 동작 구간을 벗어나도 우선 분할하고 기존 동작을 보존하여 수정하게 한다", () => {
    const original = [withAction(scene("a", 1), 1), withAction(scene("b", 3), 2)];
    const result = insertSceneSlide(original, cues(4), 0, "after", 120);
    expect(result.issue).toBeUndefined();
    expect(result.selected).toBe(1);
    expect(partition(result.scenes, cues(4))).toEqual([1, 1, 2]);
    expect(result.scenes[0].choreography).toBe(original[0].choreography);
    expect(result.scenes[2].choreography).toBe(original[1].choreography);
    expect(result.scenes[0].elements).toBe(original[0].elements);
    expect(result.scenes[2].elements).toBe(original[1].elements);
    expect(validateSceneActionRanges(result.scenes[0], cues(4), 120, 0, 0)).toContain("시작");
    expect(result.status).toContain("동작의 마디 구간");
  });

  it.each(["before", "after"] as const)("전체 구간을 채운 동작이 있어도 %s 삽입하며 동작 원본을 보존한다", (placement) => {
    const measures = cues(4);
    const original = [withAction(scene("a", 1), 0, 8), withAction(scene("b", 3), 2, 8)];
    const result = insertSceneSlide(original, measures, 0, placement, 120);
    expect(result.issue).toBeUndefined();
    expect(result.selected).toBe(placement === "before" ? 0 : 1);
    const retained = result.scenes.filter((_, index) => index !== result.selected);
    for (let index = 0; index < retained.length; index++) {
      expect(retained[index].elements).toBe(original[index].elements);
      expect(retained[index].choreography).toBe(original[index].choreography);
    }
    expect(result.status).toContain("동작의 마디 구간");
    expect(getSceneMeasureRanges(result.scenes, measures).some((range) =>
      validateSceneActionRanges(result.scenes[range.sceneIndex], measures, 120, range.startIndex, range.endIndex) !== null)).toBe(true);
  });

  it("비활성 이유를 계산하는 동안 새 ID를 만들거나 원본을 바꾸지 않는다", () => {
    const original = [scene("a", 3)];
    const uuid = vi.spyOn(crypto, "randomUUID");
    expect(getSceneSlideInsertionIssue(original, cues(4), 0, "after")).toBeUndefined();
    expect(getSceneSlideInsertionIssue(original, cues(4), 0, "before")).toBeUndefined();
    const editable = [[scene("a", 0), scene("b", 1)], [scene("a", 1)],
      [{ ...scene("a", 2), startMeasureIndex: 0 }, { ...scene("b", 3), startMeasureIndex: 2 }],
      [withAction(scene("a", 1), 1), withAction(scene("b", 3), 2)]];
    for (const source of editable) {
      expect(getSceneSlideInsertionIssue(source, cues(source.length === 2 && source[1].endMeasureIndex === 1 ? 2 : 4),
        0, "before", 120)).toBeUndefined();
    }
    expect(uuid).not.toHaveBeenCalled();
    uuid.mockRestore();
    expect(original).toEqual([scene("a", 3)]);
  });
});

describe("장면 슬라이드 삭제", () => {
  it("중간 삭제 구간은 다음 장면이 흡수하며 모든 남은 그림 참조를 보존한다", () => {
    const original = [scene("a", 1), scene("b", 3), scene("c", 5)];
    const result = deleteSceneSlide(original, cues(6), 1);
    expect(result.selected).toBe(1);
    expect(result.scenes).toEqual([original[0], original[2]]);
    expect(result.scenes[0]).toBe(original[0]);
    expect(result.scenes[1]).toBe(original[2]);
    expect(partition(result.scenes, cues(6))).toEqual([2, 4]);
  });

  it("마지막 장면을 삭제하면 앞 장면이 노래의 마지막 마디까지 이어받는다", () => {
    const original = [withAction(scene("a", 1), 0), scene("b", 3), scene("c", 5)];
    const result = deleteSceneSlide(original, cues(6), 2);
    expect(result.selected).toBe(1);
    expect(result.scenes[0]).toBe(original[0]);
    expect(result.scenes[1]).toEqual({ ...original[1], endMeasureIndex: 5 });
    expect(result.scenes[1].elements).toBe(original[1].elements);
    expect(partition(result.scenes, cues(6))).toEqual([2, 4]);
    expect(original[1].endMeasureIndex).toBe(3);
  });

  it("첫 본곡을 지우면 전주를 그대로 두고 다음 본곡을 첫 마디부터 재생한다", () => {
    const original = [intro(), scene("a", 1), withAction(scene("b", 3), 2)];
    const result = deleteSceneSlide(original, cues(4), 1);
    expect(result.selected).toBe(1);
    expect(result.scenes).toEqual([original[0], original[2]]);
    expect(result.scenes[1].choreography).toBe(original[2].choreography);
    expect(partition(result.scenes, cues(4))).toEqual([4]);
  });

  it("마지막 본곡 하나는 삭제할 수 없고 전주 삭제는 허용한다", () => {
    const original = [intro(), scene("song", 3)];
    const blocked = deleteSceneSlide(original, cues(4), 1);
    expect(blocked.scenes).toBe(original);
    expect(blocked.issue).toContain("하나 이상");
    expect(getSceneSlideDeletionIssue(original, cues(4), 0)).toBeUndefined();
    const removed = deleteSceneSlide(original, cues(4), 0);
    expect(removed.scenes).toEqual([original[1]]);
    expect(removed.scenes[0]).toBe(original[1]);
    expect(removed.selected).toBe(0);
  });

  it("중간의 잘못된 구간도 삭제로 수정할 수 있고 나머지 경계는 임의로 바꾸지 않는다", () => {
    const original = [scene("a", 2), scene("b", 1)];
    expect(deleteSceneSlide(original, cues(4), 0).scenes).toEqual([original[1]]);
    expect(deleteSceneSlide(original, cues(4), 0).scenes[0]).toBe(original[1]);
    expect(getSceneSlideDeletionIssue(original, cues(4), 0)).toBeUndefined();
    expect(getSceneSlideDeletionIssue(original, cues(4), 9)).toContain("선택");
  });

  it("잘못된 마지막 경계를 삭제해도 앞 장면이 노래 마지막 마디까지 이어받는다", () => {
    const originals = [[scene("a", 2), scene("b", 1)],
      [scene("a", 0), { ...scene("b", 3), endMeasureIndex: undefined }],
      [scene("a", 0), scene("b", 1)]];
    for (const original of originals) {
      const result = deleteSceneSlide(original, cues(4), 1);
      expect(result.issue).toBeUndefined();
      expect(result.scenes[0]).toEqual({ ...original[0], endLyric: null, endMeasureIndex: 3 });
      expect(result.scenes[0].elements).toBe(original[0].elements);
      expect(partition(result.scenes, cues(4))).toEqual([4]);
    }
  });

  it("중복된 끝 장면을 삭제할 때 앞 장면이 이미 마지막 마디면 기존 객체를 그대로 쓴다", () => {
    const original = [scene("a", 3), scene("b", 3)];
    const result = deleteSceneSlide(original, cues(4), 1);
    expect(result.scenes[0]).toBe(original[0]);
    expect(result.scenes).toEqual([original[0]]);
  });

  it("노래 마디가 없어도 삭제로 잘못된 그림 기록을 정리할 수 있다", () => {
    const original = [intro(), scene("a", 1), scene("b", 1)];
    expect(deleteSceneSlide(original, [], 0).scenes).toEqual([original[1], original[2]]);
    expect(deleteSceneSlide(original, [], 2).scenes).toEqual([original[0], original[1]]);
    expect(getSceneSlideDeletionIssue([original[1]], [], 0)).toContain("하나 이상");
  });
});

describe("다양한 마디와 삽입 위치의 구간 불변성", () => {
  it("삽입 후 삭제하면 원래 그림 순서와 ID 및 빈틈없는 마디 범위가 유지된다", () => {
    for (let bars = 2; bars <= 12; bars++) {
      const measures = cues(bars);
      for (let count = 1; count < Math.min(bars, 6); count++) {
        const original = Array.from({ length: count }, (_, index) => scene(`s-${index}`,
          index === count - 1 ? bars - 1 : index));
        for (let selected = 0; selected < count; selected++) {
          for (const placement of ["before", "after"] as const) {
            const added = insertSceneSlide(original, measures, selected, placement);
            expect(added.issue).toBeUndefined();
            expect(added.scenes).toHaveLength(count + 1);
            partition(added.scenes, measures);
            expect(added.scenes.filter((_, index) => index !== added.selected).map((item) => item.id))
              .toEqual(original.map((item) => item.id));
            const removed = deleteSceneSlide(added.scenes, measures, added.selected);
            expect(removed.issue).toBeUndefined();
            partition(removed.scenes, measures);
            expect(removed.scenes.map((item) => item.id)).toEqual(original.map((item) => item.id));
            expect(removed.scenes.map((item) => item.elements)).toEqual(original.map((item) => item.elements));
          }
        }
      }
    }
  });
});

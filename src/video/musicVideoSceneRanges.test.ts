import { describe, expect, it } from "vitest";
import { buildMusicVideoPlan, getMusicVideoMeasures, isMusicVideoScenes, validateMusicVideoScenes,
  type MusicVideoScene } from "./musicVideoModel";
import { changeSceneRangeBoundary, findSceneRangeConflicts, getSceneMeasureRanges,
  getSceneRangeIssue, shiftSceneRangesForward } from "./musicVideoSceneRanges";

const source = Array.from({ length: 8 }, (_, measureIndex) => ({ measureIndex,
  notes: [{ id: `note-${measureIndex}`, pitch: 60, lyric: `가사${measureIndex + 1}`,
    duration: { numerator: 4, denominator: 1 } }] }));
const measures = getMusicVideoMeasures(source, 120);
function scene(id: string, endMeasureIndex: number, startMeasureIndex?: number): MusicVideoScene {
  return { id, background: "#ffffff", endLyric: null, endMeasureIndex, motion: "bounce",
    ...(startMeasureIndex === undefined ? {} : { startMeasureIndex }),
    elements: [{ id: `line-${id}`, tool: "line", color: "#123456", width: 4,
      points: [[20, 20, .5], [80, 80, .5]] }] };
}
function ranges(scenes: readonly MusicVideoScene[]) {
  return getSceneMeasureRanges(scenes, measures).map(({ startIndex, endIndex }) => [startIndex, endIndex]);
}
const original = [scene("one", 1), scene("two", 3), scene("three", 5), scene("four", 7)];

describe("장면별 독립된 마디 구간", () => {
  it("예전 저장의 암시된 시작과 명시된 시작을 모두 읽고 전주는 제외한다", () => {
    const intro: MusicVideoScene = { id: "intro", section: "intro", background: "#ffffff", endLyric: null,
      motion: "still", elements: [] };
    expect(getSceneMeasureRanges([intro, original[0], { ...original[1], startMeasureIndex: 3 }], measures))
      .toEqual([
        { sceneIndex: 1, sceneId: "one", startIndex: 0, endIndex: 1 },
        { sceneIndex: 2, sceneId: "two", startIndex: 3, endIndex: 3 }
      ]);
    const legacy = { ...original[0], endMeasureIndex: undefined, endLyric: { measureIndex: 1, noteId: "deleted" } };
    expect(ranges([legacy, original[1]])).toEqual([[0, 1], [2, 3]]);
  });

  it("선택 장면의 끝을 늘려도 다음 장면의 시작과 그림을 보존한다", () => {
    const changed = changeSceneRangeBoundary(original, measures, 1, "end", 4);
    expect(ranges(changed)).toEqual([[0, 1], [2, 4], [4, 5], [6, 7]]);
    expect(findSceneRangeConflicts(changed, measures)).toEqual([{ startIndex: 4, endIndex: 4, sceneIndices: [1, 2] }]);
    expect(changed[2].elements).toBe(original[2].elements);
    expect(original.map((item) => item.startMeasureIndex)).toEqual([undefined, undefined, undefined, undefined]);
    expect(getSceneRangeIssue(changed, measures)).toContain("5마디");
    expect(validateMusicVideoScenes(changed, measures, 120)).toContain("겹쳐");
    expect(() => buildMusicVideoPlan("겹침", source, 120, 0, 16, changed)).toThrow("겹쳐");
  });

  it("선택 장면 시작을 앞당겨 앞 장면과 겹치게 할 수 있다", () => {
    const changed = changeSceneRangeBoundary(original, measures, 2, "start", 2);
    expect(ranges(changed)).toEqual([[0, 1], [2, 3], [2, 5], [6, 7]]);
    expect(findSceneRangeConflicts(changed, measures)).toEqual([{ startIndex: 2, endIndex: 3, sceneIndices: [1, 2] }]);
  });

  it("전주를 본곡으로 바꿀 때도 이웃의 원래 구간과 그림을 보존한다", () => {
    const intro: MusicVideoScene = { ...scene("intro", 1), section: "intro", endMeasureIndex: undefined };
    const changed = changeSceneRangeBoundary([intro, ...original], measures, 0, "end", 0);
    expect(changed[0].section).toBeUndefined();
    expect(changed[0].elements).toBe(intro.elements);
    expect(ranges(changed)).toEqual([[0, 0], [0, 1], [2, 3], [4, 5], [6, 7]]);
    expect(findSceneRangeConflicts(changed, measures)).toEqual([{ startIndex: 0, endIndex: 0, sceneIndices: [0, 1] }]);
    expect(isMusicVideoScenes(changed)).toBe(true);
  });

  it("역전되도록 선택하면 선택한 마디의 한 마디 장면으로 만든다", () => {
    expect(ranges(changeSceneRangeBoundary(original, measures, 2, "end", 0)))
      .toEqual([[0, 1], [2, 3], [0, 0], [6, 7]]);
    expect(ranges(changeSceneRangeBoundary(original, measures, 1, "start", 7)))
      .toEqual([[0, 1], [7, 7], [4, 5], [6, 7]]);
    expect(changeSceneRangeBoundary(original, measures, -1, "end", 3)).toBe(original);
    expect(changeSceneRangeBoundary(original, measures, 1, "end", 99)).toBe(original);
  });

  it("저장된 마디 ID와 배열 위치를 혼동하지 않는다", () => {
    const authored = measures.map((cue, index) => ({ ...cue, measureIndex: index * 3 + 2 }));
    const saved = [scene("a", 5), scene("b", 11)];
    const changed = changeSceneRangeBoundary(saved, authored, 0, "end", 8);
    expect(changed.map((item) => [item.startMeasureIndex, item.endMeasureIndex])).toEqual([[2, 8], [8, 11]]);
    expect(getSceneMeasureRanges(changed, authored).map(({ startIndex, endIndex }) => [startIndex, endIndex]))
      .toEqual([[0, 2], [2, 3]]);
  });

  it("계속 겹치는 영역은 참여 장면을 합치고 떨어진 영역은 나눈다", () => {
    const saved = [scene("a", 4, 0), scene("b", 5, 2), scene("c", 3, 3), scene("d", 7, 5)];
    expect(findSceneRangeConflicts(saved, measures)).toEqual([
      { startIndex: 2, endIndex: 5, sceneIndices: [0, 1, 2, 3] }
    ]);
    expect(findSceneRangeConflicts([scene("a", 2, 0), scene("b", 3, 2), scene("c", 6, 5), scene("d", 7, 6)], measures))
      .toEqual([{ startIndex: 2, endIndex: 2, sceneIndices: [0, 1] },
        { startIndex: 6, endIndex: 6, sceneIndices: [2, 3] }]);
  });

  it("구간이 비어 있거나 순서가 뒤집히면 생성을 막고 미지정 마디를 안내한다", () => {
    expect(getSceneRangeIssue([scene("a", 7, 1)], measures)).toContain("1마디");
    expect(getSceneRangeIssue([scene("a", 1, 0), scene("b", 7, 3)], measures)).toContain("3마디");
    expect(getSceneRangeIssue([scene("a", 6, 0)], measures)).toContain("마지막 마디");
    expect(getSceneRangeIssue([scene("a", 3, 2), scene("b", 1, 0)], measures)).toContain("1–2마디");
    expect(getSceneRangeIssue([{ ...scene("a", 7), startMeasureIndex: 30 }], measures)).toContain("시작하는 마디");
    expect(getSceneRangeIssue([{ ...scene("a", 7), endMeasureIndex: undefined }], measures)).toContain("끝나는 마디");
    expect(getSceneRangeIssue([scene("a", 1, 3)], measures)).toContain("시작 마디가 끝 마디보다");
  });

  it("정상적인 명시 구간은 가사와 정확한 시간 및 후주를 보존한다", () => {
    const saved = original.map((item, index) => ({ ...item, startMeasureIndex: index * 2 }));
    expect(getSceneRangeIssue(saved, measures)).toBeNull();
    const plan = buildMusicVideoPlan("정상", source, 120, 2, 19, saved);
    expect(plan.scenes.map(({ startSeconds, endSeconds }) => [startSeconds, endSeconds]))
      .toEqual([[2, 6], [6, 10], [10, 14], [14, 19]]);
    expect(plan.scenes[1].lyricText).toBe("가사3가사4");
  });
});

describe("겹친 장면을 뒤로 밀기", () => {
  it("각 장면의 마디 길이와 그림·모션을 보존하며 연쇄 충돌을 해소한다", () => {
    const saved = [scene("a", 1), scene("b", 3), scene("c", 5)];
    const changed = changeSceneRangeBoundary(saved, measures, 1, "end", 4);
    const result = shiftSceneRangesForward(changed, measures, 120);
    expect(result.issue).toBeUndefined();
    expect(ranges(result.scenes)).toEqual([[0, 1], [2, 4], [5, 6]]);
    expect(result.scenes[2].elements).toBe(saved[2].elements);
    expect(result.scenes[2].motion).toBe("bounce");
    expect(findSceneRangeConflicts(result.scenes, measures)).toEqual([]);
    expect(result.status).toContain("1개 장면");
  });

  it("노래 끝을 넘으면 일부만 적용하거나 그림을 삭제하지 않고 부족한 마디 수를 알려 준다", () => {
    const changed = changeSceneRangeBoundary(original, measures, 1, "end", 5);
    const result = shiftSceneRangesForward(changed, measures, 120);
    expect(result.scenes).toBe(changed);
    expect(result.issue).toContain("2마디가 더 필요");
    expect(result.issue).toContain("삭제");
    expect(result.issue).toContain("끝 마디를 당기");
    expect(ranges(changed)).toEqual([[0, 1], [2, 5], [4, 5], [6, 7]]);
  });

  it("첫 충돌 뒤의 모든 장면을 함께 밀어 뒤쪽에 있던 간격도 보존한다", () => {
    const saved = [scene("a", 1, 0), scene("b", 4, 2), scene("c", 4, 4), scene("d", 6, 6)];
    const result = shiftSceneRangesForward(saved, measures, 120);
    expect(result.issue).toBeUndefined();
    expect(ranges(result.scenes)).toEqual([[0, 1], [2, 4], [5, 5], [7, 7]]);
    expect(result.scenes.map((item) => item.elements)).toEqual(saved.map((item) => item.elements));
    expect(result.status).toContain("2개 장면");
    expect(getSceneRangeIssue(result.scenes, measures)).toContain("7마디");
  });

  it("전주는 그대로 두고 원래 마디에 고정된 기존 동작을 임의로 삭제하거나 옮기지 않는다", () => {
    const intro: MusicVideoScene = { id: "intro", section: "intro", endLyric: null, background: "#ffffff",
      motion: "still", elements: [] };
    const fixed: MusicVideoScene = { ...scene("c", 5), choreography: { version: 1, description: "이전 동작",
      actors: [{ id: "actor", name: "손", elementIds: ["line-c"], fixedPoint: [20, 20], movingPoint: [80, 80], endPoint: [80, 90] }],
      actions: [{ id: "jump", actorId: "actor", kind: "jump", startMeasureIndex: 4, startBeat: 0, durationBeats: 2, strength: 1 }] } };
    const changed = changeSceneRangeBoundary([intro, scene("a", 1), scene("b", 3), fixed], measures, 2, "end", 4);
    const rejected = shiftSceneRangesForward(changed, measures, 120);
    expect(rejected.scenes).toBe(changed);
    expect(rejected.issue).toContain("고정된 동작");
    expect(rejected.scenes[3].choreography).toBe(fixed.choreography);
    const allowed = shiftSceneRangesForward(changed.map((item) => ({ ...item, choreography: undefined })), measures, 120);
    expect(allowed.issue).toBeUndefined();
    expect(allowed.scenes[0]).toEqual(intro);
  });
});

describe("작업 중 충돌도 그림과 함께 저장", () => {
  it("겹치는 명시 구간은 구조상 정상이며 JSON 왕복에서 보존한다", () => {
    const changed = changeSceneRangeBoundary(original, measures, 1, "end", 4);
    expect(isMusicVideoScenes(changed)).toBe(true);
    const restored = JSON.parse(JSON.stringify(changed));
    expect(isMusicVideoScenes(restored)).toBe(true);
    expect(findSceneRangeConflicts(restored, measures)).toEqual(findSceneRangeConflicts(changed, measures));
    expect(restored).toEqual(changed);
  });

  it.each([-1, 64, .5, null, "0", Number.NaN])("잘못된 명시 시작 %j은 저장하지 않는다", (startMeasureIndex) => {
    expect(isMusicVideoScenes([{ ...original[0], startMeasureIndex }])).toBe(false);
  });

  it("전주에 본곡 시작 마디가 붙은 잘못된 데이터는 거부한다", () => {
    expect(isMusicVideoScenes([{ ...original[0], section: "intro", endMeasureIndex: undefined, startMeasureIndex: 0 }])).toBe(false);
  });
});

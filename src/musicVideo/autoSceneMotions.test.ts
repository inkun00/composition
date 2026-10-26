import { describe, expect, it } from "vitest";
import type { PlaybackMeasure } from "../audio/accompanimentScore";
import type { NoteEvent } from "../music/types";
import type { MusicVideoScene, SceneMotion } from "../video/musicVideoModel";
import { analyzeAutoMotionMusic } from "./autoMotionMusic";
import { createAutoSceneMotionPlan } from "./autoSceneMotions";
import { parseSceneFile, serializeSceneFile } from "./sceneFile";
import { SCENE_MOTION_PRESETS } from "./sceneMotionPresets";

function notes(pitches: readonly (number | null)[], beats = 1): readonly NoteEvent[] {
  return pitches.map((pitch, index) => ({ id: `note-${index}`, pitch,
    duration: { numerator: beats * 4, denominator: 4 } }));
}

function measure(pitches: readonly (number | null)[], beats = 1, measureIndex?: number): PlaybackMeasure {
  return { harmony: "home", measureIndex, notes: notes(pitches, beats) };
}

function scene(id: string, endMeasureIndex?: number): MusicVideoScene {
  return {
    id,
    background: "#fff8ed",
    motion: "still",
    endLyric: null,
    ...(endMeasureIndex === undefined ? {} : { endMeasureIndex }),
    elements: [{ id: `${id}-brush`, tool: "brush", color: "#123456", width: 12,
      points: [[100, 120, .2], [250, 200, .9], [400, 150, 1]] }]
  };
}

function singleMotion(score: PlaybackMeasure, bpm = 120): SceneMotion {
  const plan = createAutoSceneMotionPlan({ scenes: [scene("single", score.measureIndex ?? 0)], measures: [score], bpm });
  expect(plan.issue).toBeNull();
  return plan.assignments[0].motion;
}

describe("악보에 맞춘 전체 장면 자동 모션", () => {
  it("전주는 반주용 등장 효과를 적용하고 본곡의 마디와 추천은 그대로 유지한다", () => {
    const score = [measure([60, 62, 64, 67]), measure([67, 65, 62, 60])];
    const song = [scene("up", 0), scene("down", 1)];
    const normal = createAutoSceneMotionPlan({ scenes: song, measures: score, bpm: 120 });
    const intro: MusicVideoScene = { ...scene("intro"), section: "intro" };
    const planned = createAutoSceneMotionPlan({ scenes: [intro, ...song], measures: score, bpm: 120 });
    expect(planned.issue).toBeNull();
    expect(planned.assignments[0]).toMatchObject({ sceneId: "intro", motion: "fade" });
    expect(planned.assignments.slice(1)).toEqual(normal.assignments);
    expect(planned.scenes.slice(1)).toEqual(normal.scenes);
    expect(planned.scenes[0].section).toBe("intro");
    expect(createAutoSceneMotionPlan({ scenes: planned.scenes, measures: score, bpm: 120 }).scenes).toBe(planned.scenes);
    const empty = { ...intro, elements: [] };
    const blank = createAutoSceneMotionPlan({ scenes: [empty, ...song], measures: score, bpm: 120 });
    expect(blank.issue).toBeNull();
    expect(blank.scenes[0]).toBe(empty);
    expect(blank.assignments).toEqual(normal.assignments);
  });

  it("중간이나 중복 전주에는 어떤 장면도 부분 변경하지 않는다", () => {
    const intro: MusicVideoScene = { ...scene("intro"), section: "intro" };
    for (const scenes of [[scene("song", 0), intro], [intro, { ...intro, id: "second-intro" }, scene("song", 0)]]) {
      const planned = createAutoSceneMotionPlan({ scenes, measures: [measure([60], 4)], bpm: 120 });
      expect(planned.issue).toContain("전주");
      expect(planned.scenes).toBe(scenes);
      expect(planned.assignments).toEqual([]);
    }
  });

  it("각 장면의 실제 상행·하행·촘촘한 리듬·지속음에서 서로 어울리는 효과를 고른다", () => {
    const measures = [
      measure([60, 62, 64, 65]), measure([67, 69, 71, 72]),
      measure([72, 71, 69, 67]), measure([65, 64, 62, 60]),
      measure(Array(8).fill(60), .5), measure(Array(8).fill(60), .5),
      measure([60], 4), measure([60], 4)
    ];
    const scenes = [scene("up", 1), scene("down", 3), scene("rhythm", 5), scene("held", 7)];
    const plan = createAutoSceneMotionPlan({ scenes, measures, bpm: 90, meter: { beats: 4, beatUnit: 4 } });
    expect(plan.issue).toBeNull();
    expect(plan.assignments.map((assignment) => assignment.motion)).toEqual(["move-up", "move-down", "pulse", "float"]);
    expect(plan.assignments.map((assignment) => assignment.reason)).toEqual([
      expect.stringContaining("상행 가락"), expect.stringContaining("하행 가락"),
      expect.stringContaining("촘촘한 리듬"), expect.stringContaining("길게 이어지는 음")
    ]);
    expect(plan.scenes.map((item) => item.motion)).toEqual(plan.assignments.map((assignment) => assignment.motion));
    expect(plan.assignments.every((assignment) => SCENE_MOTION_PRESETS.some((preset) => preset.id === assignment.motion))).toBe(true);
  });

  it("장면 번호가 같아도 도약·순차 가락과 음표 밀도가 다르면 음악에서 효과를 결정한다", () => {
    expect(singleMotion(measure([60, 72, 60, 72, 60]))).toBe("bounce");
    expect(singleMotion(measure([60, 62, 64, 62, 60]))).toBe("float");
    expect(singleMotion(measure([60, 60, 60, 60]))).toBe("bounce");
    expect(singleMotion(measure(Array(8).fill(60), .5))).toBe("pulse");
  });

  it("같은 반복 음표도 실제 BPM에 따른 초당 시작 밀도와 느린 박자를 반영한다", () => {
    const repeated = measure([60, 60, 60, 60]);
    expect(singleMotion(repeated, 60)).toBe("float");
    expect(singleMotion(repeated, 90)).toBe("bounce");
    expect(singleMotion(repeated, 180)).toBe("pulse");
  });

  it.each([0, -20, Number.NaN, Number.POSITIVE_INFINITY])("유효하지 않은 BPM %s는 기존 clock과 같은 120으로 분석한다", (bpm) => {
    const options = { scenes: [scene("fallback", 0)], measures: [measure([60, 60, 60, 60])] };
    expect(createAutoSceneMotionPlan({ ...options, bpm })).toEqual(createAutoSceneMotionPlan({ ...options, bpm: 120 }));
  });

  it("붙임줄로 이어진 같은 음을 재타격으로 세지 않고 긴 음으로 표현한다", () => {
    const repeated = notes([60, 60, 60, 60]);
    const tied: PlaybackMeasure = { harmony: "home", notes: repeated.map((note, index) =>
      ({ ...note, linkToNext: index < repeated.length - 1 })) };
    const music = analyzeAutoMotionMusic([tied], 0, 0, 120);
    expect(music).toMatchObject({ durationBeats: 4, voicedBeats: 4, attacks: 1, meanHeldBeats: 4, longestHeldSeconds: 2 });
    expect(singleMotion(tied)).toBe("float");
    expect(singleMotion({ ...tied, notes: repeated })).toBe("bounce");
  });

  it("마디와 장면 경계의 붙임줄은 유지하되 다른 음높이나 쉼표 뒤의 음은 새로 센다", () => {
    const first: PlaybackMeasure = { harmony: "home", notes: [{ ...notes([60], 4)[0], linkToNext: true }] };
    const carried = measure([60], 4);
    expect(analyzeAutoMotionMusic([first, carried], 1, 1, 90))
      .toMatchObject({ durationBeats: 4, voicedBeats: 4, attacks: 0, meanHeldBeats: 4 });
    expect(analyzeAutoMotionMusic([first, measure([64], 4)], 0, 1, 90).attacks).toBe(2);
    const interrupted: PlaybackMeasure = { harmony: "home", notes: [
      { ...notes([60])[0], linkToNext: true }, ...notes([null, 60]).map((note, index) => ({ ...note, id: `after-${index}` }))
    ] };
    expect(analyzeAutoMotionMusic([interrupted], 0, 0, 90).attacks).toBe(2);
  });

  it("6/8박자의 길이를 3개의 4분음표로 읽고 점4분음표 주요 박에 정렬된 음을 구별한다", () => {
    const compound = measure(Array(6).fill(60), .5);
    const music = analyzeAutoMotionMusic([compound], 0, 0, 120, { beats: 6, beatUnit: 8 });
    expect(music.durationBeats).toBe(3);
    expect(music.attackDensity).toBe(2);
    expect(music.attacksPerSecond).toBe(4);
    expect(music.alignedAttackRatio).toBeCloseTo(1 / 3);
    expect(analyzeAutoMotionMusic([compound], 0, 0, 120, { beats: 3, beatUnit: 8 }).alignedAttackRatio).toBe(1);
  });

  it("가사가 없거나 마디의 박자가 아직 짧아도 실제 있는 음표만으로 분석하고 쉼표 구간을 구별한다", () => {
    const incomplete = createAutoSceneMotionPlan({ scenes: [scene("short", 0)], measures: [measure([60, 64])], bpm: 120 });
    expect(incomplete.issue).toBeNull();
    expect(incomplete.assignments[0].motion).toBe("move-up");
    const rests = createAutoSceneMotionPlan({ scenes: [scene("rests", 0)], measures: [measure([null], 4)], bpm: 120 });
    expect(rests.issue).toBeNull();
    expect(rests.assignments[0]).toMatchObject({ motion: "fade", reason: expect.stringContaining("쉼표 구간") });
    expect(singleMotion(measure([null, null, 60, null]))).toBe("fade");
  });

  it("실제 마디 ID와 이전 가사 anchor를 사용해 장면에 속한 누적 마디만 읽는다", () => {
    const measures = [measure([60, 62, 64, 67], 1, 10), measure([67, 64, 62, 60], 1, 14), measure([60], 4, 20)];
    const legacy = { ...scene("legacy"), endLyric: { measureIndex: 10, noteId: "removed-lyric-note" } };
    const scenes = [legacy, scene("second", 14), scene("third", 20)];
    const plan = createAutoSceneMotionPlan({ scenes, measures, bpm: 90 });
    expect(plan.issue).toBeNull();
    expect(plan.assignments.map((assignment) => assignment.motion)).toEqual(["move-up", "move-down", "float"]);
    expect(plan.scenes[0].endLyric).toBe(legacy.endLyric);
    expect(plan.scenes[0].endMeasureIndex).toBeUndefined();
  });

  it("같은 음악 흐름이 이어질 때만 그 음악 계열 안에서 변주하고 반복 적용은 동일한 결과를 낸다", () => {
    const measures = Array.from({ length: 4 }, () => measure([60, 62, 64, 67]));
    const scenes = measures.map((_, index) => scene(`repeat-${index}`, index));
    const first = createAutoSceneMotionPlan({ scenes, measures, bpm: 120 });
    const again = createAutoSceneMotionPlan({ scenes, measures, bpm: 120 });
    expect(first.assignments.map((assignment) => assignment.motion)).toEqual(["move-up", "move-up-right", "move-up", "move-up-right"]);
    expect(first.assignments[1].reason).toContain("변화를 줬어요");
    expect(again).toEqual(first);
    const appliedAgain = createAutoSceneMotionPlan({ scenes: first.scenes, measures, bpm: 120 });
    expect(appliedAgain.scenes).toBe(first.scenes);
    expect(appliedAgain.assignments).toEqual(first.assignments);
  });

  it("빈 장면을 원본 그대로 건너뛰고 나머지 장면은 각자의 음악 범위로 적용한다", () => {
    const blank = { ...scene("blank", 1), elements: [], background: "#eaf2ff", motion: "pulse" as const };
    const scenes = [scene("first", 0), blank, scene("third", 2)];
    const measures = [measure([60, 62, 64, 67]), measure([67, 64, 62, 60]), measure([60], 4)];
    const plan = createAutoSceneMotionPlan({ scenes, measures, bpm: 90 });
    expect(plan.issue).toBeNull();
    expect(plan.skippedEmpty).toBe(1);
    expect(plan.scenes[1]).toBe(blank);
    expect(plan.assignments.map((assignment) => assignment.sceneId)).toEqual(["first", "third"]);
    expect(plan.assignments.map((assignment) => assignment.motion)).toEqual(["move-up", "float"]);
    const emptyScenes = [{ ...scene("empty", 2), elements: [] }];
    const emptyPlan = createAutoSceneMotionPlan({ scenes: emptyScenes, measures, bpm: 90 });
    expect(emptyPlan).toMatchObject({ issue: null, skippedEmpty: 1, assignments: [] });
    expect(emptyPlan.scenes).toBe(emptyScenes);
  });

  it("장면이 없거나 실제 재생 시간을 계산할 수 없는 음악은 원본을 유지하고 안내한다", () => {
    const scenes: readonly MusicVideoScene[] = [];
    const empty = createAutoSceneMotionPlan({ scenes, measures: [measure([60], 4)], bpm: 120 });
    expect(empty.issue).toContain("장면");
    expect(empty.scenes).toBe(scenes);
    const drawn = [scene("drawn", 0)];
    const invalidTime = createAutoSceneMotionPlan({ scenes: drawn, measures: [measure([60], 4)], bpm: Number.MIN_VALUE });
    expect(invalidTime.issue).toContain("재생 길이");
    expect(invalidTime.assignments).toEqual([]);
    expect(invalidTime.scenes).toBe(drawn);
  });

  it("전체 효과로 기존 부분 효과와 이전 연출을 교체하면서 원본 필압·색·배경·마디·ID를 보존한다", () => {
    const base = scene("original", 0);
    const original: MusicVideoScene = { ...base, motion: "sway", elements: [
      { ...base.elements[0], motion: "snow" },
      { id: "box", tool: "rectangle", color: "#4285f4", width: 8, motion: "still",
        points: [[500, 100, .3], [750, 300, .8]] }
    ], choreography: { version: 1, description: "이전 동작", actors: [{ id: "actor", name: "선",
      elementIds: [base.elements[0].id], fixedPoint: [100, 120], movingPoint: [400, 150], endPoint: [400, 140] }],
      actions: [{ id: "jump", actorId: "actor", kind: "jump", startMeasureIndex: 0,
        startBeat: 0, durationBeats: 2, strength: 1 }] } };
    const before = structuredClone(original);
    const plan = createAutoSceneMotionPlan({ scenes: [original], measures: [measure([60, 62, 64, 67])], bpm: 120 });
    const applied = plan.scenes[0];
    expect(applied.motion).toBe("move-up");
    expect(applied.choreography).toBeUndefined();
    expect(applied.elements.every((element) => !Object.hasOwn(element, "motion"))).toBe(true);
    expect(applied.elements.map(({ motion: _motion, ...artwork }) => artwork))
      .toEqual(original.elements.map(({ motion: _motion, ...artwork }) => artwork));
    expect(applied.elements.every((element, index) => element.points === original.elements[index].points)).toBe(true);
    expect(applied.background).toBe(original.background);
    expect(applied.id).toBe(original.id);
    expect(applied.endMeasureIndex).toBe(original.endMeasureIndex);
    expect(original).toEqual(before);
    expect(parseSceneFile(serializeSceneFile(applied))).toEqual(JSON.parse(JSON.stringify(applied)));
  });

  it.each([
    ["미지정", [scene("first", 0), scene("bad")]],
    ["중복", [scene("first", 0), scene("bad", 0)]],
    ["역순", [scene("first", 1), scene("bad", 0)]],
    ["없는 마디", [scene("first", 0), scene("bad", 10)]],
    ["마지막 마디 누락", [scene("first", 0)]]
  ] as const)("%s 구간이 있으면 앞 장면에도 부분 적용하지 않고 안내한다", (_label, scenes) => {
    const plan = createAutoSceneMotionPlan({ scenes, measures: [measure([60, 62, 64, 67]), measure([67, 64, 62, 60])], bpm: 120 });
    expect(plan.issue).toMatch(/장면|마디/);
    expect(plan.assignments).toEqual([]);
    expect(plan.scenes).toBe(scenes);
  });

  it.each([
    ["악보 없음", []],
    ["음표 없음", [{ harmony: "home", notes: [] }]],
    ["0 길이", [measure([60], 0)]],
    ["음수 길이", [measure([60], -1)]],
    ["무한 길이", [{ harmony: "home", notes: [{ ...notes([60])[0], duration: { numerator: 1, denominator: 0 } }] }]],
    ["잘못된 음높이", [measure([Number.NaN])]],
    ["중복 마디 ID", [measure([60], 4, 2), measure([64], 4, 2)]]
  ] as readonly (readonly [string, readonly PlaybackMeasure[]])[])("%s는 모션을 바꾸지 않고 음악 확인을 안내한다", (_label, measures) => {
    const scenes = [scene("first", 0)];
    const plan = createAutoSceneMotionPlan({ scenes, measures, bpm: 120 });
    expect(plan.issue).toMatch(/악보|리듬|마디/);
    expect(plan.assignments).toEqual([]);
    expect(plan.scenes).toBe(scenes);
  });
});

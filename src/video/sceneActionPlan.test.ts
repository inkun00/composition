import { describe, expect, it } from "vitest";
import type { NoteEvent } from "../music/types";
import { buildLyricVideoPlan } from "./lyricVideoPlan";
import { buildMusicVideoLyricPlan, buildMusicVideoPlan, getMusicVideoMeasures, isMusicVideoScenes, validateMusicVideoScenes,
  withMusicVideoMeasureIndices,
  type MusicVideoScene, type SceneElement } from "./musicVideoModel";
import { findSceneActionVerbMentions, getSceneActionTiming, planSceneActions } from "./sceneActionPlan";
import { createSceneAction, createSceneActor, isSceneChoreography, MAX_SCENE_ACTIONS, MAX_SCENE_ACTORS,
  pruneSceneChoreography, type SceneAction, type SceneActor, type SceneChoreography } from "./sceneActionTypes";

const line = (id: string): SceneElement => ({ id, tool: "brush", color: "#123456", width: 8,
  points: [[100, 100, .5], [200, 200, .5]] });
const actor = (id: string, name: string): SceneActor => ({ id, name, elementIds: [id],
  fixedPoint: [100, 200], movingPoint: [200, 100], endPoint: [230, 100] });
const choreography: SceneChoreography = { version: 1, description: "손으로 스위치를 눌러 전등을 끈다.",
  actors: [actor("hand", "손"), actor("switch", "스위치"), actor("light", "전등")], actions: [] };
const scene: MusicVideoScene = { id: "scene", background: "#ffffff", motion: "auto", endLyric: null,
  endMeasureIndex: 1, elements: [line("hand"), line("switch"), line("light")], choreography };
const note = (id: string, lyric: string, beats: number, rest = false): NoteEvent =>
  ({ id, lyric, pitch: rest ? null : 60, duration: { numerator: beats * 2, denominator: 2 } });
const measures = [
  { notes: [note("rest", "가짜로눌러", .5, true), note("a", "손", .5), note("b", "으로", .5),
    note("c", "스위", .5), note("d", "치를", .5), note("e", "눌러", .5), note("f", "요", 1)] },
  { notes: [note("g", "전등", .5), note("h", "이", .5), note("i", "꺼", .5), note("j", "져", .5), note("k", "요", 2)] }
];
const action = (patch: Partial<SceneAction> = {}): SceneAction => ({ id: "action", actorId: "hand", kind: "press",
  startMeasureIndex: 0, startBeat: 2.5, durationBeats: 2, strength: 1, ...patch });

describe("한국어 동작 어휘와 부정 표현", () => {
  it.each([
    ["손으로 눌렀어요", "press"], ["팔을 굽혀요", "bend"], ["종이를 접지 마", "bend"],
    ["새가 날다", "flap"], ["새가 날지 않아", "flap"], ["새가 날아가요", "flap"],
    ["토끼가 뛴다", "jump"], ["뛰지 마세요", "jump"], ["길을 걸어라", "walk"],
    ["함께 걷지 않는다", "walk"], ["가로등을 켜 주세요", "light-on"],
    ["전등이 꺼지지 않아요", "light-off"], ["꽃이 피었어요", "grow"]
  ] as const)("'%s'에서 활용된 동사를 찾는다", (text, kind) => {
    expect(findSceneActionVerbMentions(text).map((mention) => mention.kind)).toContain(kind);
  });

  it.each([
    "손은 안 눌러요", "버튼을못눌러요", "팔을 안 굽혀요", "새가 날지 않아", "새가날아가지않아",
    "뛰지 마세요", "안 크게 뛰어요", "걷지 못해요", "못 걸어요", "전등을 켜지 않아요",
    "전등이 꺼지지 않아요", "꽃이 자라지는 않아요", "꽃이 피어나지 않아", "점프하지 말아요",
    "흔들고 싶지 않아", "굽혀지지 않아요", "뛰어오르지 않아", "누르면 안 돼", "점프하면 안돼",
    "날면안돼", "don't jump", "do not press"
  ])("'%s'의 금지·부정 동작은 실행 후보에서 제외한다", (text) => {
    const mentions = findSceneActionVerbMentions(text);
    expect(mentions.length).toBeGreaterThan(0);
    expect(mentions.every((mention) => mention.negated)).toBe(true);
  });

  it("부정은 같은 절의 동사에만 적용하고 다음 긍정 동작은 보존한다", () => {
    const text = "안 눌러요. 하지만 다시 눌러요, 새는 날지 않아 그리고 나비는 날아요";
    expect(findSceneActionVerbMentions(text).map(({ kind, negated }) => ({ kind, negated }))).toEqual([
      { kind: "press", negated: true }, { kind: "press", negated: false },
      { kind: "flap", negated: true }, { kind: "flap", negated: false }
    ]);
  });

  it.each(["커피는 따뜻해", "잘 자라 우리 아가", "오늘의 불꽃", "불꽃이 반짝여", "친구를 지켜줘",
    "물을 삼켜요", "옆으로 비켜요", "지난날을 돌이켜요", "모두를 이끄는 사람", "뛰어난 솜씨", "접시를 들어요"])(
    "다른 뜻의 '%s'를 동작으로 오인하지 않는다", (text) => {
      expect(findSceneActionVerbMentions(text)).toEqual([]);
    }
  );

  it("동안·잘못 등의 단어와 명시한 식물의 성장 표현은 부정이나 수면으로 바꾸지 않는다", () => {
    for (const text of ["잠시 동안 걸어요", "버튼을 잘못 눌러요", "나무야 잘 자라요"]) {
      const mentions = findSceneActionVerbMentions(text);
      expect(mentions).toHaveLength(1);
      expect(mentions[0].negated).toBe(false);
    }
  });

  it("동사의 원래 문자 위치를 유지해 음표 경계와 이어진 가사에 맞출 수 있다", () => {
    const text = "손으로 스위치를 누르고 전등을 켜요";
    expect(findSceneActionVerbMentions(text).map(({ start }) => text.slice(start, start + 2)))
      .toEqual(["누르", "켜요"]);
  });
});

describe("가사의 행동과 실제 음표 박자 연결", () => {
  it("쉼표 가사는 제외하고 여러 음표에 나뉜 동사를 읽어 손과 전등을 각각 움직인다", () => {
    const result = planSceneActions({ scene, measures, bpm: 120 });
    expect(result.actions).toMatchObject([
      { actorId: "hand", kind: "press", startMeasureIndex: 0, startBeat: 2.5, durationBeats: 2 },
      { actorId: "light", kind: "light-off", startMeasureIndex: 1, startBeat: 1, durationBeats: 1 }
    ]);
    expect(result.matchedLyrics).toHaveLength(2);
    expect(result.messages.join(" ")).toContain("동사의 음표 시작");
    const frames = buildLyricVideoPlan("노래", measures, 120, 3, 8).frames;
    expect(result.actions.map((item) => getSceneActionTiming(item, frames, 120)))
      .toEqual([{ startSeconds: 4.25, endSeconds: 5.25 }, { startSeconds: 5.5, endSeconds: 6 }]);
  });

  it("스위치가 명시돼도 누르는 손을 먼저 선택하고 켜기·끄기는 전등에 적용한다", () => {
    const result = planSceneActions({ scene, bpm: 120, measures: [{ notes: [
      note("a", "스위치를눌러", 1), note("b", "전등을켜봐", 1), note("c", "전등을꺼봐", 2)
    ] }] });
    expect(result.actions.map((item) => [item.kind, item.actorId, item.startBeat]))
      .toEqual([["press", "hand", 0], ["light-on", "light", 1], ["light-off", "light", 2]]);
  });

  it("불을 켜는 동작은 목적어가 아닌 동사가 불리는 음표에서 시작한다", () => {
    const result = planSceneActions({ scene, bpm: 120, measures: [{ notes: [
      note("a", "불", 1), note("b", "을", 1), note("c", "켜", 1), note("d", "요", 1)
    ] }] });
    expect(result.actions).toMatchObject([{ kind: "light-on", actorId: "light", startBeat: 2 }]);
  });

  it("장면 밖 가사는 추천하지 않고 마지막 동작은 남은 마디 길이 안에 둔다", () => {
    const result = planSceneActions({ scene, measures, bpm: 120, startMeasureIndex: 0, endMeasureIndex: 0 });
    expect(result.actions).toMatchObject([{ kind: "press", startMeasureIndex: 0, durationBeats: 1.5 }]);
    expect(result.actions).toHaveLength(1);
    const last = planSceneActions({ scene, measures, bpm: 120, startMeasureIndex: 1, endMeasureIndex: 1 });
    expect(last.actions).toHaveLength(1);
    expect(last.actions[0].kind).toBe("light-off");
  });

  it("이름 없는 대상이나 이해하지 못한 가사에 임의의 좌우 흔들기를 만들지 않는다", () => {
    const noActors = { ...scene, choreography: { ...choreography, actors: [] } };
    expect(planSceneActions({ scene: noActors, measures, bpm: 120 }).messages.join(" ")).toContain("대상을 만들고");
    const result = planSceneActions({ scene, measures: [{ notes: [note("a", "우리의아름다운이야기", 4)] }], bpm: 120 });
    expect(result.actions).toEqual([]);
    expect(result.messages.join(" ")).toContain("지원 동작을 찾지 못했어요");
  });

  it("전등 대상이 없으면 손을 어둡게 하는 대신 대상 이름을 요청한다", () => {
    const onlyHand = { ...scene, choreography: { ...choreography, actors: [actor("hand", "손")] } };
    const result = planSceneActions({ scene: onlyHand, measures, bpm: 120 });
    expect(result.actions.map((item) => item.kind)).toEqual(["press"]);
    expect(result.messages.join(" ")).toContain("대상을 정하지 못했어요");
  });

  it("부정된 행동은 만들지 않고 사용자가 편집한 기존 동작은 변경하지 않는다", () => {
    const existing = { ...scene, choreography: { ...choreography, actions: [action({ strength: .4 })] } };
    const snapshot = JSON.stringify(existing);
    const result = planSceneActions({ scene: existing, measures: [{ notes: [
      note("a", "누르지않아", 2), note("b", "누르지마", 2)
    ] }], bpm: 120 });
    expect(result.actions).toEqual([]);
    expect(JSON.stringify(existing)).toBe(snapshot);
    expect(planSceneActions({ scene, measures, bpm: 0 }).actions).toEqual([]);
  });

  it("지켜주기 같은 다른 뜻의 단어나 부정한 행동을 전등 켜기와 혼동하지 않는다", () => {
    const result = planSceneActions({ scene, measures: [{ notes: [
      note("a", "지켜줘", 1), note("b", "점프하지마", 1), note("c", "불을켜지않아", 2)
    ] }], bpm: 120 });
    expect(result.actions).toEqual([]);
  });

  it("직접 적은 연출 메모는 새 행동을 자동 실행시키지 않는다", () => {
    const result = planSceneActions({ scene, measures: [{ notes: [note("a", "우리의노래", 4)] }], bpm: 120 });
    expect(scene.choreography?.description).toContain("눌러");
    expect(result.actions).toEqual([]);
  });

  it("명시한 마디 번호와 빈 이름 대상의 수동 지정도 유지한다", () => {
    const target = actor("hand", "대상 1");
    const result = planSceneActions({ scene: { ...scene, endMeasureIndex: 5,
      choreography: { ...choreography, actors: [target] } }, bpm: 100,
    measures: [{ measureIndex: 5, notes: [note("a", "눌러", 4)] }] });
    expect(result.actions[0]).toMatchObject({ actorId: "hand", startMeasureIndex: 5, startBeat: 0 });
  });
});

describe("장면에 저장하는 대상과 동작 검증", () => {
  it("기존 그림은 새 필드 없이 읽고 새 동작도 같은 장면 데이터에 담는다", () => {
    expect(isMusicVideoScenes([{ ...scene, choreography: undefined }])).toBe(true);
    expect(isMusicVideoScenes([{ ...scene, choreography: { ...choreography, actions: [action()] } }])).toBe(true);
    expect(isSceneChoreography({ ...choreography, actors: [], actions: [] }, scene.elements)).toBe(true);
    expect(isSceneChoreography({ ...choreography, actors: [{ ...actor("hand", "손"), elementIds: [] }] }, scene.elements)).toBe(true);
  });

  it.each([
    { version: 2 }, { description: "x".repeat(1001) }, { actors: null }, { actions: null },
    { actors: [actor("missing", "손")] }, { actors: [actor("hand", "손"), actor("hand", "손")] },
    { actors: [{ ...actor("hand", "손"), elementIds: ["hand", "hand"] }] },
    { actors: [actor("hand", "손"), { ...actor("switch", "스위치"), elementIds: ["hand"] }] },
    { actors: [{ ...actor("hand", "손"), name: "" }] },
    { actors: [{ ...actor("hand", "손"), name: "x".repeat(41) }] },
    { actors: [{ ...actor("hand", "손"), fixedPoint: [-1, 10] }] },
    { actors: [{ ...actor("hand", "손"), movingPoint: [10, 541] }] },
    { actors: [{ ...actor("hand", "손"), endPoint: [Number.NaN, 10] }] },
    { actors: [{ ...actor("hand", "손"), fixedPoint: [10, 10, .5] }] },
    { actions: [action({ actorId: "missing" })] }, { actions: [action(), action()] },
    { actions: [action({ kind: "evil" as "press" })] },
    { actions: [action({ startMeasureIndex: 64 })] }, { actions: [action({ startMeasureIndex: -.5 })] },
    { actions: [action({ startBeat: -1 })] }, { actions: [action({ startBeat: Number.POSITIVE_INFINITY })] },
    { actions: [action({ durationBeats: 0 })] }, { actions: [action({ durationBeats: 65 })] },
    { actions: [action({ strength: 0 })] }, { actions: [action({ strength: 2.1 })] }
  ])("깨진 동작 정보를 정상적인 그림 데이터로 읽지 않는다: %j", (patch) => {
    expect(isMusicVideoScenes([{ ...scene, choreography: { ...choreography, ...patch } }])).toBe(false);
  });

  it("장면별 대상 수와 동작 수의 상한을 적용한다", () => {
    const actors = Array.from({ length: MAX_SCENE_ACTORS + 1 }, (_, index) =>
      ({ ...actor(`actor-${index}`, "대상"), elementIds: [] }));
    expect(isSceneChoreography({ ...choreography, actors: actors.slice(0, -1) }, scene.elements)).toBe(true);
    expect(isSceneChoreography({ ...choreography, actors }, scene.elements)).toBe(false);
    const actions = Array.from({ length: MAX_SCENE_ACTIONS + 1 }, (_, index) => action({ id: `action-${index}` }));
    expect(isSceneChoreography({ ...choreography, actions: actions.slice(0, -1) }, scene.elements)).toBe(true);
    expect(isSceneChoreography({ ...choreography, actions }, scene.elements)).toBe(false);
  });

  it("지운 선의 대상과 동작을 함께 정리하되 설정 중인 빈 대상은 유지한다", () => {
    const empty = { ...actor("new", "새 대상"), elementIds: [] };
    const planned = { ...choreography, actors: [...choreography.actors, empty], actions: [action()] };
    const pruned = pruneSceneChoreography(planned, [line("switch"), line("light")]);
    expect(pruned?.actors.map((item) => item.id)).toEqual(["switch", "light", "new"]);
    expect(pruned?.actions).toEqual([]);
    expect(isSceneChoreography(pruned, [line("switch"), line("light")])).toBe(true);
    expect(pruneSceneChoreography(undefined, [])).toBeUndefined();
  });

  it("초기 제어점은 선택한 그림의 범위 안에서 만들고 직접 편집할 동작을 만든다", () => {
    const created = createSceneActor([line("hand")], "손");
    expect(created).toMatchObject({ name: "손", elementIds: ["hand"], fixedPoint: [150, 200], movingPoint: [150, 100] });
    expect(createSceneAction(created.id, "bend", 2)).toMatchObject({ actorId: created.id, kind: "bend", startMeasureIndex: 2 });
  });
});

describe("악보 수정 뒤 동작 범위 재검사", () => {
  const cues = getMusicVideoMeasures(measures, 120);
  const animated = (item: SceneAction): MusicVideoScene => ({ ...scene,
    choreography: { ...choreography, actions: [item] } });

  it("마디 길이나 장면 구간을 넘은 동작을 조용히 버리지 않고 수정을 요청한다", () => {
    expect(validateMusicVideoScenes([animated(action({ startMeasureIndex: 2 }))], cues, 120)).toContain("구간 밖");
    expect(validateMusicVideoScenes([animated(action({ startBeat: 4 }))], cues, 120)).toContain("시작 박자");
    expect(validateMusicVideoScenes([animated(action({ durationBeats: 8 }))], cues, 120)).toContain("동작 길이");
    expect(validateMusicVideoScenes([animated(action())], cues, 120)).toBeNull();
    expect(() => buildMusicVideoPlan("노래", measures, 120, 2, 8,
      [animated(action({ durationBeats: 8 }))])).toThrow("동작 길이");
  });

  it("전주와 쉼표를 포함하고 없는 마디나 마디 끝에서 시작하는 동작은 무시하지 않는다", () => {
    const frames = buildLyricVideoPlan("노래", measures, 120, 2, 8).frames;
    expect(getSceneActionTiming(action({ startMeasureIndex: 1, startBeat: 1 }), frames, 120))
      .toEqual({ startSeconds: 4.5, endSeconds: 5.5 });
    expect(getSceneActionTiming(action({ startBeat: 4 }), frames, 120)).toBeNull();
    expect(getSceneActionTiming(action({ startMeasureIndex: 5 }), frames, 120)).toBeNull();
    expect(getSceneActionTiming(action(), frames, Number.NaN)).toBeNull();
  });

  it("장면용 가사 타이밍은 연속하지 않는 실제 마디 번호를 동작과 함께 유지한다", () => {
    const authored = [{ ...measures[0], measureIndex: 4 }, { ...measures[1], measureIndex: 7 }];
    const planned = { ...animated(action({ startMeasureIndex: 7, startBeat: 1 })), endMeasureIndex: 7 };
    const plan = buildMusicVideoPlan("노래", authored, 120, 2, 8, [planned]);
    expect(getSceneActionTiming(planned.choreography!.actions[0], plan.lyrics.frames, 120))
      .toEqual({ startSeconds: 4.5, endSeconds: 5.5 });
    expect(buildMusicVideoLyricPlan("노래", authored, 120, 2, 8).frames.map((frame) => frame.measureIndex))
      .toEqual([null, ...Array(measures[0].notes.length).fill(4), ...Array(measures[1].notes.length).fill(7), null]);
    const recording = buildLyricVideoPlan("녹음", authored, 120, 2, 8);
    expect(getSceneActionTiming(planned.choreography!.actions[0],
      withMusicVideoMeasureIndices(recording, authored).frames, 120)).toEqual({ startSeconds: 4.5, endSeconds: 5.5 });
  });

  it("선 지정 전인 대상에 연결된 동작은 그림을 지정하도록 안내한다", () => {
    const unassigned = { ...animated(action()), choreography: { ...choreography,
      actors: [{ ...actor("hand", "손"), elementIds: [] }], actions: [action()] } };
    expect(validateMusicVideoScenes([unassigned], cues, 120)).toContain("그림의 선을 지정");
  });
});

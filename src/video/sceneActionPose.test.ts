import { describe, expect, it } from "vitest";
import { buildMusicVideoPlan, type MusicVideoScene } from "./musicVideoModel";
import { actionAmount, deformActorPoint, sampleActorPose } from "./sceneActionPose";
import type { SceneAction, SceneActor } from "./sceneActionTypes";

const actor: SceneActor = { id: "hand", name: "손", elementIds: ["finger"],
  fixedPoint: [300, 300], movingPoint: [450, 300], endPoint: [480, 330] };
const press: SceneAction = { id: "press", actorId: "hand", kind: "press", startMeasureIndex: 0,
  startBeat: 1, durationBeats: 2, strength: 1 };
const scene: MusicVideoScene = { id: "scene", background: "#ffffff", motion: "auto", endLyric: null,
  endMeasureIndex: 1, elements: [{ id: "finger", tool: "line", color: "#123456", width: 4,
    points: [[300, 300, .5], [450, 300, .5]] }],
  choreography: { version: 1, description: "", actors: [actor], actions: [press] } };
const measures = Array.from({ length: 2 }, (_, index) => ({ notes: [{ id: `note-${index}`, pitch: 60,
  lyric: "누르기", duration: { numerator: 4, denominator: 1 } }] }));
const plan = buildMusicVideoPlan("노래", measures, 120, 2, 7, [scene]);

describe("대상별 선 변형과 절대 동작 시각", () => {
  it("손목은 고정하면서 손끝은 지정한 도착점까지 변형한다", () => {
    expect(deformActorPoint(actor.fixedPoint, actor, press)).toEqual(actor.fixedPoint);
    expect(deformActorPoint(actor.movingPoint, actor, press)).toEqual(actor.endPoint);
    const middle = deformActorPoint([375, 300], actor, press);
    expect(middle[0]).toBeGreaterThan(375);
    expect(middle[0] - 375).toBeLessThan(30);
    expect(middle[1]).toBeGreaterThan(300);
  });

  it("도착점과 크기 수정이 동일한 고정점 주위의 실제 형태를 바꾼다", () => {
    const stronger = deformActorPoint(actor.movingPoint, actor, { ...press, strength: 2 });
    expect(stronger).toEqual([510, 360]);
    const reversed = deformActorPoint(actor.movingPoint, { ...actor, endPoint: [420, 280] }, press);
    expect(reversed).toEqual([420, 280]);
  });

  it("누르기는 한 번 눌렀다 돌아오며 장면 전체에서 반복하지 않는다", () => {
    expect(actionAmount("press", -.1)).toBe(0);
    expect(actionAmount("press", .5)).toBe(1);
    expect(actionAmount("press", 1)).toBe(0);
    expect(actionAmount("press", 3)).toBe(0);
    expect(actionAmount("bend", 3)).toBe(1);
    expect(actionAmount("move", 3)).toBe(1);
  });

  it("전주와 음표 시작 박을 포함해 동작이 예약되고 끝나면 복귀한다", () => {
    expect(sampleActorPose(scene, actor, plan, 2.4).motions).toEqual([]);
    const pressed = sampleActorPose(scene, actor, plan, 3).motions;
    expect(pressed).toHaveLength(1);
    expect(pressed[0].amount).toBe(1);
    expect(sampleActorPose(scene, actor, plan, 3.6).motions).toEqual([]);
  });

  it("불 끄기는 지정 대상에만 적용되는 지속 상태이고 나중에 다시 켤 수 있다", () => {
    const lights: MusicVideoScene = { ...scene, choreography: { ...scene.choreography!, actions: [
      { ...press, kind: "light-off", startBeat: 0, durationBeats: 1 },
      { ...press, id: "on", kind: "light-on", startMeasureIndex: 1, startBeat: 0, durationBeats: 1 }
    ] } };
    expect(sampleActorPose(lights, actor, plan, 1).light).toBe(1);
    expect(sampleActorPose(lights, actor, plan, 2.5).light).toBe(0);
    expect(sampleActorPose(lights, actor, plan, 3.5).light).toBe(0);
    expect(sampleActorPose(lights, actor, plan, 4.5).light).toBe(1);
    expect(sampleActorPose(lights, { ...actor, id: "unassigned" }, plan, 4.5).light).toBeNull();
  });

  it("표정·날개 움직임도 고정점은 남겨 두고 바깥쪽 선을 변형한다", () => {
    for (const kind of ["nod", "flap", "swing"] as const) {
      const action = { ...press, kind };
      expect(deformActorPoint(actor.fixedPoint, actor, action)).toEqual(actor.fixedPoint);
      const target = deformActorPoint(actor.movingPoint, actor, action);
      expect(target[0]).toBeCloseTo(actor.endPoint[0]);
      expect(target[1]).toBeCloseTo(actor.endPoint[1]);
      const reversed = deformActorPoint(actor.movingPoint, { ...actor, endPoint: [420, 280] }, action);
      expect(reversed[0]).toBeCloseTo(420);
      expect(reversed[1]).toBeCloseTo(280);
    }
  });

  it("날갯짓은 가운데를 고정하고 양쪽 윤곽을 대칭으로 들어 올린다", () => {
    const wings = { ...actor, endPoint: [420, 240] as const };
    const action = { ...press, kind: "flap" as const };
    expect(deformActorPoint(wings.fixedPoint, wings, action)).toEqual(wings.fixedPoint);
    const right = deformActorPoint([450, 300], wings, action);
    const left = deformActorPoint([150, 300], wings, action);
    expect(right[1]).toBeCloseTo(240);
    expect(left[1]).toBeCloseTo(240);
    expect(left[0]).toBeCloseTo(180);
    expect(right[0]).toBeCloseTo(420);
  });
});

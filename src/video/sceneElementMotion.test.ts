import { describe, expect, it, vi } from "vitest";
import type { MusicVideoPlan, MusicVideoScene, SceneElement, TimedMusicVideoScene } from "./musicVideoModel";
import { drawSceneElementMotions, hasElementMotions } from "./sceneElementMotion";

const first: SceneElement = { id: "first", tool: "line", width: 8, color: "#123456", points: [[10, 20, .5], [100, 30, .5]] };
const second: SceneElement = { ...first, id: "second", motion: "pulse" };
const scene: MusicVideoScene = { id: "scene", background: "#ffffff", motion: "float", elements: [first, second],
  endLyric: null, endMeasureIndex: 0 };
const timed: TimedMusicVideoScene = { scene, startSeconds: 3, endSeconds: 7, lyricText: "노래" };
const plan: MusicVideoPlan = { title: "노래", bpm: 120, introSeconds: .08, scenes: [timed],
  lyrics: { title: "노래", frames: [], hasLyrics: false } };

describe("부분 효과의 임시 개체 장면", () => {
  it("원래 그림 순서와 점 참조를 보존하고 개체 효과·장면 기본 효과를 적용한다", () => {
    const draw = vi.fn();
    const before = JSON.stringify(scene);
    drawSceneElementMotions({} as CanvasRenderingContext2D, timed, plan, 4, draw);
    const children = draw.mock.calls.map((call) => call[1] as TimedMusicVideoScene);
    expect(children.map((child) => child.scene.elements[0].id)).toEqual(["first", "second"]);
    expect(children.map((child) => child.scene.motion)).toEqual(["float", "pulse"]);
    expect(children.every((child) => !hasElementMotions(child.scene))).toBe(true);
    expect(children.every((child) => child.startSeconds === 3 && child.endSeconds === 7)).toBe(true);
    expect(children[1].scene.elements[0].points).toBe(second.points);
    expect(children[1].scene.choreography).toBeUndefined();
    expect(draw.mock.calls.every((call) => call[2] === plan && call[3] === 4 && call[4] === true)).toBe(true);
    expect(JSON.stringify(scene)).toBe(before);
  });

  it("같은 불변 장면을 재생할 때 임시 장면을 재사용하고 새 편집 장면은 다시 만든다", () => {
    const draw = vi.fn();
    drawSceneElementMotions({} as CanvasRenderingContext2D, timed, plan, 4, draw);
    const child = draw.mock.calls[1][1].scene;
    draw.mockClear();
    drawSceneElementMotions({} as CanvasRenderingContext2D, timed, plan, 5, draw);
    expect(draw.mock.calls[1][1].scene).toBe(child);
    draw.mockClear();
    const edited = { ...scene, elements: [first, { ...second, motion: "bounce" as const }] };
    drawSceneElementMotions({} as CanvasRenderingContext2D, { ...timed, scene: edited }, plan, 5, draw);
    expect(draw.mock.calls[1][1].scene).not.toBe(child);
    expect(draw.mock.calls[1][1].scene.motion).toBe("bounce");
  });
});

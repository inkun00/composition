// @vitest-environment jsdom

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlaybackMeasure } from "../audio/accompanimentScore";
import type { MusicVideoScene } from "../video/musicVideoModel";
import { createAutoSceneMotionPlan } from "./autoSceneMotions";
import { currentScenes, onScenesChange, mount, open, byTestId, byLabel, click,
  setupFeatureHarness, cleanupFeatureHarness } from "./MusicVideoFeature.testHarness";

const exporter = vi.hoisted(() => vi.fn());
vi.mock("../video/exportMusicVideoMp4", () => ({ exportMusicVideoMp4: exporter }));
vi.mock("./SceneMotionPreview", () => ({ default: () => <div data-testid="motion-preview" /> }));

const score: readonly PlaybackMeasure[] = [
  [60, 62, 64, 67], [72, 69, 67, 64],
  Array.from({ length: 8 }, () => 60), [65]
].map((pitches, measureIndex) => ({
  harmony: "home", measureIndex, chords: ["C"],
  notes: pitches.map((pitch, index) => ({ id: `auto-note-${measureIndex}-${index}`, pitch,
    lyric: "노래", duration: { numerator: 4, denominator: pitches.length } }))
}));

function fixture(): readonly MusicVideoScene[] {
  return score.map((_, index) => ({
    id: `auto-scene-${index}`,
    background: index % 2 ? "#eaf2ff" : "#fff8ed",
    motion: "snow",
    endLyric: null,
    endMeasureIndex: index,
    choreography: { version: 1, description: "이전 동작", actors: [], actions: [] },
    elements: [{ id: `auto-shape-${index}`, tool: "rectangle", color: "#4285f4", width: 8,
      motion: "move-left", points: [[150, 160, .25], [550, 370, .9]] }]
  }));
}

function originals(scenes: readonly MusicVideoScene[]) {
  return scenes.map(({ motion: _motion, choreography: _choreography, elements, ...scene }) => ({ ...scene,
    elements: elements.map(({ motion: _elementMotion, ...element }) => element) }));
}

beforeEach(() => setupFeatureHarness(exporter));
afterEach(cleanupFeatureHarness);

describe("전체 장면 음악 맞춤 자동 모션", () => {
  it("한 번에 모든 그림에 음악별 효과를 적용하고 한 번의 실행 취소·다시 실행으로 전체를 복원한다", () => {
    const scenes = fixture();
    const unchanged = structuredClone(scenes);
    mount({ initialScenes: scenes, measures: score, bpm: 120 });
    open();
    click(byTestId("scene-auto-motions"));
    expect(currentScenes.map((scene) => scene.motion)).toEqual(["move-up", "move-down", "pulse", "float"]);
    expect(onScenesChange).toHaveBeenCalledTimes(1);
    expect(originals(currentScenes)).toEqual(originals(scenes));
    expect(scenes).toEqual(unchanged);
    expect(currentScenes.every((scene) => scene.choreography === undefined &&
      scene.elements.every((element) => element.motion === undefined))).toBe(true);
    const applied = currentScenes;
    click(byLabel("그림 되돌리기"));
    expect(currentScenes).toBe(scenes);
    expect(byLabel("그림 되돌리기").disabled).toBe(true);
    click(byLabel("그림 다시 실행"));
    expect(currentScenes).toBe(applied);
  });

  it("이미 적용된 추천을 다시 눌러도 기록을 추가하지 않고 선택 범위는 전체 그림으로 전환한다", () => {
    mount({ initialScenes: fixture(), measures: score, bpm: 120 });
    open();
    click(byTestId("scene-auto-motions"));
    const applied = currentScenes;
    click(byTestId("scene-motion-scope-selection"));
    click(byTestId("scene-auto-motions"));
    expect(currentScenes).toBe(applied);
    expect(onScenesChange).toHaveBeenCalledTimes(1);
    expect(byTestId("scene-motion-scope-whole").getAttribute("aria-pressed")).toBe("true");
    click(byLabel("그림 되돌리기"));
    expect(byLabel("그림 되돌리기").disabled).toBe(true);
  });

  it("가사와 마디 완성 여부와 무관하게 현재 음표를 사용하고 빈 장면은 그대로 둔다", () => {
    const scenes = fixture().map((scene, index) => index === 2 ? { ...scene, elements: [] } : scene);
    const instrumental = score.map((measure) => ({ ...measure,
      notes: measure.notes.map((note) => ({ ...note, lyric: "" })) }));
    mount({ initialScenes: scenes, measures: instrumental, complete: false });
    open();
    expect(byTestId("scene-auto-motions").disabled).toBe(false);
    click(byTestId("scene-auto-motions"));
    expect(currentScenes[2]).toEqual(scenes[2]);
    expect(currentScenes[0].motion).toBe("move-up");
    expect(currentScenes[1].motion).toBe("move-down");
    expect(document.body.textContent).toContain("빈 장면 1개는 그대로");
    expect(byTestId("create-music-video").disabled).toBe(true);
  });

  it("잘못된 구간은 실행을 막고 원본이나 실행 취소 기록을 바꾸지 않는다", () => {
    const scenes = fixture().map((scene, index) => index === 2 ? { ...scene, endMeasureIndex: 0 } : scene);
    mount({ initialScenes: scenes, measures: score });
    open();
    expect(byTestId("scene-auto-motions").disabled).toBe(true);
    click(byTestId("scene-auto-motions"));
    expect(currentScenes).toBe(scenes);
    expect(onScenesChange).not.toHaveBeenCalled();
    expect(byLabel("그림 되돌리기").disabled).toBe(true);
  });

  it("모든 그림이 비어 있으면 안내와 함께 자동 적용을 비활성화한다", () => {
    const scenes = fixture().map((scene) => ({ ...scene, elements: [] }));
    mount({ initialScenes: scenes, measures: score });
    open();
    expect(byTestId("scene-auto-motions").disabled).toBe(true);
    expect(document.querySelector('[data-testid="scene-auto-motions-hint"]')?.textContent).toContain("장면에 그림을 그리면");
    click(byTestId("scene-auto-motions"));
    expect(currentScenes).toBe(scenes);
    expect(onScenesChange).not.toHaveBeenCalled();
  });

  it("선택한 장면뿐 아니라 모든 장면의 추천 이유와 실제 적용 여부를 표시하고 악보 변경 때 갱신한다", () => {
    mount({ initialScenes: fixture(), measures: score, bpm: 120 });
    open();
    const details = document.querySelector<HTMLDetailsElement>('[data-testid="scene-auto-motions-summary"]')!;
    expect(details.open).toBe(false);
    expect(details.querySelectorAll("li")).toHaveLength(4);
    expect(details.textContent).toContain("상행 가락");
    expect(details.textContent).toContain("하행 가락");
    click(byTestId("scene-auto-motions"));
    expect(details.querySelectorAll('[data-applied="true"]')).toHaveLength(4);
    const changed = score.map((measure, index) => index === 0 ? { ...measure,
      notes: measure.notes.map((note) => ({ ...note, pitch: 120 - note.pitch! })) } : measure);
    mount({ initialScenes: fixture(), measures: changed, bpm: 120 });
    const planned = createAutoSceneMotionPlan({ scenes: currentScenes, measures: changed, bpm: 120 });
    expect(details.querySelector('[data-testid="scene-auto-motion-status-auto-scene-0"]')?.getAttribute("data-applied")).toBe("false");
    click(byTestId("scene-auto-motions"));
    expect(currentScenes.map((scene) => scene.motion)).toEqual(planned.scenes.map((scene) => scene.motion));
  });

  it("제작 중에는 자동 모션을 변경할 수 없다", async () => {
    exporter.mockReturnValue(new Promise(() => {}));
    mount({ initialScenes: fixture(), measures: score });
    open();
    const before = currentScenes;
    click(byTestId("create-music-video"));
    await act(async () => byTestId("confirm-music-video").click());
    expect(byTestId("scene-auto-motions").disabled).toBe(true);
    click(byTestId("scene-auto-motions"));
    expect(currentScenes).toBe(before);
    expect(onScenesChange).not.toHaveBeenCalled();
  });
});

// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getMusicVideoMeasures, type MusicVideoScene } from "../video/musicVideoModel";
import { getSceneMeasureRanges } from "../video/musicVideoSceneRanges";
import { currentScenes, mount, open, byTestId, byLabel, click, canvasClick, choosePreset,
  setupFeatureHarness, cleanupFeatureHarness, measures } from "./MusicVideoFeature.testHarness";

const { exporter } = vi.hoisted(() => ({ exporter: vi.fn() }));
vi.mock("../video/exportMusicVideoMp4", () => ({ exportMusicVideoMp4: exporter }));
vi.mock("./SceneMotionPreview", () => ({ default: () => <div /> }));

function scene(id: string, endMeasureIndex: number, startMeasureIndex?: number): MusicVideoScene {
  return { id, endMeasureIndex, startMeasureIndex, endLyric: null, background: "#ffffff", motion: "still",
    elements: [{ id: `${id}-line`, tool: "line", color: "#123456", width: 8,
      points: [[20, 30, .5], [100, 110, .5]] }] };
}

function actionScene(id: string, end: number, actionStart: number): MusicVideoScene {
  return { ...scene(id, end), choreography: { version: 1, description: "기존 동작 보존",
    actors: [{ id: `${id}-actor`, name: "손", elementIds: [`${id}-line`],
      fixedPoint: [20, 30], movingPoint: [100, 110], endPoint: [130, 110] }],
    actions: [{ id: `${id}-action`, actorId: `${id}-actor`, kind: "walk", startMeasureIndex: actionStart,
      startBeat: 0, durationBeats: 4, strength: 1 }] } };
}

function warning() { return document.querySelector('[data-testid="scene-range-warning"]'); }

function assertVideoBlocked() {
  expect(byTestId("create-music-video").disabled).toBe(true);
  expect(byTestId("music-video-preview-open").disabled).toBe(true);
  click(byTestId("create-music-video"));
  expect(document.querySelector(".mv-choice")).toBeNull();
  expect(exporter).not.toHaveBeenCalled();
}

beforeEach(() => setupFeatureHarness(exporter));
afterEach(cleanupFeatureHarness);

describe("문제를 남긴 채 편집할 수 있는 중간 삽입", () => {
  it.each(["before", "after"])("모든 마디가 한 장면씩이어도 %s 삽입하고 해결 전까지 생성을 막는다", (placement) => {
    const original = [0, 1, 2, 3].map((end) => scene(`full-${end}`, end));
    mount({ initialScenes: original });
    open();
    click(byLabel("2번 장면 선택"));
    expect(byTestId(`insert-music-video-scene-${placement}`).disabled).toBe(false);
    click(byTestId(`insert-music-video-scene-${placement}`));
    expect(currentScenes).toHaveLength(5);
    const createdIndex = placement === "before" ? 1 : 2;
    expect(currentScenes[createdIndex]).toMatchObject({ startMeasureIndex: 1, endMeasureIndex: 1, elements: [] });
    const cues = getMusicVideoMeasures(measures, 120);
    const originalRanges = getSceneMeasureRanges(original, cues);
    for (const old of originalRanges) {
      const saved = currentScenes.find((item) => item.id === old.sceneId)!;
      expect(saved.startMeasureIndex).toBe(old.startIndex);
      expect(saved.endMeasureIndex).toBe(old.endIndex);
      expect(saved.elements).toBe(original[old.sceneIndex].elements);
    }
    canvasClick(240, 220);
    expect(warning()?.textContent).toContain("2마디 겹침");
    assertVideoBlocked();
    click(byTestId("delete-storyboard-scene"));
    expect(warning()).toBeNull();
    expect(byTestId("create-music-video").disabled).toBe(false);
    click(byLabel("그림 되돌리기"));
    expect(currentScenes).toHaveLength(5);
    assertVideoBlocked();
    click(byLabel("그림 다시 실행"));
    expect(warning()).toBeNull();
    expect(byTestId("create-music-video").disabled).toBe(false);
  });

  it.each([
    { name: "겹침", scenes: [scene("a", 1, 0), scene("b", 3, 1)] },
    { name: "중간 빈 마디", scenes: [scene("a", 0, 0), scene("b", 3, 2)] },
    { name: "미연결 마지막 마디", scenes: [scene("a", 0), scene("b", 1)] }
  ])("$name 상태에서도 중간에 넣고 기존 구간과 그림을 보존한다", ({ scenes: original }) => {
    const cues = getMusicVideoMeasures(measures, 120);
    const before = getSceneMeasureRanges(original, cues);
    mount({ initialScenes: original });
    open();
    expect(byTestId("insert-music-video-scene-after").disabled).toBe(false);
    click(byTestId("insert-music-video-scene-after"));
    expect(currentScenes).toHaveLength(3);
    for (const old of before) {
      const saved = getSceneMeasureRanges(currentScenes, cues).find((item) => item.sceneId === old.sceneId)!;
      expect([saved.startIndex, saved.endIndex]).toEqual([old.startIndex, old.endIndex]);
      expect(currentScenes[saved.sceneIndex].elements).toBe(original[old.sceneIndex].elements);
    }
    expect(warning()).not.toBeNull();
    assertVideoBlocked();
    click(byLabel("그림 되돌리기"));
    expect(currentScenes).toEqual(original);
  });

  it("동작 구간을 벗어나는 분할도 허용하고 동작을 다시 고를 때까지 정적 영상도 막는다", async () => {
    const original = [actionScene("a", 1, 1), actionScene("b", 3, 2)];
    mount({ initialScenes: original });
    open();
    expect(byTestId("insert-music-video-scene-after").disabled).toBe(false);
    click(byTestId("insert-music-video-scene-after"));
    expect(currentScenes).toHaveLength(3);
    for (const old of original) expect(currentScenes.find((item) => item.id === old.id)?.choreography).toEqual(old.choreography);
    expect(document.querySelector('[data-testid="scene-action-conflict-row"]')?.textContent)
      .toContain("1번 장면");
    expect(warning()?.textContent).toContain("애니메이션 없음으로 만들 때도 문제를 먼저 해결");
    canvasClick(240, 220);
    assertVideoBlocked();
    click(byLabel("동작 문제 장면 1 선택"));
    choosePreset("still");
    expect(currentScenes[0].choreography).toBeUndefined();
    expect(currentScenes[0].elements).toEqual(original[0].elements);
    expect(warning()).toBeNull();
    expect(byTestId("create-music-video").disabled).toBe(false);
    click(byTestId("create-music-video"));
    const staticLabel = [...document.querySelectorAll(".mv-animation-options label")]
      .find((item) => item.textContent?.includes("애니메이션 없음"))!;
    act(() => staticLabel.querySelector<HTMLInputElement>("input")!.click());
    expect(byTestId("confirm-music-video").disabled).toBe(false);
    await act(async () => byTestId("confirm-music-video").click());
    expect(exporter).toHaveBeenCalledOnce();
    expect(exporter.mock.calls[0][0].animated).toBe(false);
  });
});

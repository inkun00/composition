// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MusicVideoScene } from "../video/musicVideoModel";
import { currentScenes, mount, open, byTestId, byLabel, click, endpoint,
  setupFeatureHarness, cleanupFeatureHarness } from "./MusicVideoFeature.testHarness";

const { exporter } = vi.hoisted(() => ({ exporter: vi.fn() }));
vi.mock("../video/exportMusicVideoMp4", () => ({ exportMusicVideoMp4: exporter }));
vi.mock("./SceneMotionPreview", () => ({ default: () => <div /> }));

function fixture(ends = [0, 1, 2, 3]): readonly MusicVideoScene[] {
  return ends.map((endMeasureIndex, index) => ({ id: `range-${index}`, endLyric: null,
    endMeasureIndex, background: "#ffffff", motion: "move-right", elements: [
      { id: `range-line-${index}`, tool: "line", color: "#123456", width: 8,
        points: [[10, 10, .5], [80, 90, .8]] }
    ] }));
}

function startpoint(value: string) {
  const select = document.querySelector<HTMLSelectElement>('[data-testid="scene-start-measure"]')!;
  act(() => { select.value = value; select.dispatchEvent(new Event("change", { bubbles: true })); });
}

function warning() { return document.querySelector('[data-testid="scene-range-warning"]'); }

beforeEach(() => setupFeatureHarness(exporter));
afterEach(cleanupFeatureHarness);

describe("장면 구간 충돌 편집", () => {
  it("모든 마디가 연결되어 있어도 겹친 마디를 고르고 원래 장면 범위를 보존한다", () => {
    const original = fixture();
    mount({ initialScenes: original });
    open();
    click(byLabel("2번 장면 선택"));
    const options = [...document.querySelectorAll<HTMLOptionElement>('[data-testid="scene-end-measure"] option')];
    expect(options.filter((option) => option.value !== "").every((option) => !option.disabled)).toBe(true);
    endpoint("2");
    expect(currentScenes.map((scene) => [scene.startMeasureIndex, scene.endMeasureIndex]))
      .toEqual([[0, 0], [1, 2], [2, 2], [3, 3]]);
    expect(warning()?.textContent).toContain("3마디");
    expect(warning()?.textContent).toMatch(/겹/);
    expect(byTestId("create-music-video").disabled).toBe(true);
    expect(byTestId("music-video-preview-open").disabled).toBe(true);
    expect(byTestId("scene-range-shift-forward").disabled).toBe(true);
    for (const [index, scene] of currentScenes.entries()) expect(scene.elements).toBe(original[index].elements);
    click(byLabel("그림 되돌리기"));
    expect(currentScenes).toEqual(original);
    expect(warning()).toBeNull();
    expect(byTestId("create-music-video").disabled).toBe(false);
    click(byLabel("그림 다시 실행"));
    expect(warning()).not.toBeNull();
    expect(byTestId("create-music-video").disabled).toBe(true);
    expect(exporter).not.toHaveBeenCalled();
  });

  it("여유 마디가 있으면 뒤 장면을 밀고 한 번에 되돌린다", () => {
    const original = fixture([0, 1, 2]);
    mount({ initialScenes: original });
    open();
    endpoint("1");
    const pending = currentScenes;
    expect(warning()).not.toBeNull();
    expect(byTestId("scene-range-shift-forward").disabled).toBe(false);
    click(byTestId("scene-range-shift-forward"));
    expect(currentScenes.map((scene) => [scene.startMeasureIndex, scene.endMeasureIndex]))
      .toEqual([[0, 1], [2, 2], [3, 3]]);
    expect(warning()).toBeNull();
    expect(byTestId("create-music-video").disabled).toBe(false);
    expect(currentScenes.map((scene) => scene.elements)).toEqual(original.map((scene) => scene.elements));
    click(byLabel("그림 되돌리기"));
    expect(currentScenes).toEqual(pending);
    expect(warning()).not.toBeNull();
    click(byLabel("그림 다시 실행"));
    expect(warning()).toBeNull();
  });

  it("겹친 장면을 삭제해 해결해도 나머지 그림과 전체 마디는 유지한다", () => {
    const original = fixture();
    mount({ initialScenes: original });
    open();
    click(byLabel("2번 장면 선택"));
    endpoint("2");
    click(byLabel("3번 장면 선택"));
    click(byTestId("delete-storyboard-scene"));
    expect(currentScenes.map((scene) => scene.id)).toEqual(["range-0", "range-1", "range-3"]);
    expect(currentScenes.map((scene) => [scene.startMeasureIndex, scene.endMeasureIndex]))
      .toEqual([[0, 0], [1, 2], [3, 3]]);
    expect(warning()).toBeNull();
    expect(byTestId("create-music-video").disabled).toBe(false);
    click(byLabel("그림 되돌리기"));
    expect(currentScenes).toHaveLength(4);
    expect(warning()).not.toBeNull();
  });

  it("앞 장면과 겹치는 시작 마디도 고를 수 있고 되돌리면 생성이 다시 가능하다", () => {
    mount({ initialScenes: fixture() });
    open();
    click(byLabel("2번 장면 선택"));
    startpoint("0");
    expect(currentScenes[1]).toMatchObject({ startMeasureIndex: 0, endMeasureIndex: 1 });
    expect(warning()?.textContent).toContain("1마디");
    expect(byTestId("create-music-video").disabled).toBe(true);
    startpoint("1");
    expect(warning()).toBeNull();
    expect(byTestId("create-music-video").disabled).toBe(false);
  });

  it("구간을 줄여 생긴 빈 마디도 알리고 이웃 시작 마디로 수정할 수 있다", () => {
    mount({ initialScenes: fixture([0, 2, 3]) });
    open();
    click(byLabel("2번 장면 선택"));
    endpoint("1");
    expect(currentScenes[2]).toMatchObject({ startMeasureIndex: 3, endMeasureIndex: 3 });
    expect(warning()?.textContent).toContain("3마디");
    expect(byTestId("create-music-video").disabled).toBe(true);
    click(byLabel("3번 장면 선택"));
    startpoint("2");
    expect(warning()).toBeNull();
    expect(byTestId("create-music-video").disabled).toBe(false);
  });
});

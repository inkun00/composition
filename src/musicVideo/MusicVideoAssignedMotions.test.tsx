// @vitest-environment jsdom

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MusicVideoPlan, MusicVideoScene } from "../video/musicVideoModel";
import { parseSceneFile, serializeSceneFile } from "./sceneFile";
import { currentScenes, onScenesChange, mount, open, byTestId, byLabel, click,
  setupFeatureHarness, cleanupFeatureHarness } from "./MusicVideoFeature.testHarness";

const exporter = vi.hoisted(() => vi.fn());
const preview = vi.hoisted(() => vi.fn());
vi.mock("../video/exportMusicVideoMp4", () => ({ exportMusicVideoMp4: exporter }));
vi.mock("./SceneMotionPreview", () => ({ default: (props: PreviewProps) => {
  preview(props);
  return <div data-testid="motion-preview" />;
} }));

type PreviewProps = Readonly<{
  scene: MusicVideoScene;
  bpm: number;
  plan: MusicVideoPlan;
  playRequest?: string;
}>;

function fixture(): MusicVideoScene {
  return {
    id: "assigned",
    background: "#fff8ed",
    motion: "still",
    endLyric: null,
    endMeasureIndex: 3,
    elements: [
      { id: "line", tool: "line", color: "#ea4335", width: 12, motion: "bounce",
        points: [[100, 120, .2], [300, 120, .9]] },
      { id: "rectangle", tool: "rectangle", color: "#4285f4", width: 8, motion: "rotate-in",
        points: [[380, 120, .3], [560, 300, .8]] },
      { id: "ellipse", tool: "ellipse", color: "#34a853", width: 10, motion: "sway",
        points: [[650, 160, .4], [840, 340, 1]] },
      { id: "brush", tool: "brush", color: "#fbbc04", width: 6,
        points: [[100, 400, .2], [200, 450, .7], [300, 420, .9]] },
      { id: "automatic", tool: "line", color: "#9c27b0", width: 4, motion: "auto",
        points: [[380, 400, .5], [560, 450, .7]] },
      { id: "stopped", tool: "rectangle", color: "#607d8b", width: 4, motion: "still",
        points: [[650, 420, .4], [840, 500, .8]] }
    ]
  };
}

function twoScenes(): readonly MusicVideoScene[] {
  const first = { ...fixture(), endMeasureIndex: 1 };
  const second = { ...fixture(), id: "other", background: "#eaf2ff",
    elements: fixture().elements.map((element) => ({ ...element, id: `other-${element.id}` })) };
  return [first, second];
}

function selectedIds() {
  return [...document.querySelectorAll<SVGElement>('[data-testid="scene-selection-outline"] [data-element-id]')]
    .map((element) => element.dataset.elementId);
}

function listedIds() {
  return [...document.querySelectorAll<HTMLButtonElement>('[data-testid="scene-assigned-motion-row"] .mv-assigned-select')]
    .map((button) => button.dataset.testid!.replace("scene-assigned-motion-select-", ""));
}

function latestPreview(): PreviewProps {
  return preview.mock.lastCall![0];
}

function addRowSelection(id: string) {
  act(() => byTestId(`scene-assigned-motion-select-${id}`)
    .dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: true })));
}

beforeEach(() => setupFeatureHarness(exporter));
afterEach(cleanupFeatureHarness);

describe("적용한 개체 동작 목록과 삭제", () => {
  it("실제 개체 순서대로 명시한 움직임만 나열하고 정지·자동·미지정 개체는 숨긴다", () => {
    const scene = fixture();
    mount({ initialScenes: [scene] });
    open();
    expect(document.querySelector('[data-testid="scene-assigned-motions"]')).not.toBeNull();
    expect(listedIds()).toEqual(["line", "rectangle", "ellipse"]);
    const rows = [...document.querySelectorAll('[data-testid="scene-assigned-motion-row"]')];
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("통통 뛰기"), expect.stringContaining("회전 등장"), expect.stringContaining("살랑살랑")
    ]);
    expect(rows.every((row) => row.querySelector("svg path"))).toBe(true);
    expect(currentScenes[0]).toBe(scene);
    expect(onScenesChange).not.toHaveBeenCalled();
    expect(byLabel("그림 되돌리기").disabled).toBe(true);
  });

  it("목록을 누르면 해당 그림 전체를 선택하고 Shift로 여러 개를 고르되 작품과 취소 기록은 바꾸지 않는다", () => {
    const scene = fixture();
    mount({ initialScenes: [scene] });
    open();
    click(byTestId("scene-assigned-motion-select-rectangle"));
    expect(selectedIds()).toEqual(["rectangle"]);
    expect(byTestId("scene-motion-scope-selection").getAttribute("aria-pressed")).toBe("true");
    expect(byTestId("scene-assigned-motion-select-rectangle").getAttribute("aria-pressed")).toBe("true");
    expect(byTestId("scene-select-tool").getAttribute("aria-pressed")).toBe("true");
    addRowSelection("line");
    expect(selectedIds()).toEqual(["line", "rectangle"]);
    expect(byTestId("scene-remove-selected-motions").disabled).toBe(false);
    expect(currentScenes[0]).toBe(scene);
    expect(onScenesChange).not.toHaveBeenCalled();
    expect(byLabel("그림 되돌리기").disabled).toBe(true);
  });

  it("선택한 동작만 삭제해 목록·미리보기·저장을 갱신하고 선택·다른 장면·원본을 유지하며 되돌릴 수 있다", () => {
    const initial = twoScenes();
    mount({ initialScenes: initial, bpm: 90 });
    open();
    click(byTestId("scene-assigned-motion-select-rectangle"));
    const beforePreview = latestPreview().playRequest;
    const remove = byTestId("scene-remove-element-motion-rectangle");
    act(() => remove.focus());
    click(remove);
    const removed = currentScenes;
    expect(listedIds()).toEqual(["line", "ellipse"]);
    expect(selectedIds()).toEqual(["rectangle"]);
    expect(removed[0].elements[1].motion).toBeUndefined();
    expect(removed[0].elements.map(({ motion: _motion, ...artwork }) => artwork))
      .toEqual(initial[0].elements.map(({ motion: _motion, ...artwork }) => artwork));
    expect(removed[0].elements.every((element, index) => element.points === initial[0].elements[index].points)).toBe(true);
    expect(removed[1]).toBe(initial[1]);
    expect(latestPreview()).toMatchObject({ scene: removed[0], bpm: 90 });
    expect(latestPreview().plan.scenes[0].scene).toBe(removed[0]);
    expect(latestPreview().playRequest).not.toBe(beforePreview);
    expect(document.activeElement).toBe(byTestId("scene-remove-element-motion-ellipse"));
    expect(parseSceneFile(serializeSceneFile(removed[0]))).toEqual(removed[0]);
    click(byLabel("그림 되돌리기"));
    expect(currentScenes).toEqual(initial);
    expect(listedIds()).toEqual(["line", "rectangle", "ellipse"]);
    expect(latestPreview().scene).toEqual(initial[0]);
    expect(byLabel("그림 되돌리기").disabled).toBe(true);
    click(byLabel("그림 다시 실행"));
    expect(currentScenes).toEqual(removed);
    expect(listedIds()).toEqual(["line", "ellipse"]);
    click(byLabel("2번 장면 선택"));
    expect(listedIds()).toEqual(["other-line", "other-rectangle", "other-ellipse"]);
    expect(currentScenes[1]).toEqual(initial[1]);
  });

  it("선택한 여러 동작을 한 번에 지우고 미선택 효과와 그림을 유지하며 한 번에 실행 취소한다", () => {
    const scene = fixture();
    mount({ initialScenes: [scene] });
    open();
    click(byTestId("scene-assigned-motion-select-line"));
    addRowSelection("rectangle");
    click(byTestId("scene-remove-selected-motions"));
    expect(listedIds()).toEqual(["ellipse"]);
    expect(selectedIds()).toEqual(["line", "rectangle"]);
    expect(currentScenes[0].elements.map((element) => element.motion))
      .toEqual([undefined, undefined, "sway", undefined, "auto", "still"]);
    expect(currentScenes[0].elements.slice(2)).toEqual(scene.elements.slice(2));
    expect(document.activeElement).toBe(byTestId("scene-remove-element-motion-ellipse"));
    expect(document.querySelector('[data-testid="scene-remove-selected-motions"]')).toBeNull();
    expect(onScenesChange).toHaveBeenCalledTimes(1);
    click(byLabel("그림 되돌리기"));
    expect(currentScenes[0]).toEqual(scene);
    expect(listedIds()).toEqual(["line", "rectangle", "ellipse"]);
    expect(byLabel("그림 되돌리기").disabled).toBe(true);
  });

  it("장면 기본 움직임이 있어도 마지막 개체 동작 삭제는 정지로 저장하고 빈 목록에서도 선택과 키보드 초점을 유지한다", () => {
    const original = fixture();
    const scene: MusicVideoScene = { ...original, motion: "pulse", elements: original.elements.slice(0, 1) };
    mount({ initialScenes: [scene] });
    open();
    click(byTestId("scene-assigned-motion-select-line"));
    click(byTestId("scene-remove-element-motion-line"));
    expect(listedIds()).toEqual([]);
    expect(document.querySelector('[data-testid="scene-assigned-motions-empty"]')).not.toBeNull();
    expect(currentScenes[0].motion).toBe("pulse");
    expect(currentScenes[0].elements[0]).toEqual({ ...scene.elements[0], motion: "still" });
    expect(selectedIds()).toEqual(["line"]);
    expect(document.activeElement?.tagName).toBe("H5");
    expect(latestPreview().scene.elements[0].motion).toBe("still");
    expect(parseSceneFile(serializeSceneFile(currentScenes[0]))).toEqual(currentScenes[0]);
  });

  it("영상 제작 중에는 개체 선택·단일 삭제·선택 삭제를 잠그고 저장한 효과를 바꾸지 않는다", async () => {
    let finish!: (blob: Blob) => void;
    exporter.mockImplementation(() => new Promise<Blob>((resolve) => { finish = resolve; }));
    const scene = fixture();
    mount({ initialScenes: [scene] });
    open();
    click(byTestId("scene-assigned-motion-select-line"));
    addRowSelection("rectangle");
    click(byTestId("create-music-video"));
    await act(async () => byTestId("confirm-music-video").click());
    expect(byTestId("scene-assigned-motion-select-ellipse").disabled).toBe(true);
    expect(byTestId("scene-remove-element-motion-line").disabled).toBe(true);
    expect(byTestId("scene-remove-selected-motions").disabled).toBe(true);
    click(byTestId("scene-remove-element-motion-line"));
    click(byTestId("scene-remove-selected-motions"));
    click(byTestId("scene-assigned-motion-select-ellipse"));
    expect(currentScenes[0]).toBe(scene);
    expect(onScenesChange).not.toHaveBeenCalled();
    expect(selectedIds()).toEqual(["line", "rectangle"]);
    expect(exporter.mock.calls[0][0].scenes).toEqual([scene]);
    await act(async () => finish(new Blob(["video"], { type: "video/mp4" })));
    expect(byTestId("scene-remove-element-motion-line").disabled).toBe(false);
  });
});

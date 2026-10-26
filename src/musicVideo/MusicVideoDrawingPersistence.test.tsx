// @vitest-environment jsdom

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MusicVideoScene } from "../video/musicVideoModel";
import { byLabel, byText, canvasPointer, cleanupFeatureHarness, click, currentScenes, mount, open,
  setupFeatureHarness } from "./MusicVideoFeature.testHarness";

const exporter = vi.hoisted(() => vi.fn());
vi.mock("../video/exportMusicVideoMp4", () => ({ exportMusicVideoMp4: exporter }));
vi.mock("./SceneMotionPreview", () => ({ default: () => <div /> }));

beforeEach(() => setupFeatureHarness(exporter));
afterEach(() => { cleanupFeatureHarness(); vi.useRealTimers(); });

function blank(id: string, endMeasureIndex: number): MusicVideoScene {
  return { id, endMeasureIndex, endLyric: null, background: "#ffffff", motion: "still", elements: [] };
}

describe("장면 그림의 프로젝트 체크포인트", () => {
  it("펜을 떼기 전부터 프로젝트에 저장하고 여러 체크포인트를 한 번에 실행 취소한다", () => {
    vi.useFakeTimers();
    mount();
    open();
    canvasPointer("pointerdown", 100, 100);
    expect(currentScenes[0].elements[0].points).toEqual([[100, 100, .5]]);
    for (let point = 1; point <= 8; point++) canvasPointer("pointermove", 100 + point * 10, 100 + point * 5);
    expect(currentScenes[0].elements[0].points).toHaveLength(1);
    act(() => vi.advanceTimersByTime(120));
    expect(currentScenes[0].elements).toHaveLength(1);
    expect(currentScenes[0].elements[0].points).toHaveLength(9);
    canvasPointer("pointerup", 200, 150);
    const completed = currentScenes;
    click(byLabel("그림 되돌리기"));
    expect(currentScenes[0].elements).toHaveLength(0);
    click(byLabel("그림 다시 실행"));
    expect(currentScenes).toEqual(completed);
  });

  it("그리는 중 다른 장면으로 이동해도 원래 장면에 저장하고 새 장면을 덮어쓰지 않는다", () => {
    mount({ initialScenes: [blank("first", 1), blank("second", 3)] });
    open();
    canvasPointer("pointerdown", 100, 100);
    canvasPointer("pointermove", 150, 130);
    click(byLabel("2번 장면 선택"));
    expect(currentScenes.map((scene) => scene.id)).toEqual(["first", "second"]);
    expect(currentScenes[0].elements[0].points).toEqual([[100, 100, .5], [150, 130, .5]]);
    expect(currentScenes[1].elements).toHaveLength(0);
    expect(byLabel("2번 장면 선택").getAttribute("aria-pressed")).toBe("true");
  });

  it("체크포인트 전 실행 취소도 마지막 입력을 보존해 다시 실행할 수 있다", () => {
    mount();
    open();
    canvasPointer("pointerdown", 100, 100);
    canvasPointer("pointermove", 150, 130);
    expect(currentScenes[0].elements[0].points).toHaveLength(1);
    click(byLabel("그림 되돌리기"));
    expect(currentScenes[0].elements).toHaveLength(0);
    click(byLabel("그림 다시 실행"));
    expect(currentScenes[0].elements[0].points).toEqual([[100, 100, .5], [150, 130, .5]]);
  });

  it("완료하지 않은 그림도 팝업을 닫고 다시 열면 남아 있다", () => {
    mount();
    open();
    canvasPointer("pointerdown", 100, 100);
    canvasPointer("pointermove", 150, 130);
    click(byLabel("장면 그리기 닫기"));
    expect(currentScenes[0].elements[0].points).toEqual([[100, 100, .5], [150, 130, .5]]);
    open();
    expect(document.querySelectorAll('[data-testid="scene-paint-canvas"] > path')).toHaveLength(1);
  });

  it("진행 중이던 장면을 삭제할 때 캔버스 정리가 삭제한 장면을 되살리지 않는다", () => {
    mount({ initialScenes: [blank("first", 1), blank("second", 3)] });
    open();
    canvasPointer("pointerdown", 100, 100);
    canvasPointer("pointermove", 150, 130);
    click(byText("이 장면 삭제"));
    expect(currentScenes).toEqual([blank("second", 3)]);
    click(byLabel("그림 되돌리기"));
    expect(currentScenes[0].id).toBe("first");
    expect(currentScenes[0].elements[0].points).toEqual([[100, 100, .5], [150, 130, .5]]);
    expect(currentScenes[1]).toEqual(blank("second", 3));
  });
});
